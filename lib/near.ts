import "server-only";
import { Account, JsonRpcProvider, FailoverRpcProvider, KeyPairSigner } from "near-api-js";
import { AGENT_ID, COLLECTOR_ID, CONTRACT_ID, DEMO_STUDIO_ID, RPC_URLS } from "./config";
import { extractEvents, type ChainEvent } from "./events";

type KeyStr = `ed25519:${string}`;
let _provider: FailoverRpcProvider | null = null;
export function provider() {
  if (!_provider) _provider = new FailoverRpcProvider(RPC_URLS.map((url) => new JsonRpcProvider({ url })));
  return _provider;
}

export async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await provider().callFunction({ contractId: CONTRACT_ID, method, args } as any);
  return r as T;
}

export interface TxResult {
  hash: string;
  ok: boolean;
  error?: string;
  events: ChainEvent[];
  returnValue?: unknown;
  signerId: string;
}

function keys(env: string | undefined): KeyStr[] {
  return (env || "").split(",").map((s) => s.trim()).filter(Boolean) as KeyStr[];
}

function errText(e: unknown): string {
  if (!e) return "unknown error";
  if (typeof e === "string") return e;
  const s = JSON.stringify(e);
  const m = s.match(/Smart contract panicked: ([^"\\]+)/);
  if (m) return m[1];
  if (e instanceof Error) return e.message;
  return s.slice(0, 300);
}

/** Pull a tx hash out of a thrown error when the tx was sent but failed on-chain. */
function hashFromError(e: unknown): string | undefined {
  const s = (() => { try { return JSON.stringify(e, Object.getOwnPropertyNames(e as object)); } catch { return String(e); } })();
  const m = s.match(/"(?:transaction_hash|txHash|hash)"\s*:\s*"([1-9A-HJ-NP-Za-km-z]{43,44})"/);
  return m?.[1];
}

export function parseOutcome(res: any, signerId: string): TxResult {
  const hash: string = res?.transaction?.hash || res?.transaction_outcome?.id;
  const status = res?.status || {};
  let ok = "SuccessValue" in status;
  let error: string | undefined;
  if ("Failure" in status) { ok = false; error = errText(status.Failure); }
  for (const r of res?.receipts_outcome || []) {
    const st = r?.outcome?.status || {};
    if ("Failure" in st) { ok = false; error = error || errText(st.Failure); }
  }
  let returnValue: unknown;
  if (status.SuccessValue) {
    try { returnValue = JSON.parse(Buffer.from(status.SuccessValue, "base64").toString()); } catch {}
  }
  return { hash, ok, error, events: extractEvents(res), returnValue, signerId };
}

async function call(accountId: string, keyList: KeyStr[], method: string, args: object, deposit = "0", gas = 150_000_000_000_000n): Promise<TxResult> {
  if (!keyList.length) throw new Error(`No key configured for ${accountId}`);
  let lastErr: unknown;
  const order = [...keyList].sort(() => Math.random() - 0.5);
  for (let attempt = 0; attempt < Math.max(3, order.length); attempt++) {
    const key = order[attempt % order.length];
    const acct = new Account(accountId, provider(), KeyPairSigner.fromSecretKey(key));
    try {
      const res = await acct.signAndSendTransaction({
        receiverId: CONTRACT_ID,
        actions: [(await import("near-api-js")).actions.functionCall(method, args, gas, BigInt(deposit))],
        waitUntil: "EXECUTED_OPTIMISTIC",
        throwOnFailure: false,
      } as any);
      return parseOutcome(res, accountId);
    } catch (e) {
      lastErr = e;
      const msg = errText(e);
      const h = hashFromError(e);
      if (h) return { hash: h, ok: false, error: msg, events: [], signerId: accountId };
      if (!/nonce|expired|timeout|fetch|429|503|502|Too Many/i.test(msg)) break;
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 800));
    }
  }
  throw new Error(errText(lastErr));
}

export const agentCall = (method: string, args: object) => call(AGENT_ID, keys(process.env.AGENT_FC_KEYS), method, args);
export const collectorCall = (method: string, args: object, deposit: string) => call(COLLECTOR_ID, keys(process.env.COLLECTOR_KEY), method, args, deposit);
export const demoOwnerCall = (method: string, args: object) => call(DEMO_STUDIO_ID, keys(process.env.DEMO_OWNER_FC_KEY), method, args, "0", 30_000_000_000_000n);

export async function txStatus(hash: string, signerId: string): Promise<TxResult> {
  const res = await provider().viewTransactionStatus({ txHash: hash, accountId: signerId, waitUntil: "EXECUTED_OPTIMISTIC" } as any);
  return parseOutcome(res, signerId);
}

export async function accountBalance(id: string): Promise<string> {
  try {
    const a = new Account(id, provider());
    const s = await a.getState();
    return (s as any).balance?.available?.toString?.() ?? String((s as any).amount ?? "0");
  } catch { return "0"; }
}
