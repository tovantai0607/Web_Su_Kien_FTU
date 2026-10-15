import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { expect, it } from 'vitest';

function script(properties: Record<string, string> = {}) {
  const context = vm.createContext({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => properties[key],
        getProperties: () => properties,
        deleteProperty: (key: string) => {
          delete properties[key];
        },
        setProperties: (values: Record<string, string>) => {
          Object.assign(properties, values);
        },
        setProperty: (key: string, value: string) => {
          properties[key] = value;
        },
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (_algorithm: string, text: string) => [
        ...createHash('sha256').update(text).digest(),
      ],
    },
  });
  vm.runInContext(readFileSync('tools/google-sheets/Code.gs', 'utf8'), context);
  return context;
}
it.each(['sheet changed', 'database changed'])(
  'refuses a reviewed rebase if %s since preview, before writing metadata or rotating an operation',
  (change) => {
    const props: Record<string, string> = { FTU_PENDING_order: 'original-operation' };
    const code = script(props);
    const row = Array.from({ length: 19 }, (_, i) => i) as unknown[];
    row[15] = 'order';
    const signature = code.editableSignature_([row]);
    props.FTU_REVIEW_order = JSON.stringify({
      nonce: 'nonce',
      expires: Date.now() + 60000,
      revision: 2,
      signature,
    });
    code.LockService = {
      getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }),
    };
    code.assertPrivateFtuSheet_ = () => undefined;
    code.ftuRows_ = () => {
      const current = [...row];
      if (change === 'sheet changed') current[10] = 99;
      return [current];
    };
    code.databaseFtuOrder_ = () => ({ revision: 3 });
    code.ftuSheet_ = () => {
      throw new Error('Must not write before checking versions');
    };
    expect(() => code.confirmFtuRebase('order', 2, signature, 'nonce')).toThrow(
      change === 'sheet changed' ? 'Ô đã thay đổi' : 'Database đã đổi',
    );
    expect(props.FTU_PENDING_order).toBe('original-operation');
  },
);
it('blocks activation with a loopback API or missing auth rather than pretending Sheets can reach a local server', () => {
  const code = script({ FTU_API_BASE_URL: 'http://127.0.0.1:5173' });
  expect(() => code.ftuConfig_()).toThrow('Thiếu cấu hình');
});
it('a background refresh preserves editable cells when the database differs, without rewriting or reordering rows', () => {
  const code = script();
  const purchase = {
    id: 'order',
    code: 'DEMO',
    revision: 0,
    evidence_id: 'proof',
    buyer: {
      name: 'TEST',
      school: 'TEST',
      cohort_class: 'TEST',
      student_id: 'TEST',
      email: 'test@example.test',
      phone: '0000000000',
      facebook: 'TEST',
    },
    lines: [
      {
        product_id: 'product',
        name: 'The Intro',
        tier: 'EARLY',
        ticket_quantity: 1,
        bundle_size: 1,
      },
    ],
  };
  const current = purchase.lines.map((line) => code.ftuRow_(purchase, line));
  const baseline = { order: code.editableSignature_(current) };
  const messages: string[] = [];
  code.LockService = {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }),
  };
  code.assertPrivateFtuSheet_ = () => undefined;
  code.ftuRows_ = () => current;
  code.ftuSheet_ = () => ({
    getLastRow: () => 2,
    getRange: () => {
      throw new Error('Must not rewrite editable cells');
    },
  });
  code.readFtuBaseline_ = () => baseline;
  code.writeFtuBaseline_ = () => undefined;
  code.mirrorFtuDatabase_ = () => undefined;
  code.markFtuRows_ = (_id: string, message: string) => messages.push(message);
  code.ftuApi_ = () => ({
    count: 1,
    rows: [{ ...purchase, buyer: { ...purchase.buyer, email: 'new@example.test' } }],
  });
  code.syncFtuPurchases();
  expect(current[0][5]).toBe('test@example.test');
  expect(messages[0]).toContain('Database đã đổi');
});
it('retries an uncertain operation from its saved snapshot even if Sheet cells have since changed', () => {
  const code = script();
  const saved: unknown[][] = [];
  const sheet = {
    getLastRow: () => saved.length + 1,
    getRange: () => ({ getValues: () => saved }),
    appendRow: (row: unknown[]) => saved.push(row),
  };
  code.SpreadsheetApp = { openById: () => ({ getSheetByName: () => sheet }) };
  const original = [Array.from({ length: 19 }, (_, i) => i)];
  const first = code.operationRows_('order', 'operation', original);
  const changed = structuredClone(original);
  changed[0][10] = 99;
  expect(code.operationRows_('order', 'operation', changed)).toEqual(first);
  expect(saved).toHaveLength(1);
  expect(() => code.operationRows_('other-order', 'operation', changed)).toThrow('khớp đơn');
});
it('consumes an expired PKCE verifier and does not persist an unverified session', () => {
  const props = {
    FTU_API_BASE_URL: 'https://test.example',
    FTU_SUPABASE_URL: 'https://ifgtyslifgegwcguysbb.supabase.co',
    FTU_SUPABASE_PUBLISHABLE_KEY: 'test-only-public-key',
    FTU_PKCE_VERIFIER: 'expired-test',
    FTU_PKCE_EXPIRES_AT: '1',
  };
  const code = script(props);
  code.DriveApp = {
    Access: { PRIVATE: 'private' },
    getFolderById: () => ({ getSharingAccess: () => 'private' }),
    getFileById: () => ({ getSharingAccess: () => 'private' }),
  };
  expect(() => code.finishFtuAuthorization_('test-code')).toThrow('hết hạn');
  expect('FTU_PKCE_VERIFIER' in props).toBe(false);
  expect('FTU_REFRESH_TOKEN' in props).toBe(false);
});
it('keeps leading zeros and neutralizes formulas when serializing Sheet cells', () => {
  const code = script();
  expect(code.safeFtuCell_('0000000000')).toBe('0000000000');
  expect(code.safeFtuCell_('=IMPORTXML("https://example.test")')).toMatch(/^'/);
  expect(code.safeFtuCell_(4)).toBe(4);
});
it.each([
  [1, 4, 0],
  [2, 4, 2],
  [3, 6, 2],
])(
  'exports bundle size %i and %i tickets as %i combos without shifting the order metadata',
  (size, tickets, combos) => {
    const code = script();
    const buyer = {
      name: 'TEST',
      school: 'TEST',
      cohort_class: 'TEST',
      student_id: 'TEST',
      email: 'test@example.test',
      phone: '0000000000',
      facebook: 'TEST',
    };
    const row = code.ftuRow_(
      { code: 'DEMO', buyer, id: 'order-id', revision: 3, evidence_id: 'proof-id' },
      {
        product_id: 'product-id',
        name: 'The Intro',
        tier: 'EARLY',
        bundle_size: size,
        ticket_quantity: tickets,
        quantity: tickets / size,
      },
    );
    expect(row).toHaveLength(19);
    expect(row[10]).toBe(tickets);
    expect(row[12]).toBe(combos);
    expect(code.ftuComboCount_(row)).toBe(combos);
    expect(row.slice(15)).toEqual(['order-id', 3, 'proof-id', 'product-id']);
  },
);
it('fingerprints editable content, ignores read-only metadata, and reads only scoped pending operations', () => {
  const code = script({
    'FTU_PENDING_demo-id': 'operation',
    FTU_REFRESH_TOKEN: 'test-only-private-value',
  });
  expect(code.readFtuPending_()).toEqual({ 'demo-id': 'operation' });
  const values = Array.from({ length: 19 }, (_, i) => i);
  const original = code.editableSignature_([values]);
  const metadata = [...values];
  metadata[16] = 99;
  expect(code.editableSignature_([metadata])).toBe(original);
  values[10] = 4;
  expect(code.editableSignature_([values])).not.toBe(original);
});
it('writes the correct bundle count, buyer, proof and revision after inserting the derived combo column', () => {
  const code = script();
  const purchase = {
    id: 'order',
    code: 'DEMO',
    revision: 3,
    evidence_id: 'proof',
    buyer: {
      name: 'TEST',
      school: 'TEST',
      cohort_class: 'TEST',
      student_id: 'TEST',
      email: 'test@example.test',
      phone: '0000000000',
      facebook: 'TEST',
    },
    lines: [
      {
        product_id: 'product',
        name: 'The Intro',
        tier: 'EARLY',
        bundle_size: 2,
        ticket_quantity: 4,
        quantity: 2,
      },
    ],
  };
  const row = code.ftuRow_(purchase, purchase.lines[0]);
  code.ftuRows_ = () => [row];
  code.operationRows_ = () => [row];
  code.readFtuBaseline_ = () => ({});
  code.writeFtuBaseline_ = () => undefined;
  code.updateFtuMetadata_ = () => undefined;
  let payload: unknown;
  code.ftuApi_ = (path: string, _method?: string, body?: unknown) => {
    if (path === '/admin/purchase-offers')
      return [
        { products: [{ id: 'product', offer_id: 'offer', name: 'The Intro', tier: 'EARLY' }] },
      ];
    payload = body;
    return purchase;
  };
  code.writeFtuOrder_('order', 'operation');
  expect(payload).toEqual({
    operation_id: 'operation',
    expected_revision: 3,
    code: 'DEMO',
    buyer: purchase.buyer,
    lines: [{ product_id: 'product', bundle_size: 2, quantity: 2 }],
    evidence_id: 'proof',
  });
});
