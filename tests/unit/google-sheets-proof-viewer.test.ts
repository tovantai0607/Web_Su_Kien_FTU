import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';
const source = readFileSync('tools/google-sheets/ProofViewer.gs', 'utf8');
const id = '34fb6f94-f308-470f-8e84-e7370c544ff9';
function viewer() {
  return vm.runInNewContext(source + '\n({ftuViewerProof_,ftuViewerHtml_})', {
    SpreadsheetApp: { ValueType: { IMAGE: 'IMAGE' } },
  });
}
function range(
  options: {
    column?: number;
    sheet?: string;
    book?: string;
    description?: string;
    url?: string;
  } = {},
) {
  return {
    getNumRows: () => 1,
    getNumColumns: () => 1,
    getRow: () => 11,
    getColumn: () => options.column ?? 13,
    getNote: () => 'FTU_PROOF:' + id,
    getSheet: () => ({
      getName: () => options.sheet ?? 'Vé DEMO',
      getParent: () => ({
        getId: () => options.book ?? '1n6nbwjErwOCsh-auVyOUmVP5jTIRsud45ADYdRhXViU',
      }),
    }),
    getValue: () => ({
      valueType: 'IMAGE',
      getAltTextDescription: () => options.description ?? 'FTU_PROOF:' + id,
      getContentUrl: () => options.url ?? 'https://lh3.googleusercontent.com/test-image',
    }),
  };
}
it('reads only an embedded proof image in a known column of the authorized workbook', () => {
  const code = viewer();
  expect(code.ftuViewerProof_(range())).toEqual({
    id,
    src: 'https://lh3.googleusercontent.com/test-image',
  });
  for (const options of [
    { column: 1 },
    { sheet: 'other' },
    { book: 'other' },
    { description: 'javascript:alert(1)' },
    { url: 'https://evil.test/pixel' },
  ])
    expect(code.ftuViewerProof_(range(options))).toBeNull();
});
it('opens selection metadata without accessing the authenticated image URL in a simple trigger', () => {
  const selected = range();
  selected.getValue = () => ({
    valueType: 'IMAGE',
    getAltTextDescription: () => 'FTU_PROOF:' + id,
    getContentUrl: () => {
      throw new Error('Not available to a simple trigger');
    },
  });
  expect(viewer().ftuViewerProof_(selected, true)).toEqual({ id });
  const html = viewer().ftuViewerHtml_({ id, cell: [203, 11, 13] });
  expect(html).toContain('loadFtuProofImage(203,11,13,"' + id + '")');
  expect(html).not.toContain('src="undefined"');
});
it('escapes image attributes and keeps the web fallback fixed without credentials', () => {
  const html = viewer().ftuViewerHtml_({
    id,
    src: 'https://lh3.googleusercontent.com/a?x=" onerror="bad&k=2',
  });
  expect(html).toContain('&quot; onerror=&quot;bad&amp;k=2');
  expect(html).not.toContain('src="https://lh3.googleusercontent.com/a?x=" onerror=');
  expect(html).toContain('https://ftucharm-test.bancotaima1235.workers.dev/minh-chung/' + id);
  expect(html).not.toMatch(/Bearer|sb_secret|refresh_token/);
});
