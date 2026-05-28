import { describe, it, expect } from "vitest";
import { assertPublicWebhookUrl, isPublicAddress } from "./ssrfGuard.js";

describe("isPublicAddress", () => {
  it("accepts globally routable IPv4", () => {
    expect(isPublicAddress("1.1.1.1")).toBe(true);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("172.32.0.1")).toBe(true); // just outside 172.16/12
  });

  it("rejects private, loopback, link-local and CGNAT IPv4", () => {
    expect(isPublicAddress("10.0.0.1")).toBe(false);
    expect(isPublicAddress("127.0.0.1")).toBe(false);
    expect(isPublicAddress("169.254.169.254")).toBe(false); // cloud metadata
    expect(isPublicAddress("172.16.0.1")).toBe(false);
    expect(isPublicAddress("172.31.255.255")).toBe(false);
    expect(isPublicAddress("192.168.1.1")).toBe(false);
    expect(isPublicAddress("100.64.0.1")).toBe(false);
    expect(isPublicAddress("0.0.0.0")).toBe(false);
  });

  it("handles IPv6 loopback, link-local, ULA and mapped v4", () => {
    expect(isPublicAddress("::1")).toBe(false);
    expect(isPublicAddress("fe80::1")).toBe(false);
    expect(isPublicAddress("fd00::1")).toBe(false);
    expect(isPublicAddress("::ffff:10.0.0.1")).toBe(false);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
});

describe("assertPublicWebhookUrl", () => {
  it("rejects non-https schemes", async () => {
    await expect(assertPublicWebhookUrl("http://example.com/hook")).rejects.toThrow(/https/);
  });

  it("rejects internal literal-IP targets without needing DNS", async () => {
    await expect(assertPublicWebhookUrl("https://127.0.0.1/hook")).rejects.toThrow();
    await expect(assertPublicWebhookUrl("https://169.254.169.254/latest")).rejects.toThrow();
    await expect(assertPublicWebhookUrl("https://10.0.0.5/internal")).rejects.toThrow();
  });

  it("allows a public literal-IP https target", async () => {
    await expect(assertPublicWebhookUrl("https://1.1.1.1/hook")).resolves.toBeUndefined();
  });

  it("rejects malformed urls", async () => {
    await expect(assertPublicWebhookUrl("not a url")).rejects.toThrow();
  });
});
