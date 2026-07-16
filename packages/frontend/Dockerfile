FROM node:24-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build -w packages/frontend

FROM nginx:alpine
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
