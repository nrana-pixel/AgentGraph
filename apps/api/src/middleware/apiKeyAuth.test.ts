import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("bcrypt", () => ({
  default: { compare: vi.fn() },
}));

vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../db/schema.js", () => ({
  apiKeys: {},
  projects: {},
  organizations: {},
}));

import bcrypt from "bcrypt";
import { db } from "../db/index.js";
import { apiKeyAuth } from "./apiKeyAuth.js";

function makeChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    catch: vi.fn(),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  };
  Object.keys(chain).forEach((k) => {
    if (typeof chain[k] === "function" && k !== "then") {
      (chain[k] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  });
  return chain;
}

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
}

const next = vi.fn() as unknown as NextFunction;

describe("apiKeyAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects with 401 when Authorization header is missing", async () => {
    const req = { headers: {} } as Request;
    const res = makeRes();
    await apiKeyAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "missing_api_key" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects with 401 for non-Bearer schemes", async () => {
    const req = { headers: { authorization: "Basic dXNlcjpwYXNz" } } as Request;
    const res = makeRes();
    await apiKeyAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("calls next and attaches projectId/orgId when key matches", async () => {
    const dbRow = { id: "key-1", keyHash: "$2b$hash", projectId: "proj-1", orgId: "org-1", orgPlan: "pro" };
    vi.mocked(db.select).mockReturnValue(makeChain([dbRow]) as any);
    vi.mocked(db.update).mockReturnValue(makeChain([]) as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const req = { headers: { authorization: "Bearer ag_live_aaaaabbbbbb" } } as Request;
    const res = makeRes();
    await apiKeyAuth(req as any, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as any).projectId).toBe("proj-1");
    expect((req as any).orgId).toBe("org-1");
    expect((req as any).orgPlan).toBe("pro");
  });

  it("rejects with 401 when no DB key matches bcrypt", async () => {
    const dbRow = { id: "key-1", keyHash: "$2b$hash", projectId: "proj-1", orgId: "org-1", orgPlan: "free" };
    vi.mocked(db.select).mockReturnValue(makeChain([dbRow]) as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const req = { headers: { authorization: "Bearer ag_live_wrongkeyxxx" } } as Request;
    const res = makeRes();
    await apiKeyAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "invalid_api_key" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects with 401 when no keys exist in DB", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([]) as any);

    const req = { headers: { authorization: "Bearer ag_live_nokeysatall" } } as Request;
    const res = makeRes();
    await apiKeyAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
