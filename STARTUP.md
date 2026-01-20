# 서버 실행 절차

## 한 번에 실행 (권장)

```bash
./start.sh
```

모든 서비스(Neo4j, Backend, Frontend)가 자동으로 시작됩니다.
종료하려면 `Ctrl+C` 또는 `./stop.sh` 실행

---

## 최초 설치

### 1. Neo4j 데이터베이스 실행

```bash
cd docker && docker-compose up -d
```

### 2. 가상환경 생성 및 패키지 설치 (프로젝트 루트에서)

```bash
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
```

### 3. Neo4j 초기화 및 샘플 데이터 생성

```bash
python backend/scripts/init_neo4j.py
python backend/scripts/generate_upw_data.py
```

### 4. 프론트엔드 패키지 설치

```bash
cd frontend && npm install
```

---

## 일상 실행

### 터미널 1: Neo4j

```bash
cd docker && docker-compose up -d
```

### 터미널 2: Backend (프로젝트 루트에서)

```bash
source .venv/bin/activate && python backend/run.py
```

### 터미널 3: Frontend

```bash
cd frontend && npm start
```

---

## 접속 URL

| 서비스 | URL |
|--------|-----|
| 프론트엔드 | http://localhost:3000 |
| 백엔드 API | http://localhost:5001 |
| Neo4j Browser | http://localhost:7474 |

Neo4j 로그인: `neo4j` / `password`

---

## 종료 방법

```bash
# 한 번에 종료
./stop.sh
```

또는 수동 종료:
```bash
# Frontend/Backend: Ctrl+C

# Neo4j 종료
cd docker && docker-compose down
```

---

## 문제 해결

### Neo4j 연결 오류

```bash
# Neo4j 상태 확인
docker ps

# Neo4j 로그 확인
cd docker && docker-compose logs neo4j
```

### 포트 충돌

```bash
# 사용 중인 포트 확인
lsof -i :3000   # Frontend
lsof -i :5001   # Backend
lsof -i :7474   # Neo4j Browser
lsof -i :7687   # Neo4j Bolt
```
