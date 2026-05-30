import { describe, it, expect } from "vitest";
import { scoreToolDescription } from "./toolDescriptionQuality.js";

const goodSchema = JSON.stringify({
  type: "object",
  properties: {
    amount: { type: "number", description: "Amount to charge in cents." },
    currency: { type: "string", description: "ISO 4217 currency code." },
  },
});

describe("scoreToolDescription", () => {
  it("scores a clear, typed, well-described tool ≥ 90 with no issues", () => {
    const { score, issues } = scoreToolDescription({
      name: "Create Charge",
      description: "Create a payment charge against a customer's card for a given amount.",
      inputSchema: goodSchema,
    });
    expect(issues).toEqual([]);
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it("flags too_short for a missing/tiny description", () => {
    const { issues } = scoreToolDescription({
      name: "Foo",
      description: "Does it",
      inputSchema: goodSchema,
    });
    expect(issues).toContain("too_short");
  });

  it("flags no_verb when the description doesn't open with an action verb", () => {
    const { issues } = scoreToolDescription({
      name: "Status",
      description: "A tool about the current system status and related metadata.",
      inputSchema: goodSchema,
    });
    expect(issues).toContain("no_verb");
  });

  it("flags vague generic descriptions", () => {
    const { issues } = scoreToolDescription({
      name: "Data Tool",
      description: "Handles data and manages things for various operations across the platform.",
      inputSchema: goodSchema,
    });
    expect(issues).toContain("vague");
  });

  it("flags placeholder text", () => {
    const { issues } = scoreToolDescription({
      name: "Widget",
      description: "TODO: your description here. lorem ipsum dolor sit amet.",
      inputSchema: goodSchema,
    });
    expect(issues).toContain("placeholder");
  });

  it("flags missing_input_schema when schema is null or empty", () => {
    expect(
      scoreToolDescription({
        name: "Send Email",
        description: "Send an email message to one or more recipients.",
        inputSchema: null,
      }).issues,
    ).toContain("missing_input_schema");
  });

  it("flags untyped_params and no_param_descriptions", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: { q: {}, limit: { type: "number" } },
    });
    const { issues } = scoreToolDescription({
      name: "Search Index",
      description: "Search the index for documents matching a query string.",
      inputSchema: schema,
    });
    expect(issues).toContain("untyped_params");
    expect(issues).toContain("no_param_descriptions");
  });

  it("flags name_collision for the *_status near-duplicate trio", () => {
    const cohort = ["get_status", "fetch_status", "query_status"];
    for (const name of cohort) {
      const { issues } = scoreToolDescription(
        {
          name,
          description: "Retrieve the status of the resource and return its current state.",
          inputSchema: goodSchema,
        },
        cohort,
      );
      expect(issues).toContain("name_collision");
    }
  });

  it("does not collide a distinct name in the same category", () => {
    const { issues } = scoreToolDescription(
      {
        name: "Send Slack Message",
        description: "Send a message to a Slack channel using the bot token.",
        inputSchema: goodSchema,
      },
      ["List Channels", "Upload File"],
    );
    expect(issues).not.toContain("name_collision");
  });

  it("clamps score to 0 for a maximally bad tool", () => {
    const { score } = scoreToolDescription({
      name: "x",
      description: "TODO",
      inputSchema: null,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(40);
  });
});
