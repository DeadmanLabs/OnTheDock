#!/bin/bash

echo "🚀 Starting OnTheDock Demo Application"
echo "======================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running!${NC}"
    echo "Please start Docker Desktop or Docker daemon and try again."
    exit 1
fi

echo -e "${GREEN}✅ Docker is running${NC}"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
fi

# Try to build the library (but continue even if it fails)
echo -e "${YELLOW}🔨 Building library (errors will be ignored for demo)...${NC}"
cd packages/docker-control
npm run build 2>/dev/null || true
cd ../..

# Start backend
echo -e "${YELLOW}🔧 Starting backend server...${NC}"
cd test/backend
npm install --silent
npm run dev &
BACKEND_PID=$!
cd ../..

# Wait for backend to start
echo -e "${YELLOW}⏳ Waiting for backend to start...${NC}"
sleep 5

# Start frontend
echo -e "${YELLOW}🎨 Starting frontend server...${NC}"
cd test/frontend
npm install --silent
npm run dev &
FRONTEND_PID=$!
cd ../..

echo ""
echo -e "${GREEN}✨ Demo application is starting!${NC}"
echo ""
echo "📍 Backend API: http://localhost:3000"
echo "🌐 Frontend UI: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Stopping servers...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo -e "${GREEN}✅ Servers stopped${NC}"
    exit 0
}

# Set up trap for cleanup
trap cleanup INT TERM

# Keep script running
wait