//! Atelier One studio contract.
//!
//! One AI artist runs an art studio as a business for a human owner.
//! * An owner opens a studio with a NEAR budget and rules: style, price floor, daily AI spend cap,
//!   revenue split (owner bps), resale royalty (bps) and a kill switch.
//! * The agent account (`agent_id`, used only through a function-call key) can:
//!   - `agent_charge_inference`: pay for AI inference out of the studio budget (capped per day),
//!   - `agent_mint`: mint a NEP-171 artwork (storage paid from the studio budget),
//!   - `agent_list`: list it for sale at or above the owner's floor.
//!   Every agent method fails while the kill switch is engaged.
//! * Anyone can `buy` a listed work. Primary sales are split automatically: `split_owner_bps`
//!   goes to the owner's wallet, the rest refills the studio's AI budget. Resales pay the studio
//!   a royalty (NEP-199 `nft_payout` for external marketplaces, enforced in-contract here).
//! * Every money movement emits an `atelier_one` NEP-297 event, so the public ledger is rebuilt
//!   from on-chain logs.

use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    assert_one_yocto, env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault,
    Promise, PromiseOrValue,
};
use std::collections::HashMap;

const NS_PER_DAY: u64 = 86_400_000_000_000;
const MIN_FLOOR: u128 = 10_000_000_000_000_000_000_000; // 0.01 NEAR
const MIN_OPEN_DEPOSIT: u128 = 100_000_000_000_000_000_000_000; // 0.1 NEAR
const MAX_ROYALTY_BPS: u16 = 2_500;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    NonFungibleToken,
    Metadata,
    TokenMetadata,
    Enumeration,
    Approval,
    Studios,
    Listings,
    TokenStudio,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Studio {
    pub owner_id: AccountId,
    pub name: String,
    pub style: String,
    pub floor: U128,
    pub split_owner_bps: u16,
    pub royalty_bps: u16,
    pub daily_ai_cap: U128,
    pub budget: U128,
    pub spent_today: U128,
    pub day: U64,
    pub kill_switch: bool,
    pub works_minted: u32,
    pub works_sold: u32,
    pub ai_spent_total: U128,
    pub storage_spent_total: U128,
    pub revenue_total: U128,
    pub owner_earned_total: U128,
    pub studio_earned_total: U128,
    pub royalties_total: U128,
    pub opened_at_ms: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Listing {
    pub token_id: TokenId,
    pub seller_id: AccountId,
    pub studio_id: AccountId,
    pub price: U128,
    pub primary: bool,
    pub listed_at_ms: U64,
}

#[near(serializers = [json])]
pub struct Payout {
    pub payout: HashMap<AccountId, U128>,
}

#[near(serializers = [json])]
pub struct Config {
    pub admin_id: AccountId,
    pub agent_id: AccountId,
    pub studios: u32,
    pub total_supply: U128,
    pub listings: u32,
    pub next_token: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    admin_id: AccountId,
    agent_id: AccountId,
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    studios: IterableMap<AccountId, Studio>,
    listings: IterableMap<TokenId, Listing>,
    token_studio: LookupMap<TokenId, AccountId>,
    next_token: u64,
}

fn emit(event: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard":"atelier_one","version":"1.0.0","event":event,"data":[data]})
    ));
}

fn bps(amount: u128, bps: u16) -> u128 {
    amount * bps as u128 / 10_000
}

fn pay(to: &AccountId, amount: u128) {
    if amount > 0 {
        let _ = Promise::new(to.clone()).transfer(NearToken::from_yoctonear(amount));
    }
}

