import { z } from "zod";

export const StepTypeSchema = z.enum([
  "llm_call",
  "tool_call",
  "retrieval",
  "human",
  "custom",
]);
export type StepType = z.infer<typeof StepTypeSchema>;

export const EnvSchema = z.enum(["prod", "dev", "staging"]);
export type Env = z.infer<typeof EnvSchema>;

export const TraceStatusSchema = z.enum(["running", "completed", "error"]);
export type TraceStatus = z.infer<typeof TraceStatusSchema>;

export const TokenUsageSchema = z.object({
  prompt: z.number().int().nonnegative(),
  completion: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const TraceStepInputSchema = z.object({
  stepId: z.string().uuid().optional(),
  type: StepTypeSchema,
  name: z.string().min(1).max(200),
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  tokenUsage: TokenUsageSchema.optional(),
  costUsd: z.number().nonnegative().optional(),
  model: z.string().max(100).optional(),
  error: z.string().nullable().optional(),
  toolName: z.string().max(100).optional(),
  toolVersion: z.string().max(50).optional(),
  timestamp: z.string().datetime().optional(),
});
export type TraceStepInput = z.infer<typeof TraceStepInputSchema>;

export const IngestPayloadSchema = z.object({
  traceId: z.string().uuid().optional(),
  agentId: z.string().min(1).max(200),
  sessionId: z.string().max(200).optional(),
  userId: z.string().max(200).optional(),
  env: EnvSchema.default("prod"),
  steps: z.array(TraceStepInputSchema).min(1).max(500),
  status: TraceStatusSchema.default("completed"),
  totalLatencyMs: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  totalCostUsd: z.number().nonnegative().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type IngestPayload = z.infer<typeof IngestPayloadSchema>;

export const IngestResponseSchema = z.object({
  traceId: z.string().uuid(),
  stepsQueued: z.number().int(),
  status: z.literal("queued"),
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

// API response shapes — rows returned by GET /v1/traces and GET /v1/traces/:id
export const TraceRowSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  agentId: z.string(),
  sessionId: z.string().nullable(),
  userId: z.string().nullable(),
  env: z.string(),
  status: TraceStatusSchema,
  totalLatencyMs: z.number().nullable(),
  totalTokens: z.number().nullable(),
  totalCostUsd: z.string().nullable(),
  metadata: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
});
export type TraceRow = z.infer<typeof TraceRowSchema>;

export const TraceStepRowSchema = z.object({
  id: z.string().uuid(),
  traceId: z.string().uuid(),
  stepIndex: z.number(),
  type: StepTypeSchema,
  name: z.string(),
  input: z.string().nullable(),
  output: z.string().nullable(),
  latencyMs: z.number().nullable(),
  promptTokens: z.number().nullable(),
  completionTokens: z.number().nullable(),
  totalTokens: z.number().nullable(),
  costUsd: z.string().nullable(),
  error: z.string().nullable(),
  model: z.string().nullable(),
  toolName: z.string().nullable(),
  toolVersion: z.string().nullable(),
  timestamp: z.string(),
});
export type TraceStepRow = z.infer<typeof TraceStepRowSchema>;
