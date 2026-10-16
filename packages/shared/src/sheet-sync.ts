import { z } from 'zod';
import { buyerSchema, purchaseSelectionSchema } from './purchases';

// Checkout still requires every field; only authorized corrections may clear one.
export const editableBuyerSchema = buyerSchema.extend({
  name: buyerSchema.shape.name.or(z.literal('')),
  school: buyerSchema.shape.school.or(z.literal('')),
  cohort_class: buyerSchema.shape.cohort_class.or(z.literal('')),
  student_id: buyerSchema.shape.student_id.or(z.literal('')),
  email: buyerSchema.shape.email.or(z.literal('')),
  phone: buyerSchema.shape.phone.or(z.literal('')),
  facebook: buyerSchema.shape.facebook.or(z.literal('')),
});

export const ticketCodeEditSchema = z
  .object({
    operation_id: z.uuid(),
    expected_revision: z.number().int().nonnegative(),
    codes: z
      .array(z.string().regex(/^(BK|CK|DM)\d{5}$/))
      .min(1)
      .max(10000),
    ticket_ids: z.array(z.uuid()).min(1).max(10000),
    buyer: editableBuyerSchema,
    evidence_id: z.uuid().nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.codes.length === value.ticket_ids.length &&
      new Set(value.codes).size === value.codes.length &&
      new Set(value.ticket_ids).size === value.ticket_ids.length,
    { message: 'Các mã vé và UUID phải đầy đủ, duy nhất.' },
  );

export const sheetPurchaseEditSchema = z
  .object({
    operation_id: z.uuid(),
    expected_revision: z.number().int().nonnegative(),
    code: z.string().trim().min(1).max(160),
    buyer: editableBuyerSchema,
    lines: purchaseSelectionSchema.shape.lines,
    evidence_id: z.uuid().nullable(),
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
