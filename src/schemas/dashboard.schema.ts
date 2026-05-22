import { z } from "zod";

export const dashboardStatsQuerySchema = z.object({
  firmId: z.string().uuid().optional(),
});

export const productionChartQuerySchema = z.object({
  firmId: z.string().uuid().optional(),
  type: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
});

export type DashboardStatsQuery = z.infer<typeof dashboardStatsQuerySchema>;
export type ProductionChartQuery = z.infer<typeof productionChartQuerySchema>;
