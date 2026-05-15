import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { AppError } from "../lib/errors";

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    throw new AppError(401, "Authentication required", "UNAUTHENTICATED");
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);
  req.user = payload;

  next();
}
