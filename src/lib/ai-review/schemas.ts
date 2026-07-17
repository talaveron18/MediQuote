import { z } from 'zod';

export const budgetSnapshotSchema = z.object({
  reference: z.string().min(1).max(80), clientName: z.string().min(1).max(160),
  professionalCategory: z.string().min(1).max(120), autonomousCommunity: z.string().max(120),
  province: z.string().max(120), municipality: z.string().max(120), startDate: z.string().max(20),
  endDate: z.string().max(20), schedule: z.string().max(240), professionals: z.number().int().min(1).max(500),
  contractType: z.string().max(80), baseCost: z.number().finite().nonnegative(), pluses: z.number().finite().nonnegative(),
  socialSecurity: z.number().finite().nonnegative(), overhead: z.number().finite().nonnegative(),
  priceExVat: z.number().finite().nonnegative(), vatPercent: z.number().finite().min(0).max(100),
  totalWithVat: z.number().finite().nonnegative(), annualProductiveHours: z.number().finite().positive(),
});

export const intakeRequestSchema = z.object({ text: z.string().min(20).max(12000) });
export const reviewRequestSchema = z.object({ snapshot: budgetSnapshotSchema });
export const contractRequestSchema = z.object({ snapshot: budgetSnapshotSchema, intentionalDemoMismatch: z.boolean().optional() });
export const aiReviewRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('intake'), payload: intakeRequestSchema }),
  z.object({ action: z.literal('review'), payload: reviewRequestSchema }),
  z.object({ action: z.literal('contract'), payload: contractRequestSchema }),
]);
