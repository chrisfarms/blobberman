#!/bin/bash
set -e

# Define paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_DIR="$PROJECT_ROOT/backend"
PUBLIC_DIR="$BACKEND_DIR/public"

# Print info
echo "Building Blobberman for production..."
echo "Project root: $PROJECT_ROOT"
echo "Frontend source: $FRONTEND_DIR"
echo "Backend source: $BACKEND_DIR"
echo "Public directory: $PUBLIC_DIR"

# Build frontend
echo "Building frontend..."
(cd "$FRONTEND_DIR" && pnpm run build)

# Copy frontend build to backend public directory
echo "Copying frontend build to backend public directory..."
rm -rf "$PUBLIC_DIR"/*
cp -r "$FRONTEND_DIR/dist/"* "$PUBLIC_DIR/"

# Build backend
echo "Building backend..."
cd "$BACKEND_DIR"
go build -o server ./cmd/server.go

echo "Build complete!"
echo "To run the production build:"
echo "  cd $BACKEND_DIR && ./server"
