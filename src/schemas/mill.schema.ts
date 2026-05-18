import { z } from "zod";

export const createMillSchema = z.object({
  millName: z.string().min(2).max(100),
  millCode: z.string().optional(),
  address: z.string().optional(),
  contactPerson: z.string().optional(),
  contactNumber: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const updateMillSchema = createMillSchema.partial();

export type CreateMillInput = z.infer<typeof createMillSchema>;
export type UpdateMillInput = z.infer<typeof updateMillSchema>;
