import { expect, it } from 'vitest';
import { sheetPurchaseEditSchema, validateSheetTicketQuantity } from '@ftu/shared';
it('counts a ticket used in multiple categories only once and rejects insufficient or invalid quantities', () => {
  expect(() => validateSheetTicketQuantity(1, ['a', 'a'])).not.toThrow();
  expect(() => validateSheetTicketQuantity(1, ['a', 'b'])).toThrow('đã dùng để vote');
  for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    expect(() => validateSheetTicketQuantity(quantity, [])).toThrow('số nguyên dương');
});
it('rejects attempts to change ownership or status through a spreadsheet edit', () => {
  expect(
    sheetPurchaseEditSchema.safeParse({ user_id: crypto.randomUUID(), status: 'HELD' }).success,
  ).toBe(false);
});
