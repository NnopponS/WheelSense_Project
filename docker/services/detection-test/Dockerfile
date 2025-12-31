# Multi-stage build for React app
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files first (cached unless package files change)
COPY package*.json ./

# Install dependencies (cached unless package files change)
RUN npm install

# Copy source files LAST (only invalidates cache when source changes)
# This way npm install is cached when only source code changes
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built app to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

