import { z } from "zod";

export const createBeamQualitySchema = z.object({
  name: z.string().min(1),
});

export const updateBeamQualitySchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const listBeamQualitySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export type CreateBeamQualityInput = z.infer<typeof createBeamQualitySchema>;
export type UpdateBeamQualityInput = z.infer<typeof updateBeamQualitySchema>;
export type ListBeamQualityInput = z.infer<typeof listBeamQualitySchema>;
