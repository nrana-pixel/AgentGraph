import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
}));

import { verifyToken } from "@clerk/backend";
import { db } from "../db/index.js";
import {
  clerkSessionAuth,
  getClerkSessionAuthConfig,
  resolveUserIdentity,
} from "./clerkSessionAuth.js";

// Chainable mock that resolves to `rows` when awaited, regardless of which
// query-builder methods were called on it.
function makeChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  };
  Object.keys(chain).forEach((k) => {
    if (typeof chain[k] === "function" && k !== "then") {
      (chain[k] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  });
  return chain;
}

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("getClerkSessionAuthConfig", () => {
  it("returns null when CLERK_SECRET_KEY is unset", () => {
    delete process.env["CLERK_SECRET_KEY"];

    expect(getClerkSessionAuthConfig()).toBeNull();
  });

  it("parses optional Clerk verification settings", () => {
    process.env["CLERK_SECRET_KEY"] = "sk_test_123";
    process.env["CLERK_AUTHORIZED_PARTIES"] = "https://app.example.com, https://example.com";
    process.env["CLERK_JWT_AUDIENCE"] = "agentgraph-api";

    expect(getClerkSessionAuthConfig()).toEqual({
      secretKey: "sk_test_123",
      authorizedParties: ["https://app.example.com", "https://example.com"],
      audience: "agentgraph-api",
    });
  });
});

describe("resolveUserIdentity (strict identity isolation)", () => {
  it("refuses to rebind an existing email to a new clerk_id (returns null, no writes)", async () => {
    // byClerk lookup → none; byEmail lookup → a row owned by a different clerk_id.
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([]) as never)
      .mockReturnValueOnce(makeChain([{ id: "user-owned-by-someone-else" }]) as never);

    const result = await resolveUserIdentity("clerk_NEW", "reused@acme.com", "New Hire");

    expect(result).toBeNull();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("inserts a fresh row when neither clerk_id nor email exists", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([]) as never)
      .mockReturnValueOnce(makeChain([]) as never);
    vi.mocked(db.insert).mockReturnValue(makeChain([{ id: "user-new" }]) as never);

    const result = await resolveUserIdentity("clerk_A", "alice@acme.com", "Alice");

    expect(result).toBe("user-new");
    expect(db.insert).toHaveBeenCalledOnce();
  });

  it("keeps the same identity in sync when clerk_id already exists", async () => {
    // byClerk and byEmail resolve to the same row.
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([{ id: "user-1" }]) as never)
      .mockReturnValueOnce(makeChain([{ id: "user-1" }]) as never);
    vi.mocked(db.update).mockReturnValue(makeChain([]) as never);

    const result = await resolveUserIdentity("clerk_A", "alice@acme.com", "Alice A.");

    expect(result).toBe("user-1");
    expect(db.update).toHaveBeenCalledOnce();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("clerkSessionAuth", () => {
  it("returns a clear 503 when Clerk session auth is not configured", async () => {
    delete process.env["CLERK_SECRET_KEY"];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const app = express();
    app.get("/protected", clerkSessionAuth, (_req, res) => {
      res.json({ ok: true });
    });

    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer session-token");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: "auth_not_configured",
      message: "Clerk session authentication is not configured.",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[clerkSessionAuth] CLERK_SECRET_KEY is unset; refusing Clerk session authentication.",
    );
    expect(verifyToken).not.toHaveBeenCalled();
  });
});
