import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";

type Module =
  | "beam_qualities"
  | "production_qualities"
  | "machines"
  | "beams"
  | "production"
  | "takas"
  | "mill_outverts"
  | "mill_inverts"
  | "machine_info"
  | "mill_summary"
  | "firms"
  | "mills"
  | "dashboard";

type Action = "view" | "create" | "edit" | "delete";

const actionToField: Record<
  Action,
  "canView" | "canCreate" | "canEdit" | "canDelete"
> = {
  view: "canView",
  create: "canCreate",
  edit: "canEdit",
  delete: "canDelete",
};

export function requirePermission(module: Module, action: Action) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      throw new AppError(401, "Authentication required", "UNAUTHENTICATED");
    }

    if (req.user.role === "super_admin") {
      next();
      return;
    }

    const field = actionToField[action];
    const permission = await prisma.adminPermission.findUnique({
      where: { userId_module: { userId: req.user.userId, module } },
      select: { [field]: true },
    });

    if (!permission || !permission[field]) {
      throw new AppError(
        403,
        "You do not have permission to perform this action",
        "FORBIDDEN",
      );
    }

    next();
  };
}
