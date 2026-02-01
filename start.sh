#!/bin/bash
# ============================================================
# UPW Predictive Maintenance System — Start All Services
# ============================================================
# Usage: ./start.sh
#
# Starts: Docker (Neo4j + InfluxDB) → Backend (Flask) → Frontend (React)
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
DOCKER_DIR="$PROJECT_DIR/docker"
VENV_DIR="$PROJECT_DIR/.venv"

LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  UPW Predictive Maintenance System${NC}"
echo -e "${BOLD}  Starting all services...${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""

# ----------------------------------------------------------
# 1. Docker (Neo4j + InfluxDB)
# ----------------------------------------------------------
echo -e "${YELLOW}[1/3] Docker containers (Neo4j, InfluxDB)...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}  ERROR: Docker not found. Please install Docker Desktop.${NC}"
    exit 1
fi

if ! docker info &> /dev/null 2>&1; then
    echo -e "${RED}  ERROR: Docker daemon is not running. Please start Docker Desktop.${NC}"
    exit 1
fi

cd "$DOCKER_DIR"
docker compose up -d 2>&1 | sed 's/^/  /'

echo -n "  Waiting for Neo4j"
for i in $(seq 1 30); do
    if docker exec upw-neo4j wget -q --spider http://localhost:7474 2>/dev/null; then
        echo -e " ${GREEN}ready${NC}"
        break
    fi
    [ "$i" -eq 30 ] && echo -e " ${YELLOW}timeout (may still be starting)${NC}"
    sleep 2
    echo -n "."
done

echo -e "${GREEN}  ✓ Docker containers started${NC}"
echo ""

# ----------------------------------------------------------
# 2. Backend (Flask + SocketIO)
# ----------------------------------------------------------
echo -e "${YELLOW}[2/3] Backend server (Flask, port 5001)...${NC}"

# Kill existing backend on port 5001
EXISTING_PID=$(lsof -ti:5001 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$EXISTING_PID" ]; then
    echo "  Stopping existing process on port 5001 (PID: $EXISTING_PID)..."
    kill "$EXISTING_PID" 2>/dev/null || true
    sleep 1
fi

# Activate venv
if [ -d "$VENV_DIR" ]; then
    source "$VENV_DIR/bin/activate"
else
    echo -e "${YELLOW}  Warning: .venv not found, using system Python${NC}"
fi

cd "$BACKEND_DIR"
nohup python run.py > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$LOG_DIR/backend.pid"

echo -n "  Waiting for backend"
for i in $(seq 1 20); do
    if lsof -ti:5001 -sTCP:LISTEN &>/dev/null; then
        echo -e " ${GREEN}ready (PID: $BACKEND_PID)${NC}"
        break
    fi
    if [ "$i" -eq 20 ]; then
        echo -e " ${RED}failed — check $LOG_DIR/backend.log${NC}"
        exit 1
    fi
    sleep 1
    echo -n "."
done

echo -e "${GREEN}  ✓ Backend started on http://localhost:5001${NC}"
echo ""

# ----------------------------------------------------------
# 3. Frontend (React)
# ----------------------------------------------------------
echo -e "${YELLOW}[3/3] Frontend server (React, port 3001)...${NC}"

# Kill existing frontend on port 3001
EXISTING_PID=$(lsof -ti:3001 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$EXISTING_PID" ]; then
    echo "  Stopping existing process on port 3001 (PID: $EXISTING_PID)..."
    kill "$EXISTING_PID" 2>/dev/null || true
    sleep 1
fi

cd "$FRONTEND_DIR"
BROWSER=none nohup npm start > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$LOG_DIR/frontend.pid"

echo -n "  Waiting for frontend"
for i in $(seq 1 40); do
    if lsof -ti:3001 -sTCP:LISTEN &>/dev/null; then
        echo -e " ${GREEN}ready (PID: $FRONTEND_PID)${NC}"
        break
    fi
    if [ "$i" -eq 40 ]; then
        echo -e " ${YELLOW}timeout — check $LOG_DIR/frontend.log${NC}"
    fi
    sleep 1
    echo -n "."
done

echo -e "${GREEN}  ✓ Frontend started on http://localhost:3001${NC}"
echo ""

# ----------------------------------------------------------
# Summary
# ----------------------------------------------------------
echo -e "${BOLD}============================================${NC}"
echo -e "  ${GREEN}All services started!${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
echo "  Neo4j Browser:   http://localhost:7475"
echo "  InfluxDB UI:     http://localhost:8086"
echo "  Backend API:     http://localhost:5001"
echo "  Frontend App:    http://localhost:3001"
echo ""
echo "  Logs:  $LOG_DIR/"
echo "  Stop:  ./stop.sh"
echo -e "${BOLD}============================================${NC}"
echo ""
