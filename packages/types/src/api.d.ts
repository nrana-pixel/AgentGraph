import { z } from "zod";
export declare const ApiErrorSchema: z.ZodObject<{
    error: z.ZodString;
    message: z.ZodOptional<z.ZodString>;
    retryAfterMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    error: string;
    message?: string | undefined;
    retryAfterMs?: number | undefined;
}, {
    error: string;
    message?: string | undefined;
    retryAfterMs?: number | undefined;
}>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export declare const PlanSchema: z.ZodEnum<["free", "pro", "team"]>;
export type Plan = z.infer<typeof PlanSchema>;
export declare const OrgRoleSchema: z.ZodEnum<["owner", "admin", "member"]>;
export type OrgRole = z.infer<typeof OrgRoleSchema>;
export declare const ProjectSchema: z.ZodObject<{
    id: z.ZodString;
    orgId: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    slug: string;
    createdAt: string;
    orgId: string;
}, {
    name: string;
    id: string;
    slug: string;
    createdAt: string;
    orgId: string;
}>;
export type Project = z.infer<typeof ProjectSchema>;
export declare const ApiKeySchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    keyPrefix: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    lastUsedAt: z.ZodNullable<z.ZodString>;
    revoked: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    name: string | null;
    id: string;
    createdAt: string;
    projectId: string;
    keyPrefix: string;
    lastUsedAt: string | null;
    revoked: boolean;
}, {
    name: string | null;
    id: string;
    createdAt: string;
    projectId: string;
    keyPrefix: string;
    lastUsedAt: string | null;
    revoked: boolean;
}>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export declare const CreateProjectSchema: z.ZodObject<{
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export declare const CreateApiKeySchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
}, {
    name?: string | undefined;
}>;
export declare const WebhookEventSchema: z.ZodEnum<["cost_spike", "error_rate_threshold", "trace_completed"]>;
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;
export declare const CreateWebhookSchema: z.ZodObject<{
    url: z.ZodEffects<z.ZodString, string, string>;
    events: z.ZodArray<z.ZodEnum<["cost_spike", "error_rate_threshold", "trace_completed"]>, "many">;
}, "strip", z.ZodTypeAny, {
    url: string;
    events: ("cost_spike" | "error_rate_threshold" | "trace_completed")[];
}, {
    url: string;
    events: ("cost_spike" | "error_rate_threshold" | "trace_completed")[];
}>;
export declare const PaginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodPipeline<z.ZodEffects<z.ZodString, number, string>, z.ZodNumber>>;
    limit: z.ZodDefault<z.ZodPipeline<z.ZodEffects<z.ZodString, number, string>, z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
}, {
    limit?: string | undefined;
    page?: string | undefined;
}>;
export declare const TraceListFilterSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodPipeline<z.ZodEffects<z.ZodString, number, string>, z.ZodNumber>>;
    limit: z.ZodDefault<z.ZodPipeline<z.ZodEffects<z.ZodString, number, string>, z.ZodNumber>>;
} & {
    agentId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["running", "completed", "error"]>>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    status?: "running" | "completed" | "error" | undefined;
    agentId?: string | undefined;
    sessionId?: string | undefined;
    userId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
}, {
    status?: "running" | "completed" | "error" | undefined;
    agentId?: string | undefined;
    sessionId?: string | undefined;
    userId?: string | undefined;
    limit?: string | undefined;
    page?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
}>;
//# sourceMappingURL=api.d.ts.map