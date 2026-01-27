# 온톨로지 공리 및 제약조건

UPW 온톨로지 시스템의 형식적 공리와 제약조건 정의

## 개요

이 디렉토리는 UPW (Ultrapure Water) 온톨로지의 공리와 제약조건을 정의합니다.

- **공리 (Axioms)**: 온톨로지에서 항상 참이어야 하는 구조적 규칙
- **제약조건 (Constraints)**: 데이터 무결성과 비즈니스 규칙 검증

## 공리 (Axioms)

### AX001: 분리 클래스 (Disjoint Classes)
- **설명**: Equipment와 Sensor는 서로 분리된 클래스
- **의미**: 하나의 노드가 동시에 Equipment와 Sensor가 될 수 없음
- **심각도**: High
- **OWL 표현**: `upw:Equipment owl:disjointWith upw:Sensor`

### AX002: 속성 도메인 (Property Domain)
- **설명**: healthScore 속성은 Equipment 노드에만 사용 가능
- **의미**: Equipment가 아닌 노드에 healthScore가 있으면 위반
- **심각도**: High
- **OWL 표현**: `upw:healthScore rdfs:domain upw:Equipment`

### AX003: 역속성 (Inverse Property)
- **설명**: HAS_SENSOR와 IS_ATTACHED_TO는 역관계
- **의미**: E→S의 HAS_SENSOR가 있으면 S→E의 IS_ATTACHED_TO도 존재해야 함
- **심각도**: Medium
- **OWL 표현**: `upw:hasSensor owl:inverseOf upw:isAttachedTo`

### AX004: 전이적 속성 (Transitive Property)
- **설명**: FEEDS_INTO는 전이적 관계
- **의미**: A→B, B→C이면 A→C도 성립
- **심각도**: Low
- **OWL 표현**: `upw:feedsInto rdf:type owl:TransitiveProperty`

### AX005: 함수적 속성 (Functional Property)
- **설명**: healthScore는 함수적 속성
- **의미**: 각 Equipment는 정확히 하나의 healthScore 값만 가져야 함
- **심각도**: Medium
- **OWL 표현**: `upw:healthScore rdf:type owl:FunctionalProperty`

## 제약조건 (Constraints)

### CONS001: 필수 속성
- **노드 타입**: Equipment
- **필수 속성**: equipmentId, name, type
- **심각도**: High
- **검증**: Equipment는 위 3가지 속성을 반드시 가져야 함

### CONS002: 값 범위
- **노드 타입**: Equipment
- **속성**: healthScore
- **범위**: 0 ~ 100
- **심각도**: High
- **검증**: healthScore는 0과 100 사이의 값이어야 함

### CONS003: 카디널리티
- **노드 타입**: Equipment
- **관계**: HAS_SENSOR
- **최소값**: 1
- **심각도**: Medium
- **검증**: Equipment는 최소 1개의 센서를 가져야 함

### CONS004: 유일성
- **노드 타입**: Equipment
- **속성**: equipmentId
- **심각도**: Critical
- **검증**: equipmentId는 중복될 수 없음

### CONS005: 온도 센서 범위
- **노드 타입**: Observation
- **센서 타입**: Temperature
- **범위**: -50°C ~ 200°C
- **심각도**: Medium
- **검증**: 온도 센서의 관측값은 합리적인 범위 내에 있어야 함

## 공리 기반 추론 규칙

### Rule 6: 속성 체인 추론
- **공리**: `upw:influences owl:propertyChainAxiom (upw:feedsInto upw:locatedIn)`
- **추론**: E1→E2 (FEEDS_INTO), E2→A (LOCATED_IN) ⇒ E1→A (INFLUENCES)
- **카테고리**: 공리

### Rule 7: 건강 상태 분류
- **공리**: 포섭 (Subsumption)
- **추론**: healthScore >= 85 ⇒ Normal, >= 70 ⇒ Warning, < 70 ⇒ Critical
- **카테고리**: 공리

### Rule 8: 역속성 전파
- **공리**: `upw:hasSensor owl:inverseOf upw:isAttachedTo`
- **추론**: E→S (HAS_SENSOR) ⇒ S→E (IS_ATTACHED_TO) 자동 생성
- **카테고리**: 공리

## 사용 방법

### 백엔드 API

```bash
# 모든 공리 조회
GET /api/ontology/axioms

# 특정 공리 검증
POST /api/ontology/axioms/{axiom_id}/check

# 모든 공리 검증
POST /api/ontology/axioms/check-all

# 모든 제약조건 조회
GET /api/ontology/constraints

# 특정 제약조건 검증
POST /api/ontology/constraints/{constraint_id}/validate

# 모든 제약조건 검증
POST /api/ontology/constraints/validate-all

# 검증 후 추론 실행
POST /api/ontology/reasoning/validate-and-run
```

### Python 코드

```python
from app.services.axiom_service import AxiomService
from app.services.constraint_service import ConstraintService
from neo4j import GraphDatabase

driver = GraphDatabase.driver("bolt://localhost:7688",
                             auth=("neo4j", "upw_password_2024"))

# 공리 검증
axiom_service = AxiomService(driver)
result = axiom_service.check_all_axioms()
print(f"Total violations: {result['totalViolations']}")

# 제약조건 검증
constraint_service = ConstraintService(driver)
result = constraint_service.validate_all_constraints()
print(f"Total violations: {result['totalViolations']}")
```

## 파일 구조

```
ontology/axioms/
├── README.md                 # 이 파일
└── structural-axioms.ttl     # OWL/RDF 형식의 공리 정의
```

## 참고 자료

- OWL 2 Web Ontology Language: https://www.w3.org/TR/owl2-overview/
- SHACL Shapes Constraint Language: https://www.w3.org/TR/shacl/
- Neo4j Semantic: https://neo4j.com/labs/neosemantics/
