import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  db: { select: vi.fn() },
}));

import { verifyToken } from "@clerk/backend";
import {
  clerkSessionAuth,
  getClerkSessionAuthConfig,
} from "./clerkSessionAuth.js";

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
