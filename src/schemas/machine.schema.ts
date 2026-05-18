import { z } from "zod";

export const createMachineSchema = z.object({
  firmId: z.string().uuid(),
  machineNo: z.string().min(1).max(50),
  machineType: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  remark: z.string().optional(),
});

export const updateMachineSchema = createMachineSchema.partial();

export type CreateMachineInput = z.infer<typeof createMachineSchema>;
export type UpdateMachineInput = z.infer<typeof updateMachineSchema>;
