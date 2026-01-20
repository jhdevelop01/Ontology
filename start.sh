#!/bin/bash

# UPW Ontology System Startup Script
# 모든 서버를 한 번에 실행합니다.

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==================================="
echo "UPW Ontology System Starting..."
echo "==================================="

# 1. Neo4j 시작
echo "[1/3] Starting Neo4j..."
cd "$PROJECT_ROOT/docker"
docker-compose up -d
sleep 3

# 2. Backend 시작 (백그라운드)
echo "[2/3] Starting Backend..."
cd "$PROJECT_ROOT"
source .venv/bin/activate
python backend/run.py &
BACKEND_PID=$!
sleep 2

# 3. Frontend 시작
echo "[3/3] Starting Frontend..."
cd "$PROJECT_ROOT/frontend"
npm start &
FRONTEND_PID=$!

echo "==================================="
echo "All services started!"
echo "==================================="
echo ""
echo "Frontend:  http://localhost:3000"
echo "Backend:   http://localhost:5001"
echo "Neo4j:     http://localhost:7474"
echo ""
echo "Press Ctrl+C to stop all services"
echo "==================================="

# 종료 시 모든 프로세스 정리
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    cd "$PROJECT_ROOT/docker" && docker-compose down
    echo "All services stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM

# 프로세스 대기
wait
