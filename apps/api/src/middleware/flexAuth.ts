import type { NextFunction, Request, Response } from "express";
import { apiKeyAuth } from "./apiKeyAuth.js";
import { clerkSessionAuth } from "./clerkSessionAuth.js";

export async function flexAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const bearer = req.headers["authorization"]?.slice(7) ?? "";
  if (bearer.startsWith("ag_")) {
    return apiKeyAuth(req, res, next);
  }
  return clerkSessionAuth(req, res, next);
}