#[near]
impl Contract {
    #[init]
    pub fn new(admin_id: AccountId, agent_id: AccountId) -> Self {
        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Atelier One".to_string(),
            symbol: "ATELIER".to_string(),
            icon: Some("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23C8F169'/%3E%3Ccircle cx='40' cy='26' r='12' fill='%23FF5A36'/%3E%3Cpath d='M8 48 Q32 30 56 48' stroke='%230E0E0E' stroke-width='5' fill='none'/%3E%3C/svg%3E".to_string()),
            base_uri: None,
            reference: None,
            reference_hash: None,
        };
        Self {
            admin_id: admin_id.clone(),
            agent_id,
            tokens: NonFungibleToken::new(
                StorageKey::NonFungibleToken,
                admin_id,
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            studios: IterableMap::new(StorageKey::Studios),
            listings: IterableMap::new(StorageKey::Listings),
            token_studio: LookupMap::new(StorageKey::TokenStudio),
            next_token: 1,
        }
    }

    // ---------------- owner ----------------

    /// Open (or re-open) your studio. The attached deposit becomes the studio's AI/mint budget.
    #[payable]
    pub fn open_studio(
        &mut self,
        name: String,
        style: String,
        floor: U128,
        split_owner_bps: u16,
        royalty_bps: u16,
        daily_ai_cap: U128,
    ) -> Studio {
        let owner = env::predecessor_account_id();
        let deposit = env::attached_deposit().as_yoctonear();
        Self::validate_rules(&name, &style, floor.0, split_owner_bps, royalty_bps);
        let now = env::block_timestamp();
        let studio = match self.studios.get(&owner) {
            Some(s) => {
                let mut s = s.clone();
                s.name = name;
                s.style = style;
                s.floor = floor;
                s.split_owner_bps = split_owner_bps;
                s.royalty_bps = royalty_bps;
                s.daily_ai_cap = daily_ai_cap;
                s.budget = U128(s.budget.0 + deposit);
                s
            }
            None => {
                require!(deposit >= MIN_OPEN_DEPOSIT, "Attach at least 0.1 NEAR as the studio budget");
                Studio {
                    owner_id: owner.clone(),
                    name,
                    style,
                    floor,
                    split_owner_bps,
                    royalty_bps,
                    daily_ai_cap,
                    budget: U128(deposit),
                    spent_today: U128(0),
                    day: U64(now / NS_PER_DAY),
                    kill_switch: false,
                    works_minted: 0,
                    works_sold: 0,
                    ai_spent_total: U128(0),
                    storage_spent_total: U128(0),
                    revenue_total: U128(0),
                    owner_earned_total: U128(0),
                    studio_earned_total: U128(0),
                    royalties_total: U128(0),
                    opened_at_ms: U64(now / 1_000_000),
                }
            }
        };
        self.studios.insert(owner.clone(), studio.clone());
        emit(
            "studio_opened",
            json!({"studio_id": owner, "deposit": U128(deposit), "budget": studio.budget,
                   "floor": studio.floor, "split_owner_bps": split_owner_bps,
                   "royalty_bps": royalty_bps, "daily_ai_cap": studio.daily_ai_cap, "style": studio.style}),
        );
        studio
    }

