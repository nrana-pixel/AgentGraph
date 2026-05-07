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
