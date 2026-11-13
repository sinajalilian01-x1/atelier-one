//! Atelier One studio contract.
//!
//! One AI artist runs an art studio as a business for a human owner.
//! * An owner opens a studio with a NEAR budget and rules: style, price floor, daily AI spend cap,
//!   revenue split (owner bps), resale royalty (bps) and a kill switch.
//! * The agent account (`agent_id`, used only through a function-call key) can:
//!   - `agent_charge_inference`: pay for AI inference out of the studio budget (capped per day).
//!     The fee goes to the platform `treasury_id` (which settles with the inference provider),
//!     never to the agent's own account,
//!   - `agent_mint`: mint a NEP-171 artwork (storage paid from the studio budget),
//!   - `agent_list`: list it for sale at or above the owner's floor.
//!   Every agent method fails while the kill switch is engaged.
//! * Anyone can `buy` a listed work. Primary sales are split automatically: `split_owner_bps`
//!   goes to the owner's wallet, the rest refills the studio's AI budget. Resales pay the studio
//!   a royalty. External marketplaces get the same split through NEP-199 `nft_payout` /
//!   `nft_transfer_payout`: the studio's share is paid to this contract and credited to the
//!   studio budget, so no sale path routes money around the budget.
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
    Styles,
    Commissions,
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

/// An art style the studio can paint in. `artist_id` is the human artist whose style it is (or
/// None for the studio's own AI house styles). Only styles marked `authorized` (the artist agreed
/// and the admin recorded the license note) can be commissioned. The artist gets `artist_bps` of
/// every commission painted in their style, paid on-chain at delivery.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Style {
    pub id: String,
    pub name: String,
    pub artist_id: Option<AccountId>,
    pub artist_bps: u16,
    pub min_price: U128,
    pub authorized: bool,
    pub license: String,
    pub works: u32,
    pub artist_earned_total: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum CommissionStatus { Open, Delivered, Refunded }

/// A paid commission. The buyer's NEAR stays in escrow on this contract until the agent delivers
/// (mints the work straight to the buyer and splits the payment) or the commission is refunded.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Commission {
    pub id: U64,
    pub buyer_id: AccountId,
    pub studio_id: AccountId,
    pub style_id: String,
    pub price: U128,
    pub brief_hash: String,
    pub status: CommissionStatus,
    pub token_id: Option<TokenId>,
    pub created_at_ms: U64,
}

const COMMISSION_TIMEOUT_MS: u64 = 30 * 60 * 1000;
const MAX_ARTIST_BPS: u16 = 5_000;

/// How a commission of `price` is divided: (artist, owner, studio budget).
/// The artist (if any) takes `artist_bps` first; the rest is split owner/studio like a primary sale.
pub fn commission_split(price: u128, artist_bps: u16, has_artist: bool, split_owner_bps: u16) -> (u128, u128, u128) {
    let artist = if has_artist { bps(price, artist_bps) } else { 0 };
    let rest = price - artist;
    let owner = bps(rest, split_owner_bps);
    (artist, owner, rest - owner)
}

#[near(serializers = [json])]
pub struct Payout {
    pub payout: HashMap<AccountId, U128>,
}

