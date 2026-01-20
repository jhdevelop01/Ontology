#!/bin/bash

# UPW Ontology System Stop Script
# 모든 서버를 종료합니다.

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==================================="
echo "UPW Ontology System Stopping..."
echo "==================================="

# Backend 종료 (포트 5001)
echo "[1/3] Stopping Backend..."
lsof -ti:5001 | xargs kill -9 2>/dev/null || echo "Backend not running"

# Frontend 종료 (포트 3000)
echo "[2/3] Stopping Frontend..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || echo "Frontend not running"

# Neo4j 종료
echo "[3/3] Stopping Neo4j..."
cd "$PROJECT_ROOT/docker"
docker-compose down

echo "==================================="
echo "All services stopped."
echo "==================================="
