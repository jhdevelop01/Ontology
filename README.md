# UPW Predictive Maintenance System

초순수(Ultrapure Water) 공정 설비의 예지보전 및 전기에너지 예측을 위한 온톨로지 기반 시스템

## 개요

이 프로젝트는 반도체/디스플레이 제조 공정에서 사용되는 초순수(UPW) 생산 설비의 예지보전(Predictive Maintenance)을 위한 시스템입니다. RDF/OWL 기반 온톨로지를 활용하여 설비, 센서, 관측 데이터 간의 관계를 체계적으로 관리합니다.

## 주요 기능

- **설비 모니터링**: RO(역삼투압), EDI(전기탈이온), UV 살균기, 펌프 등 UPW 공정 설비 실시간 모니터링
- **이상 탐지**: ML 기반 설비 이상 징후 자동 감지
- **건강도 점수**: 설비별 상태 점수화 및 시각화
- **에너지 예측**: 과거 10일 데이터 기반 다음 날 15분 단위 전력 사용량 예측
- **온톨로지 탐색**: Neo4j 스타일의 인터랙티브 그래프 시각화

## 기술 스택

| 구분 | 기술 |
|------|------|
| **Frontend** | React, TypeScript, react-force-graph-2d |
| **Backend** | Python Flask, REST API |
| **Database** | Neo4j + n10s (neosemantics) |
| **Ontology** | RDF/Turtle, OWL, SSN/SOSA, SAREF |
| **ML** | Scikit-learn, NumPy, Pandas |

## 프로젝트 구조

```
Ontology/
├── backend/                    # Flask 백엔드
│   ├── app/
│   │   ├── api/               # REST API 엔드포인트
│   │   ├── ml/                # ML 모델 (이상탐지, 에너지예측)
│   │   └── services/          # Neo4j 서비스
│   ├── scripts/               # 초기화 및 데이터 생성 스크립트
│   └── requirements.txt
├── frontend/                   # React 프론트엔드
│   ├── src/
│   │   ├── pages/             # 페이지 컴포넌트
│   │   ├── services/          # API 클라이언트
│   │   └── types/             # TypeScript 타입 정의
│   └── package.json
├── ontology/                   # 온톨로지 스키마
│   ├── core/                  # UPW 도메인 온톨로지
│   └── instances/             # 샘플 인스턴스 데이터
└── docker/                     # Docker 설정
    └── docker-compose.yml
```

## 설치 및 실행

### 1. Neo4j 데이터베이스 실행

```bash
cd docker
docker-compose up -d
```

Neo4j 접속: http://localhost:7474 (neo4j/password)

### 2. 백엔드 실행

```bash
# 프로젝트 루트에서 가상환경 생성 (최초 1회)
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt

# Neo4j 초기화 및 샘플 데이터 생성 (최초 1회)
python backend/scripts/init_neo4j.py
python backend/scripts/generate_upw_data.py

# 서버 실행
python backend/run.py
```

백엔드 API: http://localhost:5001

### 3. 프론트엔드 실행

```bash
cd frontend
npm install  # 최초 1회
npm start
```

프론트엔드: http://localhost:3000

## 빠른 실행 (설치 완료 후)

```bash
# 터미널 1: Neo4j
cd docker && docker-compose up -d

# 터미널 2: Backend (프로젝트 루트에서)
source .venv/bin/activate && python backend/run.py

# 터미널 3: Frontend
cd frontend && npm start
```

## 화면 구성

### Dashboard
- 시스템 전체 현황 (설비 수, 센서 수, 이상 탐지 건수)
- 설비 유형별 분포
- 건강도 분포 (정상/경고/위험)
- 공정 흐름도

### Equipment List
- 설비 목록 및 상세 정보
- 설비별 센서 현황
- 건강도 점수

### Anomaly Monitor
- 실시간 이상 탐지 현황
- 이상 이력 조회
- 심각도별 필터링

### Energy Prediction
- 전력 사용량 예측 차트
- 15분 단위 예측값
- 예측 정확도 지표

### Ontology Explorer
- 인터랙티브 그래프 시각화
- 노드 드래그, 줌, 팬 지원
- 전체 화면 모드
- 노드 유형별 색상 구분

## 온톨로지 구조

### 설비 클래스 (Equipment)
```
upw:Equipment
├── upw:PretreatmentEquipment (전처리)
│   ├── upw:SandFilter
│   └── upw:ActivatedCarbonFilter
├── upw:TreatmentEquipment (처리)
│   ├── upw:ReverseOsmosis (RO)
│   └── upw:Electrodeionization (EDI)
├── upw:PostTreatmentEquipment (후처리)
│   └── upw:UVSterilizer
└── upw:SupportEquipment (지원)
    ├── upw:CirculationPump
    └── upw:StorageTank
```

### 센서 클래스 (Sensor)
```
upw:UPWSensor
├── upw:PressureSensor      # 압력
├── upw:FlowSensor          # 유량
├── upw:TemperatureSensor   # 온도
├── upw:ConductivitySensor  # 전도도
├── upw:VibrationSensor     # 진동
└── upw:PowerMeter          # 전력
```

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/equipment` | 설비 목록 |
| GET | `/api/equipment/{id}` | 설비 상세 |
| GET | `/api/sensors` | 센서 목록 |
| GET | `/api/observations` | 관측 데이터 |
| GET | `/api/anomaly/detect` | 이상 탐지 |
| GET | `/api/anomaly/history` | 이상 이력 |
| GET | `/api/energy/predict` | 에너지 예측 |
| GET | `/api/ontology/graph` | 그래프 데이터 |
| GET | `/api/dashboard/stats` | 대시보드 통계 |

## 샘플 데이터

생성된 샘플 데이터:
- **5개 공정 영역**: 전처리, 1차 처리, 2차 처리, 후처리, 저장/분배
- **17개 설비**: RO, EDI, UV 살균기, 펌프, 탱크 등
- **37개 센서**: 압력, 유량, 온도, 전도도, 진동 센서 등
- **7,104개 관측 데이터**: 7일간 시계열 데이터

## 라이선스

MIT License
