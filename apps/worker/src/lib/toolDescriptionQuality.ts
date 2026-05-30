/**
 * Tool-description quality scoring (spec 03).
 *
 * Pure + unit-testable. Scores a tool's description + input schema 0–100 and
 * returns the concrete issue codes that docked points. Heuristics only — the
 * optional LLM clarity pass is out of scope for v1 (degrades to heuristics).
 *
 * Score = 100 - Σ(weight of each fired issue), clamped to [0, 100].
 */

export type QualityIssueCode =
  | "too_short"
  | "no_verb"
  | "vague"
  | "missing_input_schema"
  | "untyped_params"
  | "no_param_descriptions"
  | "name_collision"
  | "placeholder";

// One weight table at the top, per spec. Tuned so a clear, typed, well-described
// tool stays ≥ 90 (no issues) while a vague/short/placeholder tool scores low.
const WEIGHTS: Record<QualityIssueCode, number> = {
  too_short: 30,
  no_verb: 15,
  vague: 20,
  missing_input_schema: 20,
  untyped_params: 15,
  no_param_descriptions: 10,
  name_collision: 15,
  placeholder: 25,
};

// Common action verbs a good tool description tends to open with. Matched
// case-insensitively against the first word.
const ACTION_VERBS = new Set([
  "get",
  "fetch",
  "retrieve",
  "list",
  "search",
  "query",
  "find",
  "read",
  "create",
  "add",
  "insert",
  "post",
  "send",
  "write",
  "update",
  "edit",
  "patch",
  "modify",
  "set",
  "delete",
  "remove",
  "cancel",
  "run",
  "execute",
  "call",
  "invoke",
  "trigger",
  "generate",
  "compute",
  "calculate",
  "convert",
  "transform",
  "parse",
  "validate",
  "check",
  "verify",
  "upload",
  "download",
  "store",
  "save",
  "publish",
  "subscribe",
  "schedule",
  "process",
  "analyze",
  "summarize",
  "translate",
  "embed",
  "index",
  "rank",
  "filter",
  "sort",
  "count",
  "aggregate",
  "export",
  "import",
  "sync",
  "refresh",
  "lookup",
  "resolve",
  "open",
  "close",
  "start",
  "stop",
  "enable",
  "disable",
  "manage",
  "handle",
  "return",
  "provide",
  "render",
  "build",
  "make",
  "load",
]);

// Generic filler words that, on their own, say nothing about what the tool does.
const VAGUE_PATTERNS = [
  /handles?\s+(data|things|stuff|requests?|operations?)/i,
  /manages?\s+(data|things|stuff|operations?)/i,
  /does?\s+(stuff|things)/i,
  /general\s+purpose/i,
  /various\s+(things|operations?|tasks?)/i,
];

const PLACEHOLDER_PATTERNS = [
  /\btodo\b/i,
  /\bexample\b/i,
  /\blorem\b/i,
  /your description here/i,
  /\bfixme\b/i,
  /\bplaceholder\b/i,
];

const MIN_DESCRIPTION_CHARS = 20;
// Token-overlap ratio above which two names in a category collide.
const NAME_COLLISION_THRESHOLD = 0.8;

export interface QualityTool {
  name: string;
  description: string | null;
  inputSchema: string | null;
}

export interface QualityResult {
  score: number;
  issues: QualityIssueCode[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Tokenise a tool name into ordered, lowercased word/identifier tokens. */
function nameTokenList(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

function nameTokens(name: string): Set<string> {
  return new Set(nameTokenList(name));
}

/** Jaccard-ish token overlap: |intersection| / |smaller set|. */
function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size);
}

/**
 * Two names collide when they overlap heavily OR they are verb-prefix
 * near-duplicates: same arity, identical except the leading (verb) token —
 * e.g. get_status / fetch_status / query_status. The latter is the exact
 * "models misfire on partial matches" pattern from the spec, which raw token
 * overlap (0.5 for a 2-token name) misses.
 */
function namesCollide(aName: string, bName: string): boolean {
  if (tokenOverlap(nameTokens(aName), nameTokens(bName)) >= NAME_COLLISION_THRESHOLD) {
    return true;
  }
  const a = nameTokenList(aName);
  const b = nameTokenList(bName);
  return (
    a.length === b.length &&
    a.length >= 2 &&
    a[0] !== b[0] &&
    a.slice(1).join(" ") === b.slice(1).join(" ")
  );
}

function parseSchema(raw: string | null): Record<string, unknown> | null {
  if (!raw || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Score one tool. `sameCategoryNames` is the list of OTHER tool names in the
 * same category (used only for name_collision); pass [] to skip that check.
 */
export function scoreToolDescription(
  tool: QualityTool,
  sameCategoryNames: string[] = [],
): QualityResult {
  const issues: QualityIssueCode[] = [];
  const description = (tool.description ?? "").trim();

  // --- Description heuristics -------------------------------------------
  if (description.length < MIN_DESCRIPTION_CHARS) {
    issues.push("too_short");
  } else {
    // Only meaningful when there's a real description to inspect.
    const firstWord = description
      .replace(/^[^a-zA-Z]+/, "")
      .split(/\s+/)[0]
      ?.toLowerCase();
    if (!firstWord || !ACTION_VERBS.has(firstWord)) {
      issues.push("no_verb");
    }
    if (VAGUE_PATTERNS.some((re) => re.test(description))) {
      issues.push("vague");
    }
  }

  if (PLACEHOLDER_PATTERNS.some((re) => re.test(description))) {
    issues.push("placeholder");
  }

  // --- Input-schema heuristics ------------------------------------------
  const schema = parseSchema(tool.inputSchema);
  const properties =
    schema && typeof schema["properties"] === "object" && schema["properties"] !== null
      ? (schema["properties"] as Record<string, unknown>)
      : null;
  const propEntries = properties ? Object.entries(properties) : [];

  if (!schema || propEntries.length === 0) {
    issues.push("missing_input_schema");
  } else {
    const propValues = propEntries.map(([, v]) =>
      v && typeof v === "object" ? (v as Record<string, unknown>) : {},
    );
    if (propValues.some((p) => typeof p["type"] !== "string" || p["type"] === "")) {
      issues.push("untyped_params");
    }
    if (
      propValues.some(
        (p) => typeof p["description"] !== "string" || (p["description"] as string).trim() === "",
      )
    ) {
      issues.push("no_param_descriptions");
    }
  }

  // --- Name collision within category -----------------------------------
  if (
    sameCategoryNames.some((other) => {
      if (other.toLowerCase() === tool.name.toLowerCase()) return false;
      return namesCollide(tool.name, other);
    })
  ) {
    issues.push("name_collision");
  }

  const penalty = issues.reduce((sum, code) => sum + WEIGHTS[code], 0);
  const score = clamp(100 - penalty, 0, 100);

  return { score, issues };
}
