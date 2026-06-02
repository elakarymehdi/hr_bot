# ============================================================
# Stage 1: Build the React app with Vite
# ============================================================
FROM node:22-alpine AS builder

# Build-time args injected by docker-compose from .env
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Expose build args as env vars so Vite can statically replace them
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# ============================================================
# Stage 2: Serve with nginx (very small)
# ============================================================
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config: proxy /api/ to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
