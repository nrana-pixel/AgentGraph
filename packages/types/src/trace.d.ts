import { z } from "zod";
export declare const StepTypeSchema: z.ZodEnum<["llm_call", "tool_call", "retrieval", "human", "custom"]>;
export type StepType = z.infer<typeof StepTypeSchema>;
export declare const EnvSchema: z.ZodEnum<["prod", "dev", "staging"]>;
export type Env = z.infer<typeof EnvSchema>;
export declare const TraceStatusSchema: z.ZodEnum<["running", "completed", "error"]>;
export type TraceStatus = z.infer<typeof TraceStatusSchema>;
export declare const TokenUsageSchema: z.ZodObject<{
    prompt: z.ZodNumber;
    completion: z.ZodNumber;
    total: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    prompt: number;
    completion: number;
    total: number;
}, {
    prompt: number;
    completion: number;
    total: number;
}>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export declare const TraceStepInputSchema: z.ZodObject<{
    stepId: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["llm_call", "tool_call", "retrieval", "human", "custom"]>;
    name: z.ZodString;
    input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    output: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    latencyMs: z.ZodOptional<z.ZodNumber>;
    tokenUsage: z.ZodOptional<z.ZodObject<{
        prompt: z.ZodNumber;
        completion: z.ZodNumber;
        total: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        prompt: number;
        completion: number;
        total: number;
    }, {
        prompt: number;
        completion: number;
        total: number;
    }>>;
    costUsd: z.ZodOptional<z.ZodNumber>;
    model: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    toolName: z.ZodOptional<z.ZodString>;
    toolVersion: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "llm_call" | "tool_call" | "retrieval" | "human" | "custom";
    name: string;
    error?: string | null | undefined;
    stepId?: string | undefined;
    input?: Record<string, unknown> | undefined;
    output?: Record<string, unknown> | undefined;
    latencyMs?: number | undefined;
    tokenUsage?: {
        prompt: number;
        completion: number;
        total: number;
    } | undefined;
    costUsd?: number | undefined;
    model?: string | undefined;
    toolName?: string | undefined;
    toolVersion?: string | undefined;
    timestamp?: string | undefined;
}, {
    type: "llm_call" | "tool_call" | "retrieval" | "human" | "custom";
    name: string;
    error?: string | null | undefined;
    stepId?: string | undefined;
    input?: Record<string, unknown> | undefined;
    output?: Record<string, unknown> | undefined;
    latencyMs?: number | undefined;
    tokenUsage?: {
        prompt: number;
        completion: number;
        total: number;
    } | undefined;
    costUsd?: number | undefined;
    model?: string | undefined;
    toolName?: string | undefined;
    toolVersion?: string | undefined;
    timestamp?: string | undefined;
}>;
export type TraceStepInput = z.infer<typeof TraceStepInputSchema>;
export declare const IngestPayloadSchema: z.ZodObject<{
    traceId: z.ZodOptional<z.ZodString>;
    agentId: z.ZodString;
    sessionId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
    env: z.ZodDefault<z.ZodEnum<["prod", "dev", "staging"]>>;
    steps: z.ZodArray<z.ZodObject<{
        stepId: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["llm_call", "tool_call", "retrieval", "human", "custom"]>;
        name: z.ZodString;
        input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        output: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        latencyMs: z.ZodOptional<z.ZodNumber>;
        tokenUsage: z.ZodOptional<z.ZodObject<{
            prompt: z.ZodNumber;
            completion: z.ZodNumber;
            total: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            prompt: number;
            completion: number;
            total: number;
        }, {
            prompt: number;
            completion: number;
            total: number;
        }>>;
        costUsd: z.ZodOptional<z.ZodNumber>;
        model: z.ZodOptional<z.ZodString>;
        error: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        toolName: z.ZodOptional<z.ZodString>;
        toolVersion: z.ZodOptional<z.ZodString>;
        timestamp: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "llm_call" | "tool_call" | "retrieval" | "human" | "custom";
        name: string;
        error?: string | null | undefined;
        stepId?: string | undefined;
        input?: Record<string, unknown> | undefined;
        output?: Record<string, unknown> | undefined;
        latencyMs?: number | undefined;
        tokenUsage?: {
            prompt: number;
            completion: number;
            total: number;
        } | undefined;
        costUsd?: number | undefined;
        model?: string | undefined;
        toolName?: string | undefined;
        toolVersion?: string | undefined;
        timestamp?: string | undefined;
    }, {
        type: "llm_call" | "tool_call" | "retrieval" | "human" | "custom";
        name: string;
        error?: string | null | undefined;
        stepId?: string | undefined;
        input?: Record<string, unknown> | undefined;
        output?: Record<string, unknown> | undefined;
        latencyMs?: number | undefined;
        tokenUsage?: {
            prompt: number;
            completion: number;
            total: number;
        } | undefined;
        costUsd?: number | undefined;
        model?: string | undefined;
        toolName?: string | undefined;
        toolVersion?: string | undefined;
        timestamp?: string | undefined;
    }>, "many">;
    status: z.ZodDefault<z.ZodEnum<["running", "completed", "error"]>>;
    totalLatencyMs: z.ZodOptional<z.ZodNumber>;
    totalTokens: z.ZodOptional<z.ZodNumber>;
    totalCostUsd: z.ZodOptional<z.ZodNumber>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    status: "running" | "completed" | "error";
    agentId: string;
    env: "prod" | "dev" | "staging";
    steps: {
        type: "llm_call" | "tool_call" | "retrieval" | "human" | "custom";
        name: string;
        error?: string | null | undefined;
        stepId?: string | undefined;
        input?: Record<string, unknown> | undefined;
        output?: Record<string, unknown> | undefined;
        latencyMs?: number | undefined;
        tokenUsage?: {
            prompt: number;
            completion: number;
            total: number;
        } | undefined;
        costUsd?: number | undefined;
        model?: string | undefined;
        toolName?: string | undefined;
        toolVersion?: string | undefined;
        timestamp?: string | undefined;
    }[];
    metadata: Record<string, unknown>;
    traceId?: string | undefined;
    sessionId?: string | undefined;
    userId?: string | undefined;
    totalLatencyMs?: number | undefined;
    totalTokens?: number | undefined;
    totalCostUsd?: number | undefined;
}, {
    agentId: string;
    steps: {
        type: "llm_call" | "tool_call" | "retrieval" | "human" | "custom";
        name: string;
        error?: string | null | undefined;
        stepId?: string | undefined;
        input?: Record<string, unknown> | undefined;
        output?: Record<string, unknown> | undefined;
        latencyMs?: number | undefined;
        tokenUsage?: {
            prompt: number;
            completion: number;
            total: number;
        } | undefined;
        costUsd?: number | undefined;
        model?: string | undefined;
        toolName?: string | undefined;
        toolVersion?: string | undefined;
        timestamp?: string | undefined;
    }[];
    status?: "running" | "completed" | "error" | undefined;
    traceId?: string | undefined;
    sessionId?: string | undefined;
    userId?: string | undefined;
    env?: "prod" | "dev" | "staging" | undefined;
    totalLatencyMs?: number | undefined;
    totalTokens?: number | undefined;
    totalCostUsd?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export type IngestPayload = z.infer<typeof IngestPayloadSchema>;
export declare const IngestResponseSchema: z.ZodObject<{
    traceId: z.ZodString;
    stepsQueued: z.ZodNumber;
    status: z.ZodLiteral<"queued">;
}, "strip", z.ZodTypeAny, {
    status: "queued";
    traceId: string;
    stepsQueued: number;
}, {
    status: "queued";
    traceId: string;
    stepsQueued: number;
}>;
export type IngestResponse = z.infer<typeof IngestResponseSchema>;
export declare const TraceRowSchema: z.ZodObject<{
    id: z.ZodString;
    agentId: z.ZodString;
    env: z.ZodString;
    status: z.ZodEnum<["running", "completed", "error"]>;
    totalLatencyMs: z.ZodNullable<z.ZodNumber>;
    totalTokens: z.ZodNullable<z.ZodNumber>;
    totalCostUsd: z.ZodNullable<z.ZodString>;
    startedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "running" | "completed" | "error";
    agentId: string;
    env: string;
    totalLatencyMs: number | null;
    totalTokens: number | null;
    totalCostUsd: string | null;
    id: string;
    startedAt: string;
}, {
    status: "running" | "completed" | "error";
    agentId: string;
    env: string;
    totalLatencyMs: number | null;
    totalTokens: number | null;
    totalCostUsd: string | null;
    id: string;
    startedAt: string;
}>;
export type TraceRow = z.infer<typeof TraceRowSchema>;
export declare const TraceStepRowSchema: z.ZodObject<{
    id: z.ZodString;
    traceId: z.ZodString;
    stepIndex: z.ZodNumber;
    type: z.ZodEnum<["llm_call", "tool_call", "retrieval", "human", "custom"]>;
    name: z.ZodString;
    input: z.ZodNullable<z.ZodString>;
    output: z.ZodNullable<z.ZodString>;
    latencyMs: z.ZodNullable<z.ZodNumber>;
    promptTokens: z.ZodNullable<z.ZodNumber>;
    completionTokens: z.ZodNullable<z.ZodNumber>;
    totalTokens: z.ZodNullable<z.ZodNumber>;
    costUsd: z.ZodNullable<z.ZodString>;
    error: z.ZodNullable<z.ZodString>;
    model: z.ZodNullable<z.ZodString>;
    toolName: z.ZodNullable<z.ZodString>;
    toolVersion: z.ZodNullable<z.ZodString>;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "llm_call" | "tool_call" | "retrieval" | "human" | "custom";
    error: string | null;
    name: string;
    input: string | null;
    output: string | null;
    latencyMs: number | null;
    costUsd: string | null;
    model: string | null;
    toolName: string | null;
    toolVersion: string | null;
    timestamp: string;
    traceId: string;
    totalTokens: number | null;
    id: string;
    stepIndex: number;
    promptTokens: number | null;
    completionTokens: number | null;
}, {
    type: "llm_call" | "tool_call" | "retrieval" | "human" | "custom";
    error: string | null;
    name: string;
    input: string | null;
    output: string | null;
    latencyMs: number | null;
    costUsd: string | null;
    model: string | null;
    toolName: string | null;
    toolVersion: string | null;
    timestamp: string;
    traceId: string;
    totalTokens: number | null;
    id: string;
    stepIndex: number;
    promptTokens: number | null;
    completionTokens: number | null;
}>;
export type TraceStepRow = z.infer<typeof TraceStepRowSchema>;
//# sourceMappingURL=trace.d.ts.map