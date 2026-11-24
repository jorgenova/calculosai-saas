FROM node:24-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci && cd packages/backend && npm run build

FROM node:24-alpine
WORKDIR /app/packages/backend
ENV NODE_ENV=production
RUN apk add --no-cache libxml2-utils
COPY packages/backend/package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/packages/backend/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
