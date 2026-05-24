import crypto from 'crypto';
import { FastifyInstance } from 'fastify';

export function createLedgerService(server: FastifyInstance) {
  async function writeLedgerEntry(client: any, entry: {
    txn_id?: string;
    order_id: string;
    event_type: string;
    amount_paise: number;
    farmer_id?: string;
    buyer_id?: string;
    metadata?: object;
  }) {
    const txnId = entry.txn_id ?? `TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const last = await client.query('SELECT entry_hash FROM audit.transaction_ledger ORDER BY created_at DESC LIMIT 1');
    const prevHash = last.rows[0]?.entry_hash ?? 'GENESIS';
    const hashInput = `${txnId}|${entry.event_type}|${entry.amount_paise}|${now}|${prevHash}`;
    const entryHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    await client.query(
      `INSERT INTO audit.transaction_ledger(txn_id, order_id, event_type, amount_paise, farmer_id, buyer_id, metadata, prev_hash, entry_hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [txnId, entry.order_id, entry.event_type, entry.amount_paise, entry.farmer_id ?? null, entry.buyer_id ?? null, entry.metadata ?? {}, prevHash, entryHash, now]
    );

    return { txnId, entryHash };
  }

  async function verifyLedgerIntegrity(fromId?: number) {
    const start = fromId ?? 1;
    const res = await server.db.query('SELECT * FROM audit.transaction_ledger WHERE id >= $1 ORDER BY id ASC', [start]);
    const rows = res.rows;
    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i];
      const prevHash = i === 0 ? entry.prev_hash : rows[i - 1].entry_hash;
      const created = new Date(entry.created_at).toISOString();
      const hashInput = `${entry.txn_id}|${entry.event_type}|${entry.amount_paise}|${created}|${prevHash}`;
      const expected = crypto.createHash('sha256').update(hashInput).digest('hex');
      if (expected !== entry.entry_hash) return { valid: false, brokenAtId: entry.id };
    }
    return { valid: true };
  }

  return { writeLedgerEntry, verifyLedgerIntegrity };
}

export type LedgerService = ReturnType<typeof createLedgerService>;
