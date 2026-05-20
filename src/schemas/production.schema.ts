import { z } from "zod";

export const createProductionSchema = z.object({
  firmId: z.string().uuid(),
  machineId: z.string().uuid(),
  beamId: z.string().uuid(),
  entryDate: z.string().datetime(),
  takaNo: z.string().min(1),
  takaSrNo: z.string().min(1),
  takaMeter: z.number().positive(),
  productionQualityId: z.string().uuid(),
  weight: z.number().positive(),
  remark: z.string().optional(),
  productionChallanNo: z.string().optional(),
});

// All fields optional; auto-filled fields (millOutvertId, millInvertId,
// millOutvertDate, millChallanNo, millName) are intentionally absent.
export const updateProductionSchema = createProductionSchema.partial();

export const listProductionQuerySchema = z.object({
  search: z.string().optional(),
  machine: z.string().uuid().optional(),
  beam: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  qualityId: z.string().uuid().optional(),
  firmId: z.string().uuid().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export type CreateProductionInput = z.infer<typeof createProductionSchema>;
export type UpdateProductionInput = z.infer<typeof updateProductionSchema>;
export type ListProductionQuery = z.infer<typeof listProductionQuerySchema>;