#[near(serializers = [json])]
pub struct Config {
    pub admin_id: AccountId,
    pub agent_id: AccountId,
    pub treasury_id: AccountId,
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
    treasury_id: AccountId,
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    studios: IterableMap<AccountId, Studio>,
    listings: IterableMap<TokenId, Listing>,
    token_studio: LookupMap<TokenId, AccountId>,
    next_token: u64,
    styles: IterableMap<String, Style>,
    commissions: IterableMap<u64, Commission>,
    next_commission: u64,
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

/// How a sale of `price` is divided: (seller, owner, studio budget, royalty).
/// Primary sale: owner gets `split_owner_bps` of the price, the studio budget keeps the rest.
/// Resale: the seller gets price minus royalty; the royalty is split owner/studio the same way.
pub fn sale_split(price: u128, primary: bool, royalty_bps: u16, split_owner_bps: u16) -> (u128, u128, u128, u128) {
    let (royalty, seller) = if primary { (0, 0) } else {
        let r = bps(price, royalty_bps);
        (r, price - r)
    };
    let shareable = if primary { price } else { royalty };
    let owner = bps(shareable, split_owner_bps);
    (seller, owner, shareable - owner, royalty)
}

const PINATA_BASE_URI: &str = "https://gateway.pinata.cloud/ipfs";

/// State layout of the deployed v2 contract (before commissions and styles).
#[near(serializers = [borsh])]
struct ContractV2 {
    admin_id: AccountId,
    agent_id: AccountId,
    treasury_id: AccountId,
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    studios: IterableMap<AccountId, Studio>,
    listings: IterableMap<TokenId, Listing>,
    token_studio: LookupMap<TokenId, AccountId>,
    next_token: u64,
}

fn pay(to: &AccountId, amount: u128) {
    if amount > 0 {
        let _ = Promise::new(to.clone()).transfer(NearToken::from_yoctonear(amount));
    }
}

#[near]
impl Contract {
    #[init]
    pub fn new(admin_id: AccountId, agent_id: AccountId, treasury_id: AccountId) -> Self {
        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Atelier One".to_string(),
            symbol: "ATELIER".to_string(),
            icon: Some("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23C8F169'/%3E%3Ccircle cx='40' cy='26' r='12' fill='%23FF5A36'/%3E%3Cpath d='M8 48 Q32 30 56 48' stroke='%230E0E0E' stroke-width='5' fill='none'/%3E%3C/svg%3E".to_string()),
            base_uri: Some(PINATA_BASE_URI.to_string()),
            reference: None,
            reference_hash: None,
        };
        Self {
            admin_id: admin_id.clone(),
            agent_id,
            treasury_id,
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
            styles: IterableMap::new(StorageKey::Styles),
            commissions: IterableMap::new(StorageKey::Commissions),
            next_commission: 1,
        }
    }

