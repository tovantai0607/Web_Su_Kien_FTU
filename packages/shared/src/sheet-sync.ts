import { z } from 'zod';
import { buyerSchema, purchaseSelectionSchema } from './purchases';

export const sheetPurchaseEditSchema = z
  .object({
    operation_id: z.uuid(),
    expected_revision: z.number().int().nonnegative(),
    code: z.string().trim().min(1).max(160),
    buyer: buyerSchema,
    lines: purchaseSelectionSchema.shape.lines,
    evidence_id: z.uuid(),
  })
  .strict();
export type SheetPurchaseEdit = z.infer<typeof sheetPurchaseEditSchema>;

// Count distinct ticket identities, not vote rows: the same ticket may vote in two categories.
export function validateSheetTicketQuantity(quantity: number, votedTicketIds: string[]) {
  if (!Number.isSafeInteger(quantity) || quantity < 1)
    throw new Error('Số vé phải là số nguyên dương.');
  if (quantity < new Set(votedTicketIds).size)
    throw new Error('Không giảm số vé xuống dưới số vé đã dùng để vote.');
}
