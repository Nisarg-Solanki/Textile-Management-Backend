import { z } from "zod";

export const createMillOutvertSchema = z.object({
  firmId: z.string().uuid(),
  millId: z.string().uuid(),
  outvertDate: z.string().datetime(),
  firmChallanNo: z.string().min(1),
  takaSrNos: z.array(z.string().min(1)).min(1),
});

export const updateMillOutvertSchema = createMillOutvertSchema.partial();

export type CreateMillOutvertInput = z.infer<typeof createMillOutvertSchema>;
export type UpdateMillOutvertInput = z.infer<typeof updateMillOutvertSchema>;
