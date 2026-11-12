export interface ChainEvent {
  standard: string;
  event: string;
  data: Record<string, any>;
  receiptId?: string;
}

export function extractEvents(res: any): ChainEvent[] {
  const out: ChainEvent[] = [];
  for (const r of res?.receipts_outcome || []) {
    for (const log of r?.outcome?.logs || []) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      try {
        const j = JSON.parse(log.slice(11));
        for (const d of j.data || [{}]) out.push({ standard: j.standard, event: j.event, data: d, receiptId: r.id });
      } catch {}
    }
  }
  return out;
}