    /// Anyone (owner or a patron) can top up a studio's budget.
    #[payable]
    pub fn fund_studio(&mut self, studio_id: AccountId) -> U128 {
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit > 0, "Attach NEAR to fund the studio");
        let mut s = self.studio_or_panic(&studio_id);
        s.budget = U128(s.budget.0 + deposit);
        self.studios.insert(studio_id.clone(), s.clone());
        emit(
            "studio_funded",
            json!({"studio_id": studio_id, "from": env::predecessor_account_id(), "amount": U128(deposit), "budget": s.budget}),
        );
        s.budget
    }

    /// Owner: change any rule. Omitted fields keep their value.
    pub fn update_rules(
        &mut self,
        style: Option<String>,
        floor: Option<U128>,
        split_owner_bps: Option<u16>,
        royalty_bps: Option<u16>,
        daily_ai_cap: Option<U128>,
    ) -> Studio {
        let owner = env::predecessor_account_id();
        let mut s = self.studio_or_panic(&owner);
        if let Some(v) = style { s.style = v; }
        if let Some(v) = floor { s.floor = v; }
        if let Some(v) = split_owner_bps { s.split_owner_bps = v; }
        if let Some(v) = royalty_bps { s.royalty_bps = v; }
        if let Some(v) = daily_ai_cap { s.daily_ai_cap = v; }
        Self::validate_rules(&s.name, &s.style, s.floor.0, s.split_owner_bps, s.royalty_bps);
        self.studios.insert(owner.clone(), s.clone());
        emit("rules_updated", json!({"studio_id": owner, "floor": s.floor, "split_owner_bps": s.split_owner_bps,
            "royalty_bps": s.royalty_bps, "daily_ai_cap": s.daily_ai_cap, "style": s.style}));
        s
    }

    /// Owner: engage (true) or release (false) the kill switch. While engaged the agent can
    /// not spend, mint or list anything for this studio.
    pub fn set_kill_switch(&mut self, engaged: bool) -> bool {
        let owner = env::predecessor_account_id();
        let mut s = self.studio_or_panic(&owner);
        s.kill_switch = engaged;
        self.studios.insert(owner.clone(), s);
        emit("kill_switch", json!({"studio_id": owner, "engaged": engaged}));
        engaged
    }

    /// Owner: withdraw unspent budget back to the owner wallet.
    pub fn withdraw_budget(&mut self, amount: U128) -> U128 {
        let owner = env::predecessor_account_id();
        let mut s = self.studio_or_panic(&owner);
        require!(amount.0 > 0 && amount.0 <= s.budget.0, "Amount exceeds studio budget");
        s.budget = U128(s.budget.0 - amount.0);
        self.studios.insert(owner.clone(), s.clone());
        pay(&owner, amount.0);
        emit("budget_withdrawn", json!({"studio_id": owner, "amount": amount, "budget": s.budget}));
        s.budget
    }

    // ---------------- agent (function-call key only) ----------------

    /// Agent pays for AI inference from the studio budget. The NEAR is moved to the agent's
    /// own account, which settles with the inference provider. Capped per UTC day.
    pub fn agent_charge_inference(
        &mut self,
        studio_id: AccountId,
        amount: U128,
        model: String,
        provider: String,
        job_id: String,
    ) -> Studio {
        self.assert_agent();
        let mut s = self.live_studio(&studio_id);
        require!(amount.0 > 0, "Zero charge");
        require!(
            s.spent_today.0 + amount.0 <= s.daily_ai_cap.0,
            "Daily AI spend cap reached"
        );
        require!(amount.0 <= s.budget.0, "Studio budget too low");
        s.budget = U128(s.budget.0 - amount.0);
        s.spent_today = U128(s.spent_today.0 + amount.0);
        s.ai_spent_total = U128(s.ai_spent_total.0 + amount.0);
        self.studios.insert(studio_id.clone(), s.clone());
        pay(&self.agent_id.clone(), amount.0);
        emit("inference_paid", json!({"studio_id": studio_id, "amount": amount, "model": model,
            "provider": provider, "job_id": job_id, "budget": s.budget, "spent_today": s.spent_today}));
        s
    }

    /// Agent mints a new artwork owned by the studio owner. Storage is paid from the budget.
    pub fn agent_mint(&mut self, studio_id: AccountId, metadata: TokenMetadata) -> Token {
        self.assert_agent();
        let mut s = self.live_studio(&studio_id);
        require!(metadata.title.is_some() && metadata.media.is_some(), "Title and media required");
        let token_id = format!("{}", self.next_token);
        self.next_token += 1;
        let before = env::storage_usage();
        let mut md = metadata;
        md.issued_at = Some(format!("{}", env::block_timestamp() / 1_000_000));
        md.copies = Some(1);
        let token = self.tokens.internal_mint_with_refund(token_id.clone(), studio_id.clone(), Some(md), None);
        self.token_studio.insert(token_id.clone(), studio_id.clone());
        self.token_studio.flush();
        let used = env::storage_usage().saturating_sub(before) + 120; // + studio/map overhead
        let cost = env::storage_byte_cost().as_yoctonear() * used as u128;
        require!(cost <= s.budget.0, "Studio budget too low to pay mint storage");
        s.budget = U128(s.budget.0 - cost);
        s.storage_spent_total = U128(s.storage_spent_total.0 + cost);
        s.works_minted += 1;
        self.studios.insert(studio_id.clone(), s.clone());
        NftMint { owner_id: &studio_id, token_ids: &[&token_id], memo: Some("atelier-one") }.emit();
        emit("minted", json!({"studio_id": studio_id, "token_id": token_id, "storage_cost": U128(cost),
            "title": token.metadata.as_ref().and_then(|m| m.title.clone()), "budget": s.budget}));
        token
    }

    /// Agent lists a freshly minted work at or above the owner's floor.
    pub fn agent_list(&mut self, token_id: TokenId, price: U128) -> Listing {
        self.assert_agent();
        let studio_id = self.token_studio.get(&token_id).cloned().unwrap_or_else(|| env::panic_str("Unknown token"));
        let s = self.live_studio(&studio_id);
        require!(price.0 >= s.floor.0, "Price is below the owner's floor");
        let owner = self.tokens.owner_by_id.get(&token_id).unwrap_or_else(|| env::panic_str("Token not found"));
        require!(owner == studio_id, "Studio no longer owns this work");
        let listing = Listing {
            token_id: token_id.clone(),
            seller_id: studio_id.clone(),
            studio_id: studio_id.clone(),
            price,
            primary: true,
            listed_at_ms: U64(env::block_timestamp() / 1_000_000),
        };
        self.listings.insert(token_id.clone(), listing.clone());
        emit("listed", json!({"studio_id": studio_id, "token_id": token_id, "price": price, "floor": s.floor, "primary": true}));
        listing
    }

    // ---------------- market ----------------

    /// Collectors resell a work they own. A royalty goes back to the studio on sale.
    pub fn list_for_resale(&mut self, token_id: TokenId, price: U128) -> Listing {
        let seller = env::predecessor_account_id();
        let owner = self.tokens.owner_by_id.get(&token_id).unwrap_or_else(|| env::panic_str("Token not found"));
        require!(owner == seller, "Only the token owner can list it");
        require!(price.0 >= MIN_FLOOR, "Price too low");
        let studio_id = self.token_studio.get(&token_id).cloned().unwrap_or_else(|| env::panic_str("Unknown token"));
        let primary = seller == studio_id;
        let listing = Listing { token_id: token_id.clone(), seller_id: seller, studio_id: studio_id.clone(), price, primary,
            listed_at_ms: U64(env::block_timestamp() / 1_000_000) };
        self.listings.insert(token_id.clone(), listing.clone());
        emit("listed", json!({"studio_id": studio_id, "token_id": token_id, "price": price, "primary": primary}));
        listing
    }

    pub fn delist(&mut self, token_id: TokenId) {
        let l = self.listings.get(&token_id).cloned().unwrap_or_else(|| env::panic_str("Not listed"));
        require!(env::predecessor_account_id() == l.seller_id, "Only the seller can delist");
        self.listings.remove(&token_id);
        emit("delisted", json!({"token_id": token_id}));
    }

    /// Buy a listed work. Attach at least the price; any excess is refunded.
    /// Primary sale: owner gets split_owner_bps, the rest refills the studio's AI budget.
    /// Resale: seller gets price minus royalty; royalty is split owner/studio the same way.
    #[payable]
    pub fn buy(&mut self, token_id: TokenId) -> serde_json::Value {
        let buyer = env::predecessor_account_id();
        let deposit = env::attached_deposit().as_yoctonear();
        let l = self.listings.get(&token_id).cloned().unwrap_or_else(|| env::panic_str("Not for sale"));
        require!(deposit >= l.price.0, "Attached deposit is below the price");
        require!(buyer != l.seller_id, "Seller cannot buy their own listing");
        let owner = self.tokens.owner_by_id.get(&token_id).unwrap_or_else(|| env::panic_str("Token not found"));
        require!(owner == l.seller_id, "Stale listing");
        self.listings.remove(&token_id);
        self.tokens.internal_transfer(&l.seller_id, &buyer, &token_id, None, Some("atelier-one sale".into()));

        let price = l.price.0;
        let mut s = self.studio_or_panic(&l.studio_id);
        let (royalty, seller_amount) = if l.primary { (0u128, 0u128) } else {
            let r = bps(price, s.royalty_bps);
            (r, price - r)
        };
        let shareable = if l.primary { price } else { royalty };
        let owner_amount = bps(shareable, s.split_owner_bps);
        let studio_amount = shareable - owner_amount;

        s.budget = U128(s.budget.0 + studio_amount);
        s.owner_earned_total = U128(s.owner_earned_total.0 + owner_amount);
        s.studio_earned_total = U128(s.studio_earned_total.0 + studio_amount);
        if l.primary {
            s.works_sold += 1;
            s.revenue_total = U128(s.revenue_total.0 + price);
        } else {
            s.royalties_total = U128(s.royalties_total.0 + royalty);
        }
        self.studios.insert(l.studio_id.clone(), s.clone());

        pay(&s.owner_id, owner_amount);
        if !l.primary { pay(&l.seller_id, seller_amount); }
        pay(&buyer, deposit - price);

        emit(if l.primary { "sold" } else { "resold" }, json!({
            "studio_id": l.studio_id, "token_id": token_id, "buyer_id": buyer, "seller_id": l.seller_id,
            "price": U128(price), "royalty": U128(royalty), "seller_amount": U128(seller_amount)}));
        emit("split_paid", json!({
            "studio_id": l.studio_id, "token_id": token_id, "owner_id": s.owner_id,
            "owner_amount": U128(owner_amount), "studio_amount": U128(studio_amount),
            "split_owner_bps": s.split_owner_bps, "budget": s.budget}));
        json!({"token_id": token_id, "price": U128(price), "owner_amount": U128(owner_amount),
               "studio_amount": U128(studio_amount), "royalty": U128(royalty)})
    }

    // ---------------- NEP-199 royalties ----------------

    pub fn nft_payout(&self, token_id: TokenId, balance: U128, max_len_payout: Option<u32>) -> Payout {
        let owner = self.tokens.owner_by_id.get(&token_id).unwrap_or_else(|| env::panic_str("Token not found"));
        let studio_id = self.token_studio.get(&token_id).cloned().unwrap_or_else(|| env::panic_str("Unknown token"));
        let s = self.studio_or_panic(&studio_id);
        let mut payout = HashMap::new();
        if owner == studio_id {
            payout.insert(owner, balance);
        } else {
            require!(max_len_payout.unwrap_or(2) >= 2, "max_len_payout too small");
            let royalty = bps(balance.0, s.royalty_bps);
            payout.insert(studio_id, U128(royalty));
            *payout.entry(owner).or_insert(U128(0)) = U128(balance.0 - royalty);
        }
        Payout { payout }
    }

    #[payable]
    pub fn nft_transfer_payout(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> Payout {
        assert_one_yocto();
        let payout = self.nft_payout(token_id.clone(), balance, max_len_payout);
        self.listings.remove(&token_id);
        self.tokens.internal_transfer(&env::predecessor_account_id(), &receiver_id, &token_id, approval_id, memo);
        payout
    }

    // ---------------- views ----------------

    pub fn get_config(&self) -> Config {
        Config {
            admin_id: self.admin_id.clone(),
            agent_id: self.agent_id.clone(),
            studios: self.studios.len(),
            total_supply: self.tokens.nft_total_supply(),
            listings: self.listings.len(),
            next_token: U64(self.next_token),
        }
    }

    pub fn get_studio(&self, studio_id: AccountId) -> Option<Studio> {
        self.studios.get(&studio_id).cloned().map(|mut s| {
            if s.day.0 != env::block_timestamp() / NS_PER_DAY { s.spent_today = U128(0); }
            s
        })
    }

    pub fn get_studios(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Studio> {
        self.studios.values().skip(from_index.unwrap_or(0) as usize).take(limit.unwrap_or(50) as usize).cloned().collect()
    }

    pub fn get_listing(&self, token_id: TokenId) -> Option<Listing> {
        self.listings.get(&token_id).cloned()
    }

    pub fn get_listings(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Listing> {
        self.listings.values().skip(from_index.unwrap_or(0) as usize).take(limit.unwrap_or(50) as usize).cloned().collect()
    }

    pub fn get_token_studio(&self, token_id: TokenId) -> Option<AccountId> {
        self.token_studio.get(&token_id).cloned()
    }

    // ---------------- admin ----------------

    /// Admin can rotate the agent account (e.g. key compromise).
    pub fn set_agent(&mut self, agent_id: AccountId) {
        require!(env::predecessor_account_id() == self.admin_id, "Admin only");
        self.agent_id = agent_id;
    }

    // ---------------- internals ----------------

    fn validate_rules(name: &str, style: &str, floor: u128, split: u16, royalty: u16) {
        require!(name.len() <= 64 && style.len() <= 280, "Name/style too long");
        require!(floor >= MIN_FLOOR, "Floor must be at least 0.01 NEAR");
        require!(split <= 10_000, "split_owner_bps must be <= 10000");
        require!(royalty <= MAX_ROYALTY_BPS, "royalty_bps must be <= 2500");
    }

    fn assert_agent(&self) {
        require!(env::predecessor_account_id() == self.agent_id, "Agent only");
    }

    fn studio_or_panic(&self, id: &AccountId) -> Studio {
        self.studios.get(id).cloned().unwrap_or_else(|| env::panic_str("Studio not found"))
    }

    fn live_studio(&mut self, id: &AccountId) -> Studio {
        let mut s = self.studio_or_panic(id);
        require!(!s.kill_switch, "Kill switch engaged: the owner has paused this agent");
        let today = env::block_timestamp() / NS_PER_DAY;
        if s.day.0 != today {
            s.day = U64(today);
            s.spent_today = U128(0);
        }
        s
    }
}

// ---------- NEP-171 core ----------
#[near]
impl NonFungibleTokenCore for Contract {
    #[payable]
    fn nft_transfer(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>) {
        self.listings.remove(&token_id);
        self.tokens.nft_transfer(receiver_id, token_id, approval_id, memo)
    }

    #[payable]
    fn nft_transfer_call(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>, msg: String) -> PromiseOrValue<bool> {
        self.listings.remove(&token_id);
        self.tokens.nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for Contract {
    #[private]
    fn nft_resolve_transfer(&mut self, previous_owner_id: AccountId, receiver_id: AccountId, token_id: TokenId, approved_account_ids: Option<HashMap<AccountId, u64>>) -> bool {
        self.tokens.nft_resolve_transfer(previous_owner_id, receiver_id, token_id, approved_account_ids)
    }
}

#[near]
impl NonFungibleTokenApproval for Contract {
    #[payable]
    fn nft_approve(&mut self, token_id: TokenId, account_id: AccountId, msg: Option<String>) -> Option<Promise> {
        self.tokens.nft_approve(token_id, account_id, msg)
    }
    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.tokens.nft_revoke(token_id, account_id)
    }
    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.tokens.nft_revoke_all(token_id)
    }
    fn nft_is_approved(&self, token_id: TokenId, approved_account_id: AccountId, approval_id: Option<u64>) -> bool {
        self.tokens.nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Contract {
    fn nft_total_supply(&self) -> U128 { self.tokens.nft_total_supply() }
    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> { self.tokens.nft_tokens(from_index, limit) }
    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 { self.tokens.nft_supply_for_owner(account_id) }
    fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata { self.metadata.get().unwrap() }
}

#[allow(dead_code)]
fn _unused(_: Base64VecU8) {}
