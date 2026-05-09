import { z } from "zod";

export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  retryAfterMs: z.number().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const PlanSchema = z.enum(["free", "pro", "team"]);
export type Plan = z.infer<typeof PlanSchema>;

export const OrgRoleSchema = z.enum(["owner", "admin", "member"]);
export type OrgRole = z.infer<typeof OrgRoleSchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  keyPrefix: z.string(),
  name: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().nullable(),
  revoked: z.boolean(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
});

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export const WebhookEventSchema = z.enum([
  "cost_spike",
  "error_rate_threshold",
  "trace_completed",
]);
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export const CreateWebhookSchema = z.object({
  url: z
    .string()
    .url()
    .refine(
      (u) => new URL(u).protocol === "https:",
      { message: "Webhook URL must use https" },
    ),
  events: z.array(WebhookEventSchema).min(1),
});

export const PaginationSchema = z.object({
  page: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1))
    .default("1"),
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(100))
    .default("50"),
});

export const TraceListFilterSchema = PaginationSchema.extend({
  agentId: z.string().optional(),
  status: z.enum(["running", "completed", "error"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
});