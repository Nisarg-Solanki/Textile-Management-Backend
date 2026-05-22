import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  dashboardStatsQuerySchema,
  productionChartQuerySchema,
} from "../schemas/dashboard.schema";

const router = Router();

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * @openapi
 * /api/v1/dashboard/stats:
 *   get:
 *     summary: Dashboard summary cards (totals + week-over-week change)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: firmId
 *         schema: { type: string }
 *         description: Optional firm filter
 *     responses:
 *       200:
 *         description: Card metrics for the dashboard
 *       403:
 *         description: Forbidden
 */
router.get(
  "/stats",
  authMiddleware,
  requirePermission("dashboard", "view"),
  async (req: Request, res: Response) => {
    const { firmId } = dashboardStatsQuerySchema.parse(req.query);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const firmFilter = firmId ? { firmId } : {};
    const baseWhere = { deletedAt: null, ...firmFilter };

    const [
      totalBeams,
      beamsThisWeek,
      beamsLastWeek,
      totalProduction,
      productionThisWeek,
      productionLastWeek,
      pendingTakas,
    ] = await Promise.all([
      prisma.beam.count({ where: baseWhere }),
      prisma.beam.count({
        where: { ...baseWhere, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.beam.count({
        where: {
          ...baseWhere,
          createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
        },
      }),
      prisma.productionInfo.count({ where: baseWhere }),
      prisma.productionInfo.count({
        where: { ...baseWhere, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.productionInfo.count({
        where: {
          ...baseWhere,
          createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
        },
      }),
      prisma.productionInfo.count({
        where: { ...baseWhere, millOutvertId: null },
      }),
    ]);

    const beamsChange = percentChange(beamsThisWeek, beamsLastWeek);
    const productionChange = percentChange(
      productionThisWeek,
      productionLastWeek,
    );

    res.json({
      success: true,
      data: {
        totalBeams: {
          value: totalBeams,
          changePercent: beamsChange,
          trend: beamsChange >= 0 ? "up" : "down",
          label: "from last week",
        },
        productionEntries: {
          value: totalProduction,
          changePercent: productionChange,
          trend: productionChange >= 0 ? "up" : "down",
          label: "from last week",
        },
        pendingTakas: {
          value: pendingTakas,
          requiresAttention: pendingTakas > 0,
          label: "Requires attention",
        },
      },
    });
  },
);

/**
 * @openapi
 * /api/v1/dashboard/production-chart:
 *   get:
 *     summary: Production meters aggregated for a time-series chart
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: firmId
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [daily, weekly, monthly] }
 *         description: daily = last 7 days, weekly = last 4 weeks, monthly = last 12 months
 *     responses:
 *       200:
 *         description: Chart points (label, periodStart, periodEnd, value)
 *       403:
 *         description: Forbidden
 */
router.get(
  "/production-chart",
  authMiddleware,
  requirePermission("dashboard", "view"),
  async (req: Request, res: Response) => {
    const { firmId, type } = productionChartQuerySchema.parse(req.query);

    const today = startOfDay(new Date());

    type Bucket = {
      label: string;
      periodStart: Date;
      periodEnd: Date;
    };

    const buckets: Bucket[] = [];

    if (type === "daily") {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      for (let i = 6; i >= 0; i--) {
        const start = new Date(today);
        start.setDate(start.getDate() - i);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        buckets.push({ label: dayNames[start.getDay()], periodStart: start, periodEnd: end });
      }
    } else if (type === "weekly") {
      for (let i = 3; i >= 0; i--) {
        const end = new Date(today);
        end.setDate(end.getDate() - i * 7 + 1);
        const start = new Date(end);
        start.setDate(start.getDate() - 7);
        buckets.push({
          label: `Week ${4 - i}`,
          periodStart: start,
          periodEnd: end,
        });
      }
    } else {
      const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];
      for (let i = 11; i >= 0; i--) {
        const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
        buckets.push({
          label: monthNames[start.getMonth()],
          periodStart: start,
          periodEnd: end,
        });
      }
    }

    const rangeStart = buckets[0].periodStart;
    const rangeEnd = buckets[buckets.length - 1].periodEnd;

    const where: Prisma.ProductionInfoWhereInput = {
      deletedAt: null,
      ...(firmId && { firmId }),
      entryDate: { gte: rangeStart, lt: rangeEnd },
    };

    const rows = await prisma.productionInfo.findMany({
      where,
      select: { entryDate: true, takaMeter: true },
    });

    const points = buckets.map((b) => {
      let sum = 0;
      for (const r of rows) {
        if (r.entryDate >= b.periodStart && r.entryDate < b.periodEnd) {
          sum += Number(r.takaMeter);
        }
      }
      return {
        label: b.label,
        periodStart: b.periodStart.toISOString(),
        periodEnd: b.periodEnd.toISOString(),
        value: Math.round(sum * 100) / 100,
      };
    });

    res.json({
      success: true,
      data: { type, points },
    });
  },
);

export default router;
