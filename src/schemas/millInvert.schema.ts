import { z } from "zod";

export const createMillInvertSchema = z.object({
  firmId: z.string().uuid(),
  millId: z.string().uuid(),
  millOutvertId: z.string().uuid(),
  invertDate: z.string().datetime(),
  millChallanNo: z.string().min(1),
  firmChallanNo: z.string().min(1),
  takaSrNos: z.array(z.string().min(1)).min(1),
});

export const updateMillInvertSchema = createMillInvertSchema.partial();

export type CreateMillInvertInput = z.infer<typeof createMillInvertSchema>;
export type UpdateMillInvertInput = z.infer<typeof updateMillInvertSchema>;
