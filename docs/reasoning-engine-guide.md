# 추론 엔진 (Reasoning Engine) 기능 설명서

## 1. 개요

추론 엔진은 UPW(Ultra Pure Water) 온톨로지 시스템에서 **규칙 기반 추론(Rule-based Reasoning)**을 수행하여 기존 데이터로부터 새로운 지식을 자동으로 도출하는 핵심 기능입니다.

### 주요 목적
- 설비(Equipment)의 건강 상태를 기반으로 유지보수 필요성 판단
- 센서 데이터의 이상 패턴 자동 탐지
- 설비 간 의존성 및 상관관계 추론
- 온톨로지 공리(Axiom)를 기반으로 한 형식적 추론

---

## 2. 추론 엔진 UI 구성

### 2.1 통계 카드 (4개)

| 카드 | 설명 | 표시 값 |
|------|------|---------|
| **추론 규칙** | 시스템에 정의된 총 추론 규칙 수 | 8개 |
| **추론된 노드** | 추론을 통해 생성된 노드(Maintenance, Anomaly 등)의 수 | 동적 |
| **추론된 관계** | 추론을 통해 생성된 관계(NEEDS_MAINTENANCE 등)의 수 | 동적 |
| **총 추론 결과** | 추론된 노드 + 추론된 관계의 합계 | 동적 |

### 2.2 상단 버튼

| 버튼 | 기능 |
|------|------|
| **전체 추론 실행** | 모든 8개 규칙을 순차적으로 실행 |
| **추론 결과 삭제** | `isInferred: true`로 표시된 모든 추론 결과를 데이터베이스에서 삭제 |

---

## 3. 추론 규칙 카드

각 추론 규칙은 카드 형태로 표시되며 다음 정보를 포함합니다:

- **규칙 이름**: 한국어 이름 (예: "유지보수 필요 규칙")
- **카테고리 뱃지**: 규칙의 분류 (유지보수, 이상탐지, 예측, 구조, 분석, 공리)
- **설명**: 규칙이 수행하는 작업에 대한 간단한 설명
- **버튼 3개**: 확인, 적용, 추론 과정

---

## 4. 버튼별 기능 상세 설명

### 4.1 "확인" 버튼

#### 목적
규칙을 **실제로 적용하지 않고** 미리보기만 수행합니다. 어떤 데이터가 조건에 맞는지, 몇 개의 추론이 가능한지 확인할 수 있습니다.

#### 호출 API
```
POST /api/ontology/reasoning/rules/{ruleId}/check
```

#### 처리 과정
```
1단계: 규칙 정의 조회
   └─ 규칙 ID로 규칙의 조건 쿼리(query)를 가져옴

2단계: 조건 쿼리 실행
   └─ Neo4j에서 규칙의 조건을 만족하는 모든 데이터 검색
   └─ 예: healthScore < 60인 Equipment 노드 검색

3단계: 후보(Candidates) 목록 생성
   └─ 조건을 만족하는 모든 항목을 후보 목록으로 반환

4단계: 결과 반환
   └─ 후보 개수와 후보 목록 반환
```

#### 출력 메시지
- **성공 시**: 초록색 카드에 "규칙 확인 결과: N개 추론 가능" 표시
- **후보 목록**: 최대 5개 항목의 미리보기 표시

#### 화면 예시
```
┌─────────────────────────────────────────────────────┐
│  규칙 확인 결과: 3개 추론 가능                        │
│                                                     │
│  • RO-001 (healthScore: 55.0)                       │
│  • EDI-002 (healthScore: 48.5)                      │
│  • UV-003 (healthScore: 52.0)                       │
└─────────────────────────────────────────────────────┘
```

---

### 4.2 "적용" 버튼

#### 목적
규칙을 **실제로 실행**하여 새로운 노드와 관계를 데이터베이스에 생성합니다.

#### 호출 API
```
POST /api/ontology/reasoning/rules/{ruleId}/apply
```

#### 처리 과정
```
1단계: 조건 쿼리 실행
   └─ 규칙의 조건을 만족하는 모든 후보 검색

2단계: 각 후보에 대해 추론 쿼리 실행
   └─ action_query를 사용하여 새로운 노드/관계 생성
   └─ 생성된 모든 항목에 다음 속성 추가:
      - isInferred: true
      - inferredAt: 현재 시간
      - Inferred 레이블 추가

3단계: 통계 새로고침
   └─ 추론된 노드/관계 개수 업데이트

4단계: 결과 반환
   └─ 적용된 추론 개수와 생성된 항목 목록 반환
```

