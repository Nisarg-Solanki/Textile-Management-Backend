import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { errorHandler } from "./lib/errors";
import authRouter from "./routes/auth";
import permissionsRouter from "./routes/permissions";
import firmsRouter from "./routes/firms";
import millsRouter from "./routes/mills";
import machinesRouter from "./routes/machines";
import beamsRouter from "./routes/beams";
import productionRouter from "./routes/production";
import takasRouter from "./routes/takas";
import millOutvertsRouter from "./routes/millOutverts";
import millInvertsRouter from "./routes/millInverts";
import machineInfoRouter from "./routes/machineInfo";
import millSummaryRouter from "./routes/millSummary";

const app = express();

// 1. helmet
app.use(helmet());

// 2. cors
app.use(cors({ origin: process.env.FRONTEND_URL }));

// 3. express.json
app.use(express.json());

// 4. express.urlencoded
app.use(express.urlencoded({ extended: true }));

// 5. cookie-parser — required to read httpOnly refresh token cookie
app.use(cookieParser());

// 6. rate limiter — auth endpoints (10 req / 15 min / IP)
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/v1/auth/login", authRateLimiter);
app.use("/api/v1/auth/register", authRateLimiter);
app.use("/api/v1/auth/forgot-password", authRateLimiter);

// Swagger / OpenAPI
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: { title: "Textile API", version: "1.0.0" },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./src/routes/*.ts"],
});

app.use("/api/v1/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api/v1/api-docs.json", (_req, res) => res.json(swaggerSpec));

// Routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/permissions", permissionsRouter);
app.use("/api/v1/firms", firmsRouter);
app.use("/api/v1/mills", millsRouter);
app.use("/api/v1/machines", machinesRouter);
app.use("/api/v1/beams", beamsRouter);
app.use("/api/v1/production", productionRouter);
app.use("/api/v1/takas", takasRouter);
app.use("/api/v1/mill-outverts", millOutvertsRouter);
app.use("/api/v1/mill-inverts", millInvertsRouter);
app.use("/api/v1/machine-info", machineInfoRouter);
app.use("/api/v1/mill-summary", millSummaryRouter);

// Health check
app.get("/api/v1/health", (_req, res) => {
  res.json({ success: true, message: "OK" });
});

// Global error handler — must be last
app.use(errorHandler);

export default app;
