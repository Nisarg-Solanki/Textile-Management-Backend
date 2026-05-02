import { z } from "zod";

export const createProductionQualitySchema = z.object({
  name: z.string().min(1),
});

export const updateProductionQualitySchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const listProductionQualitySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export type CreateProductionQualityInput = z.infer<typeof createProductionQualitySchema>;
export type UpdateProductionQualityInput = z.infer<typeof updateProductionQualitySchema>;
export type ListProductionQualityInput = z.infer<typeof listProductionQualitySchema>;
