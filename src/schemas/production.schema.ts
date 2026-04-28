import { z } from "zod";

export const createProductionSchema = z.object({
  firmId: z.string().uuid(),
  machineId: z.string().uuid(),
  beamId: z.string().uuid(),
  entryDate: z.string().datetime(),
  takaSrNo: z.string().min(1),
  takaMeter: z.number().positive(),
  productionQuality: z.string().min(1),
  weight: z.number().positive(),
  remark: z.string().optional(),
  productionChallanNo: z.string().optional(),
});

// All fields optional; auto-filled fields (millOutvertId, millInvertId,
// millOutvertDate, millChallanNo, millName) are intentionally absent.
export const updateProductionSchema = createProductionSchema.partial();

export type CreateProductionInput = z.infer<typeof createProductionSchema>;
export type UpdateProductionInput = z.infer<typeof updateProductionSchema>;
