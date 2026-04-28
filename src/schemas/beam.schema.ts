import { z } from "zod";

export const createBeamSchema = z.object({
  firmId: z.string().uuid(),
  beamNo: z.string().min(1),
  tar: z.number().int().positive(),
  beamQuality: z.string().min(1),
  takaQty: z.number().int().positive(),
  beamMeter: z.number().positive(),
});

export const updateBeamSchema = createBeamSchema.partial();