    /// In-place upgrade from v2 state: keeps every token, studio and listing, and adds the
    /// style registry and commission escrow.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let old: ContractV2 = env::state_read().unwrap_or_else(|| env::panic_str("No v2 state"));
        Self {
            admin_id: old.admin_id,
            agent_id: old.agent_id,
            treasury_id: old.treasury_id,
            tokens: old.tokens,
            metadata: old.metadata,
            studios: old.studios,
            listings: old.listings,
            token_studio: old.token_studio,
            next_token: old.next_token,
            styles: IterableMap::new(StorageKey::Styles),
            commissions: IterableMap::new(StorageKey::Commissions),
            next_commission: 1,
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

    /// Agent pays for AI inference from the studio budget. The NEAR goes to the platform
    /// treasury (which pays the inference provider), not to the agent. Capped per UTC day.
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
        pay(&self.treasury_id.clone(), amount.0);
        emit("inference_paid", json!({"studio_id": studio_id, "amount": amount, "to": self.treasury_id, "model": model,
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
        let used = env::storage_usage().saturating_sub(before); // exact bytes this token added
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
        let (seller_amount, owner_amount, studio_amount, royalty) =
            sale_split(price, l.primary, s.royalty_bps, s.split_owner_bps);

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

    /// NEP-199. Uses the same split as `buy`: the owner's share goes to the owner's wallet and the
    /// studio's share goes to this contract, which credits it to the studio budget in
    /// `nft_transfer_payout`. A primary sale on an external marketplace is split 70/30 too.
    pub fn nft_payout(&self, token_id: TokenId, balance: U128, max_len_payout: Option<u32>) -> Payout {
        let (payout, _, _, _, _) = self.compute_payout(&token_id, balance.0);
        require!(payout.len() as u32 <= max_len_payout.unwrap_or(3), "max_len_payout too small");
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
        let (payout, studio_id, primary, owner_amount, studio_amount) = self.compute_payout(&token_id, balance.0);
        require!(payout.len() as u32 <= max_len_payout.unwrap_or(3), "max_len_payout too small");
        self.listings.remove(&token_id);
        self.tokens.internal_transfer(&env::predecessor_account_id(), &receiver_id, &token_id, approval_id, memo);
        // The marketplace pays `payout` right after this call; the studio share lands on this
        // contract, so it is credited to the studio budget here.
        let mut s = self.studio_or_panic(&studio_id);
        s.budget = U128(s.budget.0 + studio_amount);
        s.owner_earned_total = U128(s.owner_earned_total.0 + owner_amount);
        s.studio_earned_total = U128(s.studio_earned_total.0 + studio_amount);
        if primary {
            s.works_sold += 1;
            s.revenue_total = U128(s.revenue_total.0 + balance.0);
        } else {
            s.royalties_total = U128(s.royalties_total.0 + owner_amount + studio_amount);
        }
        self.studios.insert(studio_id.clone(), s.clone());
        emit("payout_split", json!({"studio_id": studio_id, "token_id": token_id, "balance": balance,
            "owner_amount": U128(owner_amount), "studio_amount": U128(studio_amount), "budget": s.budget}));
        Payout { payout }
    }

    // ---------------- commissions ----------------

    /// Commission a work: attach at least the style's `min_price` (and the studio floor). The NEAR
    /// is held in escrow until the agent delivers or the commission is refunded.
    /// `brief_hash` is the sha256 of the brief text (the brief itself stays off-chain).
    #[payable]
    pub fn commission(&mut self, studio_id: AccountId, style_id: String, brief_hash: String) -> Commission {
        let buyer = env::predecessor_account_id();
        let price = env::attached_deposit().as_yoctonear();
        let s = self.studio_or_panic(&studio_id);
        require!(!s.kill_switch, "Kill switch engaged: the owner has paused this agent");
        let st = self.styles.get(&style_id).cloned().unwrap_or_else(|| env::panic_str("Unknown style"));
        require!(st.authorized, "Style is not authorized by its artist");
        require!(price >= st.min_price.0 && price >= s.floor.0, "Attached deposit is below the quoted price");
        require!(brief_hash.len() == 64, "brief_hash must be a hex sha256");
        let id = self.next_commission;
        self.next_commission += 1;
        let c = Commission {
            id: U64(id), buyer_id: buyer.clone(), studio_id: studio_id.clone(), style_id: style_id.clone(),
            price: U128(price), brief_hash, status: CommissionStatus::Open, token_id: None,
            created_at_ms: U64(env::block_timestamp() / 1_000_000),
        };
        self.commissions.insert(id, c.clone());
        emit("commissioned", json!({"commission_id": U64(id), "studio_id": studio_id, "buyer_id": buyer,
            "style_id": style_id, "price": U128(price), "brief_hash": c.brief_hash}));
        c
    }

    /// Agent delivers a commission: mints the work straight to the buyer (storage from the studio
    /// budget), then splits the escrowed payment: artist royalty (if the style has a human artist),
    /// then owner / studio budget by the studio's split.
    pub fn agent_deliver(&mut self, commission_id: U64, metadata: TokenMetadata) -> serde_json::Value {
        self.assert_agent();
        let mut c = self.commissions.get(&commission_id.0).cloned().unwrap_or_else(|| env::panic_str("Unknown commission"));
        require!(c.status == CommissionStatus::Open, "Commission is not open");
        let mut s = self.live_studio(&c.studio_id);
        require!(metadata.title.is_some() && metadata.media.is_some(), "Title and media required");
        let token_id = format!("{}", self.next_token);
        self.next_token += 1;
        let before = env::storage_usage();
        let mut md = metadata;
        md.issued_at = Some(format!("{}", env::block_timestamp() / 1_000_000));
        md.copies = Some(1);
        self.tokens.internal_mint_with_refund(token_id.clone(), c.buyer_id.clone(), Some(md), None);
        self.token_studio.insert(token_id.clone(), c.studio_id.clone());
        self.token_studio.flush();
        let used = env::storage_usage().saturating_sub(before);
        let storage = env::storage_byte_cost().as_yoctonear() * used as u128;

        let mut st = self.styles.get(&c.style_id).cloned().unwrap_or_else(|| env::panic_str("Unknown style"));
        let price = c.price.0;
        let (artist_amount, owner_amount, studio_amount) =
            commission_split(price, st.artist_bps, st.artist_id.is_some(), s.split_owner_bps);
        require!(storage <= s.budget.0 + studio_amount, "Studio budget too low to pay mint storage");
        s.budget = U128(s.budget.0 + studio_amount - storage);
        s.storage_spent_total = U128(s.storage_spent_total.0 + storage);
        s.works_minted += 1;
        s.works_sold += 1;
        s.revenue_total = U128(s.revenue_total.0 + price);
        s.owner_earned_total = U128(s.owner_earned_total.0 + owner_amount);
        s.studio_earned_total = U128(s.studio_earned_total.0 + studio_amount);
        self.studios.insert(c.studio_id.clone(), s.clone());
        st.works += 1;
        st.artist_earned_total = U128(st.artist_earned_total.0 + artist_amount);
        self.styles.insert(st.id.clone(), st.clone());
        c.status = CommissionStatus::Delivered;
        c.token_id = Some(token_id.clone());
        self.commissions.insert(commission_id.0, c.clone());

        if let Some(a) = &st.artist_id { pay(a, artist_amount); }
        pay(&s.owner_id, owner_amount);

        NftMint { owner_id: &c.buyer_id, token_ids: &[&token_id], memo: Some("atelier-one commission") }.emit();
        emit("commission_delivered", json!({"commission_id": commission_id, "studio_id": c.studio_id,
            "token_id": token_id, "buyer_id": c.buyer_id, "style_id": st.id, "price": U128(price),
            "storage_cost": U128(storage)}));
        emit("split_paid", json!({"studio_id": c.studio_id, "token_id": token_id, "owner_id": s.owner_id,
            "owner_amount": U128(owner_amount), "studio_amount": U128(studio_amount),
            "artist_id": st.artist_id, "artist_amount": U128(artist_amount),
            "split_owner_bps": s.split_owner_bps, "budget": s.budget}));
        json!({"commission_id": commission_id, "token_id": token_id, "buyer_id": c.buyer_id, "price": U128(price),
               "artist_amount": U128(artist_amount), "owner_amount": U128(owner_amount),
               "studio_amount": U128(studio_amount), "storage_cost": U128(storage)})
    }

    /// Refund an open commission. The agent can refund at any time (e.g. generation failed);
    /// the buyer can take the money back once the commission is 30 minutes old and undelivered.
    pub fn refund_commission(&mut self, commission_id: U64) -> Commission {
        let mut c = self.commissions.get(&commission_id.0).cloned().unwrap_or_else(|| env::panic_str("Unknown commission"));
        require!(c.status == CommissionStatus::Open, "Commission is not open");
        let caller = env::predecessor_account_id();
        let age = env::block_timestamp() / 1_000_000 - c.created_at_ms.0;
        require!(caller == self.agent_id || (caller == c.buyer_id && age >= COMMISSION_TIMEOUT_MS),
            "Only the agent, or the buyer after 30 minutes, can refund");
        c.status = CommissionStatus::Refunded;
        self.commissions.insert(commission_id.0, c.clone());
        pay(&c.buyer_id, c.price.0);
        emit("commission_refunded", json!({"commission_id": commission_id, "buyer_id": c.buyer_id, "amount": c.price}));
        c
    }

    /// Admin: register or update a style. A style with a human `artist_id` must carry the
    /// license note the artist agreed to; unauthorized styles can not be commissioned.
    pub fn set_style(&mut self, id: String, name: String, artist_id: Option<AccountId>, artist_bps: u16,
                     min_price: U128, authorized: bool, license: String) -> Style {
        require!(env::predecessor_account_id() == self.admin_id, "Admin only");
        require!(id.len() <= 32 && name.len() <= 64 && license.len() <= 280, "Style fields too long");
        require!(artist_bps <= MAX_ARTIST_BPS, "artist_bps must be <= 5000");
        require!(min_price.0 >= MIN_FLOOR, "min_price must be at least 0.01 NEAR");
        require!(artist_id.is_some() || artist_bps == 0, "artist_bps needs an artist_id");
        require!(!authorized || artist_id.is_none() || !license.is_empty(), "A human artist's style needs a license note");
        let prev = self.styles.get(&id).cloned();
        let st = Style { id: id.clone(), name, artist_id, artist_bps, min_price, authorized, license,
            works: prev.as_ref().map(|p| p.works).unwrap_or(0),
            artist_earned_total: prev.map(|p| p.artist_earned_total).unwrap_or(U128(0)) };
        self.styles.insert(id.clone(), st.clone());
        emit("style_set", json!({"style_id": id, "artist_id": st.artist_id, "artist_bps": artist_bps,
            "min_price": min_price, "authorized": authorized}));
        st
    }

    pub fn get_styles(&self) -> Vec<Style> { self.styles.values().cloned().collect() }

    pub fn get_commission(&self, commission_id: U64) -> Option<Commission> {
        self.commissions.get(&commission_id.0).cloned()
    }

    pub fn get_commissions(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Commission> {
        let n = self.commissions.len() as usize;
        let lim = limit.unwrap_or(50) as usize;
        let from = from_index.map(|f| f as usize).unwrap_or(n.saturating_sub(lim));
        self.commissions.values().skip(from).take(lim).cloned().collect()
    }

    // ---------------- views ----------------

    pub fn get_config(&self) -> Config {
        Config {
            admin_id: self.admin_id.clone(),
            agent_id: self.agent_id.clone(),
            treasury_id: self.treasury_id.clone(),
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

    /// Admin can change where inference fees go.
    pub fn set_treasury(&mut self, treasury_id: AccountId) {
        require!(env::predecessor_account_id() == self.admin_id, "Admin only");
        self.treasury_id = treasury_id;
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

    /// (payout map, studio_id, primary, owner_amount, studio_amount)
    fn compute_payout(&self, token_id: &TokenId, balance: u128) -> (HashMap<AccountId, U128>, AccountId, bool, u128, u128) {
        let holder = self.tokens.owner_by_id.get(token_id).unwrap_or_else(|| env::panic_str("Token not found"));
        let studio_id = self.token_studio.get(token_id).cloned().unwrap_or_else(|| env::panic_str("Unknown token"));
        let s = self.studio_or_panic(&studio_id);
        let primary = holder == studio_id;
        let (seller, owner, studio, _) = sale_split(balance, primary, s.royalty_bps, s.split_owner_bps);
        let mut payout: HashMap<AccountId, U128> = HashMap::new();
        let mut add = |a: AccountId, v: u128| {
            if v > 0 { let e = payout.entry(a).or_insert(U128(0)); e.0 += v; }
        };
        add(holder, seller);
        add(s.owner_id.clone(), owner);
        add(env::current_account_id(), studio);
        (payout, studio_id, primary, owner, studio)
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

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
    const MILLI: u128 = NEAR / 1_000;

    fn admin() -> AccountId { "admin.testnet".parse().unwrap() }
    fn agent() -> AccountId { "artist.testnet".parse().unwrap() }
    fn treasury() -> AccountId { "treasury.testnet".parse().unwrap() }
    fn owner() -> AccountId { "owner.testnet".parse().unwrap() }
    fn buyer() -> AccountId { "buyer.testnet".parse().unwrap() }

    fn ctx(predecessor: AccountId, deposit: u128) {
        let mut b = VMContextBuilder::new();
        b.current_account_id("studio.testnet".parse().unwrap())
            .predecessor_account_id(predecessor.clone())
            .signer_account_id(predecessor)
            .account_balance(NearToken::from_near(100))
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(1_700_000_000_000_000_000);
        testing_env!(b.build());
    }

    /// Contract with one studio: floor 0.05, cap 0.01/day, 70/30 split, 10% royalty, 1 NEAR budget.
    fn setup() -> Contract {
        ctx(admin(), 0);
        let mut c = Contract::new(admin(), agent(), treasury());
        ctx(owner(), NEAR);
        c.open_studio("Studio".into(), "warm".into(), U128(50 * MILLI), 7_000, 1_000, U128(10 * MILLI));
        c
    }

    fn md() -> TokenMetadata {
        TokenMetadata {
            title: Some("Moss Morning".into()), description: None, media: Some("bafy".into()), media_hash: None,
            copies: None, issued_at: None, expires_at: None, starts_at: None, updated_at: None,
            extra: None, reference: None, reference_hash: None,
        }
    }

    fn mint(c: &mut Contract) -> TokenId {
        ctx(agent(), 0);
        c.agent_mint(owner(), md()).token_id
    }

    #[test]
    fn split_math_primary_and_resale() {
        // primary 1 NEAR, 70/30: owner 0.7, studio 0.3, no seller payout, no royalty
        assert_eq!(sale_split(NEAR, true, 1_000, 7_000), (0, 700 * MILLI, 300 * MILLI, 0));
        // resale 1 NEAR, 10% royalty split 70/30: seller 0.9, owner 0.07, studio 0.03
        assert_eq!(sale_split(NEAR, false, 1_000, 7_000), (900 * MILLI, 70 * MILLI, 30 * MILLI, 100 * MILLI));
        // shares always add up to the price, even with odd amounts
        for p in [1u128, 7, 999, 123_456_789_012_345] {
            let (s, o, st, r) = sale_split(p, false, 2_500, 3_333);
            assert_eq!(s + o + st, p);
            assert_eq!(o + st, r);
            let (_, o, st, _) = sale_split(p, true, 2_500, 3_333);
            assert_eq!(o + st, p);
        }
    }

    #[test]
    fn buy_splits_and_refills_budget() {
        let mut c = setup();
        let t = mint(&mut c);
        let budget_after_mint = c.get_studio(owner()).unwrap().budget.0;
        c.agent_list(t.clone(), U128(100 * MILLI));
        ctx(buyer(), 100 * MILLI);
        let r = c.buy(t.clone());
        assert_eq!(r["owner_amount"], json!(U128(70 * MILLI)));
        assert_eq!(r["studio_amount"], json!(U128(30 * MILLI)));
        let s = c.get_studio(owner()).unwrap();
        assert_eq!(s.budget.0, budget_after_mint + 30 * MILLI);
        assert_eq!(s.works_sold, 1);
        assert_eq!(c.nft_token(t).unwrap().owner_id, buyer());
    }

    #[test]
    #[should_panic(expected = "Price is below the owner's floor")]
    fn floor_is_enforced() {
        let mut c = setup();
        let t = mint(&mut c);
        c.agent_list(t, U128(49 * MILLI));
    }

    #[test]
    fn listing_at_floor_is_ok() {
        let mut c = setup();
        let t = mint(&mut c);
        assert_eq!(c.agent_list(t, U128(50 * MILLI)).price.0, 50 * MILLI);
    }

    #[test]
    fn daily_cap_is_enforced_and_resets_next_day() {
        let mut c = setup();
        ctx(agent(), 0);
        c.agent_charge_inference(owner(), U128(6 * MILLI), "m".into(), "p".into(), "j1".into());
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.agent_charge_inference(owner(), U128(5 * MILLI), "m".into(), "p".into(), "j2".into());
        }));
        assert!(r.is_err(), "second charge must exceed the 0.01/day cap");
        // next UTC day: spent_today resets
        let mut b = VMContextBuilder::new();
        b.current_account_id("studio.testnet".parse().unwrap()).predecessor_account_id(agent())
            .account_balance(NearToken::from_near(100)).block_timestamp(1_700_000_000_000_000_000 + NS_PER_DAY);
        testing_env!(b.build());
        let s = c.agent_charge_inference(owner(), U128(5 * MILLI), "m".into(), "p".into(), "j3".into());
        assert_eq!(s.spent_today.0, 5 * MILLI);
        assert_eq!(s.budget.0, NEAR - 11 * MILLI);
    }

    #[test]
    fn inference_fee_goes_to_treasury() {
        let mut c = setup();
        ctx(agent(), 0);
        c.agent_charge_inference(owner(), U128(2 * MILLI), "m".into(), "p".into(), "j".into());
        let logs = near_sdk::test_utils::get_logs();
        assert!(logs.iter().any(|l| l.contains("inference_paid") && l.contains("treasury.testnet")));
        assert_eq!(c.get_config().treasury_id, treasury());
    }

    #[test]
    fn kill_switch_blocks_every_agent_method() {
        let mut c = setup();
        let t = mint(&mut c);
        ctx(owner(), 0);
        c.set_kill_switch(true);
        ctx(agent(), 0);
        let charge = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.agent_charge_inference(owner(), U128(MILLI), "m".into(), "p".into(), "j".into());
        }));
        let mint2 = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { c.agent_mint(owner(), md()); }));
        let list = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { c.agent_list(t.clone(), U128(100 * MILLI)); }));
        assert!(charge.is_err() && mint2.is_err() && list.is_err());
        ctx(owner(), 0);
        c.set_kill_switch(false);
        ctx(agent(), 0);
        c.agent_list(t, U128(100 * MILLI));
    }

    #[test]
    #[should_panic(expected = "Agent only")]
    fn only_agent_can_charge() {
        let mut c = setup();
        ctx(accounts(3), 0);
        c.agent_charge_inference(owner(), U128(MILLI), "m".into(), "p".into(), "j".into());
    }

    #[test]
    #[should_panic(expected = "Agent only")]
    fn only_agent_can_mint() {
        let mut c = setup();
        ctx(owner(), 0);
        c.agent_mint(owner(), md());
    }

    #[test]
    #[should_panic(expected = "Agent only")]
    fn only_agent_can_list() {
        let mut c = setup();
        let t = mint(&mut c);
        ctx(owner(), 0);
        c.agent_list(t, U128(100 * MILLI));
    }

    #[test]
    fn mint_storage_is_paid_from_budget() {
        let mut c = setup();
        mint(&mut c);
        let s = c.get_studio(owner()).unwrap();
        assert!(s.storage_spent_total.0 > 0);
        assert_eq!(s.budget.0 + s.storage_spent_total.0, NEAR);
    }

    fn sina() -> AccountId { "sina.testnet".parse().unwrap() }
    const HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    fn styles(c: &mut Contract) {
        ctx(admin(), 0);
        c.set_style("house".into(), "House".into(), None, 0, U128(20 * MILLI), true, "".into());
        c.set_style("sina".into(), "Sina".into(), Some(sina()), 2_000, U128(50 * MILLI), true, "own style, agreed".into());
        c.set_style("nope".into(), "Nope".into(), Some(accounts(4)), 2_000, U128(50 * MILLI), false, "".into());
    }

    #[test]
    fn commission_split_math() {
        // 0.1 NEAR, 20% artist, 70/30: artist 0.02, owner 0.056, studio 0.024
        assert_eq!(commission_split(100 * MILLI, 2_000, true, 7_000), (20 * MILLI, 56 * MILLI, 24 * MILLI));
        assert_eq!(commission_split(100 * MILLI, 0, false, 7_000), (0, 70 * MILLI, 30 * MILLI));
        for p in [1u128, 7, 999, 123_456_789_012_345] {
            let (a, o, s) = commission_split(p, 3_333, true, 4_999);
            assert_eq!(a + o + s, p);
        }
    }

    #[test]
    fn commission_escrow_then_deliver_mints_to_buyer_and_pays_artist() {
        let mut c = setup();
        styles(&mut c);
        ctx(buyer(), 100 * MILLI);
        let cm = c.commission(owner(), "sina".into(), HASH.into());
        assert_eq!(cm.status, CommissionStatus::Open);
        let budget0 = c.get_studio(owner()).unwrap().budget.0;
        ctx(agent(), 0);
        let mut m = md();
        m.extra = Some("{\"provenance\":{}}".into());
        let r = c.agent_deliver(cm.id, m);
        assert_eq!(r["artist_amount"], json!(U128(20 * MILLI)));
        assert_eq!(r["owner_amount"], json!(U128(56 * MILLI)));
        let t: TokenId = r["token_id"].as_str().unwrap().into();
        assert_eq!(c.nft_token(t.clone()).unwrap().owner_id, buyer());
        let s = c.get_studio(owner()).unwrap();
        assert_eq!(s.budget.0 + s.storage_spent_total.0, budget0 + 24 * MILLI);
        assert_eq!(s.works_sold, 1);
        let st = c.get_styles().into_iter().find(|x| x.id == "sina").unwrap();
        assert_eq!(st.artist_earned_total.0, 20 * MILLI);
        assert_eq!(c.get_commission(cm.id).unwrap().status, CommissionStatus::Delivered);
        // can not deliver twice
        let again = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { c.agent_deliver(cm.id, md()); }));
        assert!(again.is_err());
        // the token pays the studio royalty on resale like any other work
        assert_eq!(c.get_token_studio(t), Some(owner()));
    }

    #[test]
    #[should_panic(expected = "Style is not authorized by its artist")]
    fn unauthorized_style_can_not_be_commissioned() {
        let mut c = setup();
        styles(&mut c);
        ctx(buyer(), 100 * MILLI);
        c.commission(owner(), "nope".into(), HASH.into());
    }

    #[test]
    #[should_panic(expected = "Attached deposit is below the quoted price")]
    fn commission_needs_the_price() {
        let mut c = setup();
        styles(&mut c);
        ctx(buyer(), 49 * MILLI);
        c.commission(owner(), "sina".into(), HASH.into());
    }

    #[test]
    fn refunds_agent_anytime_buyer_after_timeout() {
        let mut c = setup();
        styles(&mut c);
        ctx(buyer(), 60 * MILLI);
        let cm = c.commission(owner(), "house".into(), HASH.into());
        ctx(buyer(), 0);
        let early = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| { c.refund_commission(cm.id); }));
        assert!(early.is_err(), "buyer can not refund before the timeout");
        ctx(agent(), 0);
        assert_eq!(c.refund_commission(cm.id).status, CommissionStatus::Refunded);
        ctx(buyer(), 60 * MILLI);
        let cm2 = c.commission(owner(), "house".into(), HASH.into());
        let mut b = VMContextBuilder::new();
        b.current_account_id("studio.testnet".parse().unwrap()).predecessor_account_id(buyer())
            .account_balance(NearToken::from_near(100)).block_timestamp(1_700_000_000_000_000_000 + COMMISSION_TIMEOUT_MS * 1_000_000);
        testing_env!(b.build());
        assert_eq!(c.refund_commission(cm2.id).status, CommissionStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "Admin only")]
    fn only_admin_sets_styles() {
        let mut c = setup();
        ctx(owner(), 0);
        c.set_style("x".into(), "X".into(), None, 0, U128(20 * MILLI), true, "".into());
    }

    #[test]
    fn nft_payout_routes_studio_share_through_the_budget() {
        let mut c = setup();
        let t = mint(&mut c);
        // primary sale on an external marketplace: 70% owner, 30% to this contract (studio budget)
        let p = c.nft_payout(t.clone(), U128(NEAR), Some(3)).payout;
        assert_eq!(p.get(&owner()).unwrap().0, 700 * MILLI);
        assert_eq!(p.get(&"studio.testnet".parse::<AccountId>().unwrap()).unwrap().0, 300 * MILLI);
        // after transfer to a collector, a resale pays 90% seller, royalty 7% owner + 3% studio
        ctx(owner(), 1);
        let before = c.get_studio(owner()).unwrap().budget.0;
        c.nft_transfer_payout(buyer(), t.clone(), None, None, U128(NEAR), Some(3));
        assert_eq!(c.get_studio(owner()).unwrap().budget.0, before + 300 * MILLI);
        let p = c.nft_payout(t, U128(NEAR), Some(3)).payout;
        assert_eq!(p.get(&buyer()).unwrap().0, 900 * MILLI);
        assert_eq!(p.get(&owner()).unwrap().0, 70 * MILLI);
        assert_eq!(p.get(&"studio.testnet".parse::<AccountId>().unwrap()).unwrap().0, 30 * MILLI);
        let total: u128 = p.values().map(|v| v.0).sum();
        assert_eq!(total, NEAR);
    }
}
