# Multi-stage Dockerfile for Blobberman

# Stage 1: Build the frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy frontend files and install dependencies
COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/
RUN cd frontend && pnpm install --frozen-lockfile

# Copy the rest of the frontend code and build
COPY frontend/ ./frontend/
RUN cd frontend && pnpm run build

# Stage 2: Build the backend
FROM golang:1.24-alpine AS backend-builder
WORKDIR /app

# Copy go.mod and go.sum first for dependency caching
COPY backend/go.mod backend/go.sum ./backend/
RUN cd backend && go mod download

# Copy the rest of the backend code
COPY backend/ ./backend/

# Create the public directory and copy frontend files
COPY --from=frontend-builder /app/frontend/dist/ ./backend/public/

# Build the backend
RUN cd backend && go build -o server ./cmd/server.go

# Stage 3: Final lightweight image
FROM alpine:3.18
WORKDIR /app

# Install CA certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Copy the built binary and public directory
COPY --from=backend-builder /app/backend/server ./
COPY --from=backend-builder /app/backend/public/ ./public/

# Expose the server port
EXPOSE 8080

# Set entry point
ENTRYPOINT ["/app/server"]

# Default arguments
CMD ["--addr=:8080", "--static-dir=./public", "--tick-interval=50", "--max-ticks=3000", "--reset-timeout=5"]
