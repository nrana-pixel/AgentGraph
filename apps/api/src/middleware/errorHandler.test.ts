import { describe, it, expect, vi } from "vitest";
import { ZodError, ZodIssueCode } from "zod";
import type { Request, Response, NextFunction } from "express";
import { errorHandler } from "./errorHandler.js";

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
}

const req = {} as Request;
const next = vi.fn() as unknown as NextFunction;

describe("errorHandler", () => {
  it("returns 400 with validation_error for a ZodError", () => {
    const err = new ZodError([
      {
        code: ZodIssueCode.invalid_type,
        expected: "string",
        received: "undefined",
        path: ["agentId"],
        message: "Required",
      },
    ]);
    const res = makeRes();
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "validation_error" }),
    );
  });

  it("includes the dot-separated field path in the message", () => {
    const err = new ZodError([
      {
        code: ZodIssueCode.invalid_type,
        expected: "string",
        received: "undefined",
        path: ["steps", 0, "name"],
        message: "Required",
      },
    ]);
    const res = makeRes();
    errorHandler(err, req, res, next);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.message).toContain("steps.0.name");
  });

  it("joins multiple ZodError issues with semicolons", () => {
    const err = new ZodError([
      { code: ZodIssueCode.invalid_type, expected: "string", received: "undefined", path: ["agentId"], message: "Required" },
      { code: ZodIssueCode.too_small, minimum: 1, type: "array", inclusive: true, path: ["steps"], message: "Too small" },
    ]);
    const res = makeRes();
    errorHandler(err, req, res, next);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.message).toContain(";");
  });

  it("returns 500 with internal_server_error for a generic Error", () => {
    const res = makeRes();
    errorHandler(new Error("database exploded"), req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "internal_server_error" });
  });

  it("returns 500 for non-Error thrown values", () => {
    const res = makeRes();
    errorHandler("something went wrong", req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "internal_server_error" });
  });

  it("returns 500 for null thrown values", () => {
    const res = makeRes();
    errorHandler(null, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
