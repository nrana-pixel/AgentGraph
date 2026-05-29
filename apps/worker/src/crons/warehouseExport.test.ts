import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Exporter } from "../lib/exporters/types.js";

// getExporter is module-imported by warehouseExport; mock it so we can inject a
// fake exporter and never touch real S3/AWS.
const fakeExport = vi.fn<Exporter["export"]>(async () => {});
vi.mock("../lib/exporters/index.js", () => ({
  getExporter: vi.fn((): Exporter => ({ name: "fake", export: fakeExport })),
}));

import { tracesToNdjson, maxStartedAt, runWarehouseExport } from "./warehouseExport.js";
import { getExporter } from "../lib/exporters/index.js";

const D = (s: string) => new Date(s);

function trace(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    projectId: "proj-1",
    agentId: "agent-1",
    status: "completed",
    env: "prod",
    totalCostUsd: "1.250000",
    totalTokens: 1200,
    totalLatencyMs: 800,
    startedAt: D("2026-05-28T10:00:00.000Z"),
    endedAt: D("2026-05-28T10:00:01.000Z"),
    metadata: '{"foo":"bar"}',
    ...overrides,
  };
}

describe("tracesToNdjson", () => {
  it("serializes one JSON object per line", () => {
    const out = tracesToNdjson([trace(), trace({ id: "2" })] as never);
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).id).toBe("11111111-1111-1111-1111-111111111111");
    expect(JSON.parse(lines[1]!).id).toBe("2");
  });

  it("parses stored metadata string back into a nested object", () => {
    const row = JSON.parse(tracesToNdjson([trace()] as never));
    expect(row.metadata).toEqual({ foo: "bar" });
  });

  it("falls back to {} for null or malformed metadata", () => {
    const nullMeta = JSON.parse(tracesToNdjson([trace({ metadata: null })] as never));
    expect(nullMeta.metadata).toEqual({});
    const badMeta = JSON.parse(tracesToNdjson([trace({ metadata: "{not json" })] as never));
    expect(badMeta.metadata).toEqual({});
  });

  it("coerces numeric cost to a number and timestamps to ISO strings", () => {
    const row = JSON.parse(tracesToNdjson([trace()] as never));
    expect(row.totalCostUsd).toBe(1.25);
    expect(row.startedAt).toBe("2026-05-28T10:00:00.000Z");
    expect(row.endedAt).toBe("2026-05-28T10:00:01.000Z");
  });

  it("emits nulls for missing optional fields", () => {
    const row = JSON.parse(
      tracesToNdjson([
        trace({ totalCostUsd: null, totalTokens: null, totalLatencyMs: null, endedAt: null }),
      ] as never),
    );
    expect(row.totalCostUsd).toBeNull();
    expect(row.totalTokens).toBeNull();
    expect(row.totalLatencyMs).toBeNull();
    expect(row.endedAt).toBeNull();
  });
});

describe("maxStartedAt", () => {
  it("returns the latest startedAt", () => {
    const max = maxStartedAt([
      { startedAt: D("2026-05-28T10:00:00.000Z") },
      { startedAt: D("2026-05-28T12:00:00.000Z") },
      { startedAt: D("2026-05-28T11:00:00.000Z") },
    ]);
    expect(max?.toISOString()).toBe("2026-05-28T12:00:00.000Z");
  });

  it("ignores null timestamps", () => {
    const max = maxStartedAt([
      { startedAt: null },
      { startedAt: D("2026-05-28T09:00:00.000Z") },
      { startedAt: null },
    ]);
    expect(max?.toISOString()).toBe("2026-05-28T09:00:00.000Z");
  });

  it("returns null when there are no usable timestamps", () => {
    expect(maxStartedAt([{ startedAt: null }])).toBeNull();
    expect(maxStartedAt([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runWarehouseExport — drive the cron with a chainable fake db. The select
// chain (.from().where().orderBy().limit()) resolves to the queued trace rows;
// the update chain (.set().where()) records the writes we assert on.
// ---------------------------------------------------------------------------

interface FakeDb {
  updates: Array<Record<string, unknown>>;
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

function makeDb(configs: unknown[], traceRows: unknown[]): FakeDb {
  const updates: Array<Record<string, unknown>> = [];
  let selectCall = 0;

  const select = vi.fn(() => {
    selectCall += 1;
    // First select() => configs; subsequent selects => trace rows.
    if (selectCall === 1) {
      return { from: () => ({ where: () => Promise.resolve(configs) }) };
    }
    return {
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => Promise.resolve(traceRows) }),
        }),
      }),
    };
  });

  const update = vi.fn(() => ({
    set: (patch: Record<string, unknown>) => {
      updates.push(patch);
      return { where: () => Promise.resolve() };
    },
  }));

  return { updates, select, update };
}

describe("runWarehouseExport", () => {
  beforeEach(() => {
    fakeExport.mockClear();
    vi.mocked(getExporter).mockClear();
  });

  it("exports queued traces and advances the high-water mark to the max startedAt", async () => {
    const config = {
      id: "cfg-1",
      projectId: "proj-1",
      destination: "s3",
      config: '{"bucket":"b"}',
      format: "ndjson",
      enabled: true,
      highWaterMark: null,
    };
    const rows = [
      trace({ id: "a", startedAt: D("2026-05-28T10:00:00.000Z") }),
      trace({ id: "b", startedAt: D("2026-05-28T12:00:00.000Z") }),
    ];
    const db = makeDb([config], rows);

    await runWarehouseExport(db as never);

    // Exporter was called once with the serialized NDJSON + cursor meta.
    expect(fakeExport).toHaveBeenCalledTimes(1);
    const [ndjson, meta] = fakeExport.mock.calls[0]!;
    expect(ndjson.split("\n")).toHaveLength(2);
    expect(meta).toEqual({ projectId: "proj-1", cursor: "2026-05-28T12:00:00.000Z" });

    // Cursor advanced to the latest startedAt and lastRunAt set.
    const advance = db.updates.find((u) => "highWaterMark" in u);
    expect((advance!["highWaterMark"] as Date).toISOString()).toBe("2026-05-28T12:00:00.000Z");
    expect(advance!["lastRunAt"]).toBeInstanceOf(Date);
  });

  it("does not advance the cursor when there are no new traces", async () => {
    const config = {
      id: "cfg-1",
      projectId: "proj-1",
      destination: "s3",
      config: "{}",
      format: "ndjson",
      enabled: true,
      highWaterMark: D("2026-05-28T00:00:00.000Z"),
    };
    const db = makeDb([config], []);

    await runWarehouseExport(db as never);

    expect(fakeExport).not.toHaveBeenCalled();
    // Records lastRunAt but never touches highWaterMark.
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]).not.toHaveProperty("highWaterMark");
    expect(db.updates[0]).toHaveProperty("lastRunAt");
  });

  it("isolates a failing config — parquet throws and is caught, no cursor write", async () => {
    const config = {
      id: "cfg-1",
      projectId: "proj-1",
      destination: "s3",
      config: "{}",
      format: "parquet",
      enabled: true,
      highWaterMark: null,
    };
    const db = makeDb([config], [trace()]);

    await expect(runWarehouseExport(db as never)).resolves.toBeUndefined();
    expect(fakeExport).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
  });

  it("short-circuits when no configs are enabled", async () => {
    const db = makeDb([], []);
    await runWarehouseExport(db as never);
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(fakeExport).not.toHaveBeenCalled();
  });
});
