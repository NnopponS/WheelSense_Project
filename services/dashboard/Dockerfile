# Build stage
FROM node:20-alpine as builder

WORKDIR /app

# Ensure devDependencies are installed (NODE_ENV not set to production)
ENV NODE_ENV=development

# Build arguments for environment (set early for caching)
ARG VITE_API_URL=http://localhost:8000
ARG VITE_MCP_URL=http://localhost:8080
ARG VITE_MQTT_WS_URL=ws://localhost:9001

# Set environment variables
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MCP_URL=$VITE_MCP_URL
ENV VITE_MQTT_WS_URL=$VITE_MQTT_WS_URL

# Copy package files first (cached unless package files change)
COPY package*.json ./

# Install dependencies (cached unless package files change)
# This layer is cached when only source code changes
RUN npm install

# Copy source code LAST (only invalidates cache when source changes)
# This way npm install is cached when only source code changes
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config (main config file, not conf.d)
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
