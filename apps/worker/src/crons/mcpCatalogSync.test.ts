import { describe, it, expect } from "vitest";
import { slugify, normalizeRegistryEntries } from "./mcpCatalogSync.js";

describe("slugify", () => {
  it("lowercases, strips punctuation, and hyphenates", () => {
    expect(slugify("SendGrid Email API!")).toBe("sendgrid-email-api");
  });
  it("trims leading/trailing separators", () => {
    expect(slugify("  @Stripe  ")).toBe("stripe");
  });
});

describe("normalizeRegistryEntries", () => {
  it("maps known fields and falls back unknown categories to 'other'", () => {
    const out = normalizeRegistryEntries([
      {
        name: "Stripe",
        description: "Payments",
        category: "payments",
        website: "https://stripe.com",
        githubUrl: "https://github.com/stripe/stripe-node",
        inputSchema: { type: "object", properties: { amount: { type: "number" } } },
      },
      { name: "Mystery Tool", category: "wat" },
    ]);
    expect(out).toHaveLength(2);
    const stripe = out.find((t) => t.slug === "stripe")!;
    expect(stripe.category).toBe("payments");
    expect(stripe.inputSchema).toContain("amount"); // object → stringified
    expect(out.find((t) => t.slug === "mystery-tool")!.category).toBe("other");
  });

  it("drops entries without a usable name and dedupes by slug", () => {
    const out = normalizeRegistryEntries([
      { description: "no name" },
      { name: "Acme" },
      { name: "acme", description: "dupe wins last" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.slug).toBe("acme");
    expect(out[0]!.description).toBe("dupe wins last");
  });

  it("accepts title/summary/homepage/repository aliases", () => {
    const out = normalizeRegistryEntries([
      { title: "Foo", summary: "a thing", homepage: "https://foo.dev", repository: "https://github.com/foo/foo" },
    ]);
    expect(out[0]).toMatchObject({
      name: "Foo",
      description: "a thing",
      website: "https://foo.dev",
      githubUrl: "https://github.com/foo/foo",
    });
  });
});