#### 출력 메시지
| 상황 | 메시지 | 색상 |
|------|--------|------|
| 추론 성공 | "Applied rule: Applied N inferences" | 초록색 (#c6f6d5) |
| 추론 대상 없음 | "Applied rule: No new inferences to make" | 초록색 |
| 실패 | "Failed to apply rule" | 빨간색 (#fed7d7) |

#### 데이터베이스 변경 예시
```cypher
// 유지보수 필요 규칙 적용 시 생성되는 노드
CREATE (m:Maintenance:Inferred {
    maintenanceId: 'MAINT-INF-RO-001-2026-01-26',
    type: 'ConditionBased',
    priority: 'High',
    description: '건강 점수 저하로 인한 점검 필요',
    isInferred: true,
    inferredAt: datetime()
})

// 생성되는 관계
CREATE (e:Equipment {equipmentId: 'RO-001'})-[:NEEDS_MAINTENANCE {
    isInferred: true,
    inferredAt: datetime()
}]->(m)
```

---

### 4.3 "추론 과정" 버튼

#### 목적
추론 과정을 **단계별로 시각화**하여 어떤 데이터가 어떻게 처리되었는지 상세하게 보여줍니다. 디버깅 및 추론 근거 확인에 유용합니다.

#### 호출 API
```
POST /api/ontology/reasoning/rules/{ruleId}/run-with-trace
```

#### 처리 과정 (5단계)

```
┌────────────────────────────────────────────────────────────────┐
│                        추론 과정 타임라인                        │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ① MATCH (검색)                                                │
│     └─ 관련 데이터 전체 검색                                    │
│     └─ 예: "모든 Equipment 노드 검색" → 44개 발견               │
│                                                                │
│  ② FILTER (필터링)                                             │
│     └─ 1차 조건 적용: healthScore < 60                         │
│     └─ 예: "healthScore가 60 미만인 설비" → 5개 발견            │
│                                                                │
│  ③ FILTER (추가 필터링)                                        │
│     └─ 2차 조건 적용: healthStatus != 'Critical'               │
│     └─ 예: "Critical 상태가 아닌 설비" → 3개 발견               │
│                                                                │
│  ④ CHECK (중복 확인)                                           │
│     └─ 이미 존재하는 추론 결과 제외                             │
│     └─ 예: "대기 중인 유지보수가 없는 설비" → 2개 발견          │
│                                                                │
│  ⑤ INFERENCE (추론 실행)                                       │
│     └─ 최종 후보에 대해 추론 실행                               │
│     └─ 예: "2개의 Maintenance 노드 생성"                        │
│                                                                │
│  ⑥ RESULT (결과)                                               │
│     └─ 최종 결과 요약                                           │
│     └─ 예: "SUCCESS - 2개의 새로운 지식 추론 완료"              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

#### 모달 팝업 구성

| 섹션 | 내용 |
|------|------|
| **헤더** | 규칙 이름 + 결과 상태 뱃지 (SUCCESS/NO_MATCH/ERROR) |
| **요약** | 자동 생성된 설명 (예: "규칙으로 2개의 새로운 지식을 추론했습니다") |
| **타임라인** | 단계별 처리 과정 (확장 가능) |
| **증거(Evidence)** | 추론에 사용된 노드, 관계, 속성 목록 |
| **추론 항목** | 새로 생성된 노드/관계 목록 |

#### 결과 상태 유형

| 상태 | 설명 | 뱃지 색상 |
|------|------|----------|
| SUCCESS | 추론 성공, 새로운 지식 생성됨 | 초록색 |
| NO_MATCH | 조건을 만족하는 데이터 없음 | 노란색 |
| ERROR | 추론 중 오류 발생 | 빨간색 |

---

## 5. 8개 추론 규칙 상세

### 5.1 유지보수 필요 규칙 (rule_maintenance_needed)

| 항목 | 내용 |
|------|------|
| **카테고리** | 유지보수 |
| **설명** | 건강 점수가 60 미만인 설비는 유지보수가 필요합니다 |
| **조건** | Equipment.healthScore < 60 AND healthStatus != 'Critical' AND 대기 중인 유지보수 없음 |
| **생성 결과** | Maintenance 노드 + NEEDS_MAINTENANCE 관계 |

### 5.2 이상 탐지 규칙 (rule_anomaly_from_sensor)

| 항목 | 내용 |
|------|------|
| **카테고리** | 이상탐지 |
| **설명** | 정상 범위를 벗어난 센서 측정값에서 이상을 탐지합니다 |
| **조건** | 최근 24시간 내 센서값이 정상 범위 초과 (압력: 1-10, 온도: 10-50, 전도도: <15, 진동: <8) |
| **생성 결과** | Anomaly 노드 + HAS_ANOMALY 관계 |

### 5.3 고장 예측 규칙 (rule_failure_prediction)

| 항목 | 내용 |
|------|------|
| **카테고리** | 예측 |
| **설명** | 센서 트렌드를 기반으로 잠재적 고장을 예측합니다 |
| **조건** | 최근 7일간 센서값의 최신값이 평균의 130% 초과 (10개 이상 측정값 필요) |
| **생성 결과** | FailurePrediction 노드 + MAY_FAIL 관계 |

### 5.4 설비 의존성 규칙 (rule_equipment_dependency)

| 항목 | 내용 |
|------|------|
| **카테고리** | 구조 |
| **설명** | 공정 흐름을 기반으로 설비 간 의존성을 추론합니다 |
| **조건** | 동일 공정영역 내 RO/EDI 설비와 UV살균기/저장탱크가 존재하고 FEEDS_INTO 관계 없음 |
| **생성 결과** | FEEDS_INTO 관계 |

### 5.5 센서 상관관계 규칙 (rule_sensor_correlation)

| 항목 | 내용 |
|------|------|
| **카테고리** | 분석 |
| **설명** | 동일 설비의 센서 간 상관관계를 식별합니다 |
| **조건** | 동일 설비에 압력 센서와 유량 센서가 존재하고 CORRELATES_WITH 관계 없음 |
| **생성 결과** | CORRELATES_WITH 관계 (유형: Pressure-Flow) |

### 5.6 속성 체인 추론 (axiom_property_chain)

| 항목 | 내용 |
|------|------|
| **카테고리** | 공리 |
| **설명** | FEEDS_INTO와 LOCATED_IN을 결합하여 INFLUENCES 관계를 추론합니다 |
| **조건** | E1 -[FEEDS_INTO]-> E2 -[LOCATED_IN]-> ProcessArea |
| **생성 결과** | E1 -[INFLUENCES]-> ProcessArea |

### 5.7 건강 상태 분류 (axiom_health_subsumption)

| 항목 | 내용 |
|------|------|
| **카테고리** | 공리 |
| **설명** | healthScore 값에 따라 설비의 건강 상태를 자동으로 분류합니다 |
| **조건** | healthScore >= 85: Normal, >= 70: Warning, < 70: Critical |
| **생성 결과** | HealthStatus 노드 + HAS_STATUS 관계 |

### 5.8 역속성 전파 (axiom_inverse_sensor)

| 항목 | 내용 |
|------|------|
| **카테고리** | 공리 |
| **설명** | HAS_SENSOR와 IS_ATTACHED_TO 역관계를 자동으로 생성합니다 |
| **조건** | Equipment -[HAS_SENSOR]-> Sensor 존재하고 역관계 없음 |
| **생성 결과** | Sensor -[IS_ATTACHED_TO]-> Equipment |

---

## 6. 결과 메시지 유형 및 색상

| 상황 | 메시지 예시 | 배경 색상 | 텍스트 색상 |
|------|------------|----------|------------|
| 성공 | "Applied rule: Applied 3 inferences" | #c6f6d5 (연두) | #276749 (녹색) |
| 추론 없음 | "Applied rule: No new inferences to make" | #c6f6d5 (연두) | #276749 (녹색) |
| 실패 | "Failed to apply rule" | #fed7d7 (분홍) | #c53030 (빨강) |

---

## 7. 추론 결과의 데이터베이스 표시

모든 추론 결과는 다음 속성으로 구분됩니다:

```cypher
// 추론된 노드
(:Anomaly:Inferred {
    isInferred: true,
    inferredAt: datetime()
})

// 추론된 관계
-[:HAS_ANOMALY {
    isInferred: true,
    inferredAt: datetime()
}]->
```

- `isInferred: true` - 추론으로 생성된 데이터임을 표시
- `inferredAt` - 추론 실행 시간
- `Inferred` 레이블 - 추론된 노드에 추가되는 레이블

---

## 8. 사용 시나리오

### 시나리오 1: 유지보수 필요 설비 확인
1. "유지보수 필요 규칙" 카드에서 **"확인"** 버튼 클릭
2. 결과 확인: "3개 추론 가능" → RO-001, EDI-002, UV-003
3. **"적용"** 버튼 클릭하여 유지보수 노드 생성
4. 통계 카드에서 추론된 노드 수 증가 확인

### 시나리오 2: 추론 과정 디버깅
1. "이상 탐지 규칙" 카드에서 **"추론 과정"** 버튼 클릭
2. 모달에서 각 단계 확인:
   - MATCH: 44개 센서 검색
   - FILTER: 이상값 5개 발견
   - CHECK: 기존 이상 없는 3개
   - INFERENCE: Anomaly 3개 생성
3. 증거(Evidence) 섹션에서 어떤 센서값이 사용되었는지 확인

### 시나리오 3: 추론 결과 초기화
1. **"추론 결과 삭제"** 버튼 클릭
2. 확인 메시지 확인
3. 모든 `isInferred: true` 데이터 삭제
4. 통계 카드가 0으로 초기화

---

## 9. 기술 참고사항

### API 엔드포인트 요약

| 기능 | 메서드 | 엔드포인트 |
|------|--------|-----------|
| 규칙 목록 조회 | GET | `/api/ontology/reasoning/rules` |
| 규칙 확인 | POST | `/api/ontology/reasoning/rules/{id}/check` |
| 규칙 적용 | POST | `/api/ontology/reasoning/rules/{id}/apply` |
| 추론 과정 실행 | POST | `/api/ontology/reasoning/rules/{id}/run-with-trace` |
| 전체 추론 실행 | POST | `/api/ontology/reasoning/run` |
| 추론 통계 조회 | GET | `/api/ontology/reasoning/stats` |
| 추론된 항목 조회 | GET | `/api/ontology/reasoning/inferred` |
| 추론 결과 삭제 | DELETE | `/api/ontology/reasoning/inferred` |

### 관련 파일
- **Backend**: `backend/app/services/reasoning_service.py`
- **API**: `backend/app/api/ontology.py`
- **Frontend**: `frontend/src/pages/OntologyExplorer.tsx`
