FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json turbo.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/types/package.json ./packages/types/
RUN npm install --workspace=@agentgraph/worker --workspace=@agentgraph/types

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=@agentgraph/types
RUN npm run build --workspace=@agentgraph/worker

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/package.json ./

RUN npm install --production --workspace=@agentgraph/worker

CMD ["node", "apps/worker/dist/index.js"]
