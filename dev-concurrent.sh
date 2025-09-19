#!/bin/bash

# ===================================================
# GIS-NET Concurrent Development Script
# Alternative approach using concurrently npm package
# ===================================================

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() {
    echo -e "${GREEN}[GIS-NET]${NC} $1"
}

# Check if concurrently is installed
if ! npm list concurrently > /dev/null 2>&1; then
    log "Installing development dependencies..."
    npm install
fi

log "Starting GIS-NET development servers concurrently..."
echo -e "${BLUE}Backend:${NC}  http://localhost:4000"
echo -e "${BLUE}Frontend:${NC} http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Use concurrently to run both servers with prefixed output
npx concurrently \
    --prefix "[{name}]" \
    --names "backend,frontend" \
    --prefix-colors "blue,green" \
    "cd backend && npm run dev" \
    "cd frontend && npm start"
