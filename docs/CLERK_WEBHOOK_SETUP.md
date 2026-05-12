# Clerk webhook setup

**Required before the first production user signs up.** Without this, new sign-ups never get a row in the `users` table, every authenticated API call returns 403, and OnboardingGate's project-creation request hangs.

## What it does

`POST /v1/auth/webhooks/clerk` receives Clerk events and writes to Postgres:
- `user.created` / `user.updated` → upsert into `users`
- `organization.created` / `organization.updated` → upsert into `organizations`
- `organizationMembership.created` → insert into `org_members`

These rows are what `clerkSessionAuth` middleware joins against to authorize API calls. No row = no auth.

## Setup (one-time, per environment)

1. Deploy the API. Confirm `https://<api-url>/v1/auth/webhooks/clerk` returns 400 ("missing signature") on `curl -X POST`. If it 404s, the route isn't mounted — fix that first.

2. In the Clerk dashboard:
   - **Webhooks → Add Endpoint**
   - URL: `https://<api-url>/v1/auth/webhooks/clerk`
   - Subscribe to events: `user.created`, `user.updated`, `organization.created`, `organization.updated`, `organizationMembership.created`
   - Copy the **Signing Secret** (starts with `whsec_`)

3. Set the secret on the API service:
   ```
   CLERK_WEBHOOK_SECRET=whsec_...
   ```
   Restart the API.

4. Test: sign up a new throwaway user in your app. In Clerk dashboard → Webhooks → your endpoint → **Message Attempts**, you should see 2xx responses for `user.created` and (if they create an org) `organization.created`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Webhook 401 "invalid signature" | `CLERK_WEBHOOK_SECRET` doesn't match the dashboard. Re-copy. |
| Webhook 400 "missing signature" | Clerk isn't sending Svix headers — check the endpoint URL is exactly `/v1/auth/webhooks/clerk`. |
| Webhook 2xx but user can't create projects | Check `users` and `org_members` tables — if rows are missing, the handler is being hit but failing silently. Check API logs. |
| User signs up but never appears in `users` table | Webhook isn't registered, or `user.created` isn't in the subscription list. |

## Replaying events

Clerk dashboard → Webhooks → endpoint → message → **Resend**. Useful when you set up the webhook after some users already signed up — replay `user.created` for each.

For a fresh database where you've already signed up before configuring the webhook, the simplest path is to delete the Clerk user and re-create it, which fires a new `user.created`.

## Local development

The webhook is only needed for users who sign up *while the webhook is configured*. For local dev with `ngrok`:
1. `ngrok http 3001` → copy the https URL
2. Add a second Clerk endpoint pointing at `<ngrok-url>/v1/auth/webhooks/clerk`
3. Use a separate `whsec_` for local; do not reuse production's

If skipping ngrok, you can manually insert rows into `users` / `organizations` / `org_members` to unblock dev work.
