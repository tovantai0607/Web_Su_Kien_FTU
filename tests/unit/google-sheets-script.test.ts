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
it('embeds only server proof UUIDs, reuses embedded bytes and preserves the input rows', () => {
  const code = script({ FTU_EMBED_PROOFS: 'true' });
  const first = '34fb6f94-f308-470f-8e84-e7370c544ff9';
  const second = 'f9e14357-a912-4a0e-84d8-a64742ac6da6';
  const cached = { getAltTextDescription: () => 'FTU_PROOF:' + first };
  const fetched = { getAltTextDescription: () => 'FTU_PROOF:' + second };
  const calls: string[] = [];
  code.fetchFtuProofImage_ = (id: string) => {
    calls.push(id);
    return fetched;
  };
  const sheet = {
    getLastRow: () => 2,
    getRange: () => ({ getValues: () => [[cached]] }),
    getRowHeight: () => 120,
  };
  const rows = [
    [first, 'buyer'],
    [second, 'same proof'],
    [second, 'combo'],
    ['', 'unissued'],
  ];
  const result = code.embedFtuProofRows_(sheet, rows, 1, 2);
  expect(result.map((row: unknown[]) => row[0])).toEqual([cached, fetched, fetched, '']);
  expect(calls).toEqual([second]);
  expect(rows[0][0]).toBe(first);
  expect(rows[1][0]).toBe(second);
});
it('limits failed/new image requests per refresh and keeps the UUID fallback for retry', () => {
  const code = script({ FTU_EMBED_PROOFS: 'true' });
  let calls = 0;
  code.fetchFtuProofImage_ = () => {
    calls++;
    throw new Error('offline');
  };
  const rows = Array.from({ length: 5 }, (_, n) => ['34fb6f94-f308-470f-8e84-e7370c544ff' + n]);
  expect(code.embedFtuProofRows_({ getLastRow: () => 1 }, rows, 1, 2)).toEqual(rows);
  expect(calls).toBe(3);
});
it('adds private website proof links while preserving UUID cell values and skipping blanks or user edits', () => {
  const code = script({ FTU_API_BASE_URL: 'https://ftucharm-test.bancotaima1235.workers.dev' });
  const id = '34fb6f94-f308-470f-8e84-e7370c544ff9';
  const writes: unknown[] = [];
  code.SpreadsheetApp = {
    newRichTextValue: () => {
      let text = '',
        url = '';
      const builder = {
        setText: (v: string) => {
          text = v;
          return builder;
        },
        setLinkUrl: (v: string) => {
          url = v;
          return builder;
        },
        build: () => ({ text, url }),
      };
      return builder;
    },
  };
  const sheet = {
    getRange: (row: number, column: number) => ({
      setRichTextValue: (v: unknown) => writes.push({ row, column, value: v }),
    }),
  };
  code.linkFtuProofRows_(sheet, [[id], [''], ['drive-file-replacement']], 1, 10);
  expect(writes).toEqual([
    {
      row: 10,
      column: 1,
      value: { text: id, url: 'https://ftucharm-test.bancotaima1235.workers.dev/minh-chung/' + id },
    },
  ]);
});
it('renders a Combo3 as one row while retaining each member code and leaving unassigned buyers blank', () => {
  const code = script();
  const base = {
    prefix: 'DM',
    round_id: 'round',
    status: 'ISSUED',
    buyer: { name: 'DEMO', phone: '0000000000' },
    order_code: 'order',
    request_id: 'id',
    line: { name: 'Intro', tier: 'EARLY', bundle_size: 3, group_code: 'group' },
  };
  const records = [1, 2, 3].map((n) => ({
    ...base,
    code: 'DM0000' + n,
    sequence: n,
    ticket_id: 'ticket-' + n,
  }));
  records.push({
    code: 'DM00004',
    sequence: 4,
    prefix: 'DM',
    round_id: 'round',
    status: 'AVAILABLE',
  } as (typeof records)[number]);
  const rows = code.ftuCodeRows_(records);
  expect(rows.map((r: unknown[]) => r[0])).toEqual(['cb3_3_DM00001-DM00003', 'DM00004']);
  expect(rows[0][1]).toBe('DM00001\nDM00002\nDM00003');
  expect(rows[0][15]).toBe(3);
  expect(rows[0][10]).toBe('0000000000');
  expect(rows[0][16]).toBe('Combo 3');
  expect(rows[0][17]).toBe(1);
  expect(rows[1].slice(4, 15)).toEqual(Array(11).fill(''));
  const malicious = records.slice(0, 3).map((record) => ({
    ...record,
    buyer: { name: '=IMPORTDATA("https://invalid.test")', phone: '0000000000' },
  }));
  expect(code.ftuCodeRows_(malicious)[0][5]).toBe('\'=IMPORTDATA("https://invalid.test")');
});
function comboMembers(start: number, quantity: number, bundle = 2, request = 'order') {
  return Array.from({ length: quantity }, (_, index) => ({
    prefix: 'DM',
    round_id: 'round',
    code: 'DM' + String(start + index).padStart(5, '0'),
    sequence: start + index,
    ticket_id: 'ticket-' + (start + index),
    status: 'ISSUED',
    request_id: request,
    order_code: request,
    buyer: { name: request, email: request + '@example.test' },
    evidence_id: 'proof-' + request,
    line: {
      product_id: 'intro',
      name: 'Intro',
      tier: 'EARLY',
      bundle_size: bundle,
      group_code: request + ':1:' + (Math.floor(index / bundle) + 1),
    },
  }));
}
it('combines two Combo2 selections into cb2_4 with four members, without mixing buyers or types', () => {
  const code = script();
  const rows = code.ftuCodeRows_([
    ...comboMembers(12, 4),
    ...comboMembers(16, 2, 2, 'second'),
    ...comboMembers(18, 2).map((row) => ({
      ...row,
      line: { ...row.line, product_id: 'bridge', name: 'Bridge' },
    })),
  ]);
  expect(rows.map((row: unknown[]) => row[0])).toEqual([
    'cb2_4_DM00012-DM00015',
    'cb2_2_DM00016-DM00017',
    'cb2_2_DM00018-DM00019',
  ]);
  expect(rows[0][15]).toBe(4);
  expect(rows[0][17]).toBe(2);
  expect(rows[0][20].split('\n')).toHaveLength(4);
  expect(rows[1][5]).toBe('second');
  const gaps = code.ftuCodeRows_([...comboMembers(1, 2), ...comboMembers(4, 2)]);
  expect(gaps[0][0]).toBe('cb2_4_DM00001-DM00002+DM00004-DM00005');
});
it('refuses duplicate codes, incomplete combos or inconsistent buyer data before writing a grouped view', () => {
  const code = script();
  const members = comboMembers(1, 2);
  expect(() => code.ftuCodeRows_([members[0], members[0]])).toThrow('bị trùng');
  expect(() => code.ftuCodeRows_([members[0]])).toThrow('nhóm thiếu');
  expect(() =>
    code.ftuCodeRows_([members[0], { ...members[1], buyer: { name: 'wrong' } }]),
  ).toThrow('không khớp');
});
it('shows one single ticket plus one Combo3 as two rows for the same four-ticket order', () => {
  const code = script();
  const rows = code.ftuCodeRows_([...comboMembers(12, 1, 1), ...comboMembers(13, 3, 3)]);
  expect(rows.map((row: unknown[]) => [row[0], row[15], row[17]])).toEqual([
    ['DM00012', 1, ''],
    ['cb3_3_DM00013-DM00015', 3, 1],
  ]);
  expect(new Set(rows.map((row: unknown[]) => row[21])).size).toBe(1);
  expect(new Set(rows.map((row: unknown[]) => row[5])).size).toBe(1);
});
it('rewrites the grouped view idempotently in one call and refuses a source that loses an existing code', () => {
  const code = script();
  const headers = vm.runInContext('FTU_CODE_HEADERS', code);
  let view: unknown[][] = comboMembers(1, 4).map((member) => [member.code, member.code]);
  const writes: unknown[][][] = [];
  const sheet = {
    getLastRow: () => view.length + 1,
    getMaxRows: () => 100,
    getRange: (row: number) => ({
      getValues: () => (row === 1 ? [headers] : view.map((r) => [r[1]])),
      setValues: (values: unknown[][]) => {
        writes.push(values);
        view = values.filter((r) => r[0] !== '');
      },
    }),
  };
  const book = { getSheetByName: () => sheet };
  code.writeFtuTicketCodeTab_(book, 'DM', comboMembers(1, 4));
  expect(writes[0]).toHaveLength(4);
  expect(writes[0][0][0]).toBe('cb2_4_DM00001-DM00004');
  expect(writes[0].slice(1).every((row) => row.every((value) => value === ''))).toBe(true);
  code.writeFtuTicketCodeTab_(book, 'DM', comboMembers(1, 4));
  expect(view).toHaveLength(1);
  expect(() => code.writeFtuTicketCodeTab_(book, 'DM', comboMembers(1, 2))).toThrow('nguồn giảm');
  expect(writes).toHaveLength(2);
});
it('routes the mixed LIVE registry into separate semifinal/final tabs and keeps DEMO isolated', () => {
  const code = script();
  const headers = vm.runInContext('FTU_CODE_HEADERS', code);
  const written: Record<string, unknown[][]> = {};
  const lookups: string[] = [];
  code.LockService = {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }),
  };
  code.assertPrivateFtuSheet_ = () => undefined;
  code.SpreadsheetApp = {
    openById: () => ({
      getSheetByName: (name: string) => {
        lookups.push(name);
        return {
          getLastRow: () => 1,
          getMaxRows: () => 1450,
          getRange: (row: number, _column: number, count: number) => ({
            getValues: () => (row === 1 ? [headers] : Array.from({ length: count }, () => [''])),
            setValues: (values: unknown[][]) => {
              written[name] = values;
            },
          }),
        };
      },
    }),
  };
  code.ftuApi_ = (path: string) => {
    const prefixes = path.includes('mode=LIVE') ? ['BK', 'CK'] : ['DM'];
    return {
      count: prefixes.length,
      rows: prefixes.map((prefix) => ({
        prefix,
        code: prefix + '00001',
        sequence: 1,
        round_id: prefix,
        status: 'AVAILABLE',
      })),
    };
  };
  code.syncFtuTicketCodes();
  expect(lookups).toEqual(['Vé bán kết', 'Vé chung kết', 'Vé DEMO']);
  expect(
    Object.fromEntries(
      Object.entries(written).map(([name, rows]) => [name, rows.map((row) => row[0])]),
    ),
  ).toEqual({
    'Vé bán kết': ['BK00001'],
    'Vé chung kết': ['CK00001'],
    'Vé DEMO': ['DM00001'],
  });
});
it('collects all pages before grouping a Combo3 crossing a 200-row API boundary', () => {
  const code = script();
  const headers = vm.runInContext('FTU_CODE_HEADERS', code);
  const records = [
    ...Array.from({ length: 198 }, (_, index) => ({
      prefix: 'DM',
      round_id: 'round',
      code: 'DM' + String(index + 1).padStart(5, '0'),
      sequence: index + 1,
      status: 'AVAILABLE',
    })),
    ...comboMembers(199, 3, 3),
  ];
  const written: Record<string, unknown[][]> = {};
  const pages: number[] = [];
  code.LockService = {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }),
  };
  code.assertPrivateFtuSheet_ = () => undefined;
  code.SpreadsheetApp = {
    openById: () => ({
      getSheetByName: (name: string) => ({
        getLastRow: () => 1,
        getMaxRows: () => 700,
        getRange: () => ({
          getValues: () => [headers],
          setValues: (rows: unknown[][]) => {
            written[name] = rows;
          },
        }),
      }),
    }),
  };
  code.ftuApi_ = (path: string) => {
    if (path.includes('mode=LIVE')) return { count: 0, rows: [] };
    const page = Number(new URL('https://example.test' + path).searchParams.get('page'));
    pages.push(page);
    return { count: records.length, rows: records.slice(page * 200, (page + 1) * 200) };
  };
  code.syncFtuTicketCodes();
  expect(pages).toEqual([0, 1]);
  expect(written['Vé DEMO']).toHaveLength(199);
  expect(written['Vé DEMO'][198][0]).toBe('cb3_3_DM00199-DM00201');
});
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
