import { z } from "zod";

export const createBeamSchema = z.object({
  firmId: z.string().uuid(),
  beamNo: z.string().min(1).max(50),
  tar: z.number().int().positive(),
  beamQualityId: z.string().uuid(),
  takaQty: z.number().int().positive(),
  beamMeter: z.number().positive(),
});

export const updateBeamSchema = createBeamSchema.partial();

export const listBeamQuerySchema = z.object({
  search: z.string().optional(),
  qualityId: z.string().uuid().optional(),
  meter_min: z.string().optional(),
  meter_max: z.string().optional(),
  firmId: z.string().uuid().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export type CreateBeamInput = z.infer<typeof createBeamSchema>;
export type UpdateBeamInput = z.infer<typeof updateBeamSchema>;
export type ListBeamQuery = z.infer<typeof listBeamQuerySchema>;
