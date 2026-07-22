# ── Frontend: Vite build served by nginx ─────────────────────────────────────
# Stage 1: build the static bundle.
FROM node:22-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite inlines env vars at build time, so the API URL must be present here.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Stage 2: serve the built assets. The final image contains only nginx +
# static files — no Node, no node_modules — so it stays tiny (~25MB).
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
