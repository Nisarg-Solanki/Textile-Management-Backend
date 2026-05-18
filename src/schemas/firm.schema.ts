import { z } from "zod";

export const createFirmSchema = z.object({
  firmName: z.string().min(2).max(100),
  firmCode: z.string().min(1).max(20),
  challanEnable: z.boolean().default(false),
  srNoSeries: z.string().optional(),
  address: z.string().optional(),
  contactPerson: z.string().optional(),
  contactNumber: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const updateFirmSchema = createFirmSchema.partial();

export type CreateFirmInput = z.infer<typeof createFirmSchema>;
export type UpdateFirmInput = z.infer<typeof updateFirmSchema>;
