#!/bin/bash
# ============================================================
# UPW Predictive Maintenance System — Stop All Services
# ============================================================
# Usage: ./stop.sh
#
# Stops: Frontend (React) → Backend (Flask) → Docker (Neo4j + InfluxDB)
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKER_DIR="$PROJECT_DIR/docker"
LOG_DIR="$PROJECT_DIR/logs"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  UPW Predictive Maintenance System${NC}"
echo -e "${BOLD}  Stopping all services...${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""

# ----------------------------------------------------------
# 1. Frontend (port 3001)
# ----------------------------------------------------------
echo -e "${YELLOW}[1/3] Stopping Frontend (port 3001)...${NC}"

STOPPED=false

# Try PID file first
if [ -f "$LOG_DIR/frontend.pid" ]; then
    PID=$(cat "$LOG_DIR/frontend.pid")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID" 2>/dev/null
        STOPPED=true
    fi
    rm -f "$LOG_DIR/frontend.pid"
fi

# Fallback: kill by port
PIDS=$(lsof -ti:3001 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill 2>/dev/null || true
    STOPPED=true
fi

if [ "$STOPPED" = true ]; then
    echo -e "${GREEN}  ✓ Frontend stopped${NC}"
else
    echo "  Frontend was not running"
fi
echo ""

# ----------------------------------------------------------
# 2. Backend (port 5001)
# ----------------------------------------------------------
echo -e "${YELLOW}[2/3] Stopping Backend (port 5001)...${NC}"

STOPPED=false

# Try PID file first
if [ -f "$LOG_DIR/backend.pid" ]; then
    PID=$(cat "$LOG_DIR/backend.pid")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID" 2>/dev/null
        STOPPED=true
    fi
    rm -f "$LOG_DIR/backend.pid"
fi

# Fallback: kill by port
PIDS=$(lsof -ti:5001 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill 2>/dev/null || true
    STOPPED=true
fi

if [ "$STOPPED" = true ]; then
    echo -e "${GREEN}  ✓ Backend stopped${NC}"
else
    echo "  Backend was not running"
fi
echo ""

# ----------------------------------------------------------
# 3. Docker (Neo4j + InfluxDB)
# ----------------------------------------------------------
echo -e "${YELLOW}[3/3] Stopping Docker containers...${NC}"

if command -v docker &> /dev/null && docker info &> /dev/null 2>&1; then
    cd "$DOCKER_DIR"
    docker compose down 2>&1 | sed 's/^/  /'
    echo -e "${GREEN}  ✓ Docker containers stopped${NC}"
else
    echo "  Docker not available or not running"
fi
echo ""

# ----------------------------------------------------------
# Summary
# ----------------------------------------------------------
echo -e "${BOLD}============================================${NC}"
echo -e "  ${GREEN}All services stopped.${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
