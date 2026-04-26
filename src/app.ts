import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { errorHandler } from "./lib/errors";

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

// 6. rate limiter — login only (10 req / 15 min / IP)
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/v1/auth/login", loginRateLimiter);

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

// Health check
app.get("/api/v1/health", (_req, res) => {
  res.json({ success: true, message: "OK" });
});

// Global error handler — must be last
app.use(errorHandler);

export default app;
