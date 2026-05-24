import { createLedgerService } from './ledger-service';

describe('ledger-service', () => {
  it('writes ledger entry and verifies integrity', async () => {
    const rows: any[] = [];
    const fakeClient: any = {
      query: jest.fn((text: string, values: any[]) => {
        if (text.includes('SELECT entry_hash FROM audit.transaction_ledger')) return Promise.resolve({ rows: [{ entry_hash: 'prevhash' }] });
        if (text.includes('INSERT INTO audit.transaction_ledger')) {
          rows.push({ id: rows.length + 1, txn_id: values[0], event_type: values[2], amount_paise: values[3], prev_hash: values[7], entry_hash: values[8], created_at: values[9] });
          return Promise.resolve({ rows: [] });
        }
        if (text.includes('SELECT * FROM audit.transaction_ledger')) return Promise.resolve({ rows });
        return Promise.resolve({ rows: [] });
      })
    };

    const fakeServer: any = { db: { query: fakeClient.query }, log: { warn: jest.fn() } };
    const svc = createLedgerService(fakeServer as any);
    const res = await svc.writeLedgerEntry(fakeClient, { order_id: 'ORD-1', event_type: 'TEST', amount_paise: 1000 });
    expect(res).toHaveProperty('entryHash');
    const verify = await svc.verifyLedgerIntegrity(1);
    expect(verify.valid).toBe(true);
  });
});
