# Ontology Claude Coding History

이 문서는 온톨로지 프로젝트의 구현 방식에 대한 Q&A 기록입니다.

---

## Q1: 추론 엔진 구현 방식

**질문:** "추론 엔진" 기능을 구현할 때 온톨로지 기반의 OWL, SHACL로 구현했나요, 아니면 Python 언어로 개발한 건가요?

**답변:** **추론 엔진은 Python 코드로 구현되었습니다.** OWL/SHACL 정의 파일이 있지만, 실제 추론은 OWL 리즈너(reasoner)가 아닌 Python + Neo4j Cypher 쿼리로 수행됩니다.

### 구현 방식 요약

| 구분 | 구현 방식 |
|------|----------|
| **온톨로지 정의** | OWL 2 (structural-axioms.ttl) - 문서화 용도 |
| **실제 추론 엔진** | Python 코드 + Neo4j Cypher 쿼리 |
| **규칙 정의** | reasoning_service.py 내 Python 딕셔너리 |
| **추론 실행** | Cypher 패턴 매칭으로 그래프에서 직접 실행 |

### 핵심 파일들

1. **reasoning_service.py** - 8개 추론 규칙 구현 (Python)
2. **axiom_service.py** - 11개 공리 검증 (Python)
3. **constraint_service.py** - 11개 제약조건 검증 (Python)
4. **structural-axioms.ttl** - OWL 공리 정의 (문서화 용도)

### 왜 Python으로 구현했나?

- **설명 가능성**: 각 추론 단계를 상세 추적 가능 (추론 과정 버튼)
- **성능**: Neo4j Cypher 직접 실행으로 빠른 처리
- **유연성**: 도메인 특화 규칙 쉽게 추가/수정 가능
- **디버깅**: 증거(evidence) 추적으로 왜 추론되었는지 확인 가능

---

## Q2: 공리 및 제약조건 구현 방식

**질문:** "공리 및 제약조건" 기능을 구현할 때 온톨로지 기반의 OWL, SHACL로 구현했나요, 아니면 Python 언어로 개발한 건가요?

**답변:** **"공리 및 제약조건" 기능도 Python 코드로 구현되었습니다.** OWL/SHACL 정의 파일이 존재하지만, 실제 검증 로직은 Python + Neo4j Cypher 쿼리로 수행됩니다.

### 구현 방식 비교

| 구분 | OWL/SHACL 방식 | 현재 프로젝트 방식 |
|------|---------------|-------------------|
| **공리 정의** | OWL 파일 (structural-axioms.ttl) | 문서화 용도로만 사용 |
| **공리 검증** | OWL Reasoner (Pellet, HermiT) | Python 코드 (axiom_service.py) |
| **제약조건 정의** | SHACL Shapes | Python 딕셔너리 |
| **제약조건 검증** | SHACL Validator | Python 코드 (constraint_service.py) |

---

## Q3: 코드 위치

**질문:** 위에 두 기능에 대한 각각의 코드가 어디에 있나요?

**답변:**

### 1. 추론 엔진 (Reasoning Engine)

| 구분 | 파일 경로 |
|------|----------|
| **백엔드 서비스** | backend/app/services/reasoning_service.py |
| **API 엔드포인트** | backend/app/api/ontology.py (추론 관련 라우트) |
| **OWL 공리 정의** | ontology/axioms/structural-axioms.ttl |
| **프론트엔드 컴포넌트** | frontend/src/components/ (ReasoningEngine 관련) |

### 2. 공리 및 제약조건 (Axioms & Constraints)

| 구분 | 파일 경로 |
|------|----------|
| **공리 서비스** | backend/app/services/axiom_service.py |
| **제약조건 서비스** | backend/app/services/constraint_service.py |
| **API 엔드포인트** | backend/app/api/ontology.py (공리/제약조건 라우트) |
| **프론트엔드 타입 정의** | frontend/src/types/axiom.types.ts |
| **프론트엔드 타입 정의** | frontend/src/types/constraint.types.ts |

### 3. 공통 파일

| 구분 | 파일 경로 |
|------|----------|
| **Neo4j 서비스** | backend/app/services/neo4j_service.py |
| **프론트엔드 API 호출** | frontend/src/services/api.ts |

---

## Q4: Neosemantics(n10s) 플러그인 사용 여부

**질문:** 결론적으로 두 기능 모두 Neo4j에서 Neosemantics(n10s) 플러그인으로 구현했나요?

**답변:** 아니요, **Neosemantics(n10s) 플러그인을 사용하지 않았습니다.**

### 현재 상태

| 구분 | 상태 |
|------|------|
| **n10s 플러그인 설치** | ✅ docker-compose.yml에서 설정됨 |
| **n10s 초기화** | ✅ init_neo4j.py에서 RDF 임포트용으로 사용 |
| **추론 엔진** | ❌ n10s 미사용 → **순수 Python + Cypher** |
| **공리/제약조건 검증** | ❌ n10s 미사용 → **순수 Python + Cypher** |

### n10s 사용 범위

```
n10s 사용처:
├── ontology/schemas/*.ttl 임포트 (초기 설정 시)
└── RDF 데이터 Neo4j 그래프로 변환

n10s 미사용처:
├── reasoning_service.py  → 표준 Cypher 쿼리
├── axiom_service.py      → 표준 Cypher 쿼리
└── constraint_service.py → 표준 Cypher 쿼리
```

---

## Q5: Neo4j Cypher로만 구현 확인

**질문:** "추론 엔진", "공리/제약조건 검증"은 단순히 Neo4j GraphDB Cypher 문법으로 했다는 말인가요?

**답변:** 네, 맞습니다.

### 정확한 구현 방식

```
┌─────────────────────────────────────────────────────────┐
│                    구현 구조                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   Python 코드 (규칙/공리/제약조건 정의)                    │
│         │                                               │
│         ▼                                               │
│   Cypher 쿼리 문자열 (MATCH, WHERE, CREATE 등)           │
│         │                                               │
│         ▼                                               │
│   Neo4j Driver로 쿼리 실행                               │
│         │                                               │
│         ▼                                               │
│   Neo4j GraphDB (결과 반환)                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 사용하지 않은 것들

| 기술 | 사용 여부 |
|------|----------|
| OWL Reasoner (Pellet, HermiT 등) | ❌ |
| SHACL Validator | ❌ |
| n10s 추론 기능 (`n10s.inference.*`) | ❌ |
| SPARQL | ❌ |

### 실제 사용한 것

| 기술 | 사용 여부 |
|------|----------|
| Python 딕셔너리 (규칙 정의) | ✅ |
| Neo4j Cypher 쿼리 | ✅ |
| Neo4j Python Driver | ✅ |

**결론: 온톨로지 기반 시맨틱 추론이 아닌, 단순 그래프 패턴 매칭 + Cypher 쿼리 방식입니다.**

---

## Q6: OWL/SHACL 없이 구현 가능 여부

**질문:** 그렇다면 "추론 엔진", "공리/제약조건 검증"에 대한 규칙만 정확하게 정리되었다면 OWL, SHACL 엔진을 사용하지 않고 구현 가능하다는 뜻인가요?

**답변:** 네, 정확합니다.

**규칙이 명확하게 정의되어 있다면**, OWL/SHACL 없이도 그래프 DB + 쿼리 언어만으로 구현 가능합니다.

### 현재 프로젝트가 증명하는 것

| 기능 | OWL/SHACL 방식 | 현재 구현 방식 |
|------|---------------|---------------|
| 추론 | OWL Reasoner | Cypher 패턴 매칭 |
| 공리 검증 | OWL Consistency Check | Cypher 쿼리로 위반 탐지 |
| 제약조건 | SHACL Shapes | Cypher 쿼리로 유효성 검사 |

### 이 방식의 장단점

**장점:**
- 구현이 단순하고 직관적
- 디버깅/추적이 쉬움
- 성능 최적화 용이 (Cypher 튜닝)
- 추가 기술 스택 불필요

**단점:**
- 모든 규칙을 수동으로 작성해야 함
- OWL의 자동 추론 기능 없음 (예: 클래스 계층 자동 추론)
- 표준화된 온톨로지 공유/재사용 어려움
- Open World Assumption 같은 시맨틱 웹 개념 적용 불가

---

## Q7: RDF/RDFS 필요성

**질문:** 그렇다면, 데이터 및 관계 그리고 속성들에 대한 정의를 정확하게 하고 직접 Neo4j GraphDB에 입력한다면 RDF, RDFS를 사용하여 설계할 필요가 없지 않나요?

**답변:** 네, 맞습니다. 단일 시스템 내에서 사용한다면 RDF/RDFS 없이 직접 Neo4j에 입력해도 됩니다.

### 비교

| 방식 | 설명 |
|------|------|
| **RDF/RDFS 사용** | TTL 파일 작성 → n10s로 임포트 → Neo4j 그래프 |
| **직접 입력** | Cypher로 직접 CREATE → Neo4j 그래프 |

**결과는 동일합니다** - 둘 다 Neo4j의 노드, 관계, 속성으로 저장됨

### RDF/RDFS가 필요한 경우 vs 불필요한 경우

#### ❌ RDF/RDFS 불필요

- 단일 시스템 (Neo4j만 사용)
- 외부 시스템과 데이터 교환 없음
- 표준 온톨로지 재사용 불필요
- OWL 자동 추론 불필요

#### ✅ RDF/RDFS 필요

- 다른 시스템과 데이터 공유/교환 필요 (W3C 표준)
- Linked Data 연결 (DBpedia, Wikidata 등)
- 표준 어휘 재사용 (Schema.org, FOAF 등)
- 여러 Triple Store 간 이동 필요

**결론:** 설계가 완벽하다면 Cypher로 직접 입력해도 충분합니다. RDF/RDFS는 "데이터 표현의 표준 형식"일 뿐, Neo4j 내부에서는 결국 labeled property graph로 변환되므로, 외부 연동이 없다면 필수가 아닙니다.

---

## Q8: RDF/RDFS 필요 이유 설명

**질문:** RDF/RDFS가 필요한 경우에 대한 내용이 어떤 의미인지 잘 이해가 안 가요. 그렇다면 단순히 "Cypher CREATE 문 → Neo4j (직접)"이 방식을 사용하여 구축한 것은 온톨로지가 아닌가요?

**답변:**

### "온톨로지"의 두 가지 의미

| 구분 | 설명 |
|------|------|
| **개념적 온톨로지** | 도메인 지식을 구조화한 것 (개념, 관계, 속성 정의) |
| **기술적 온톨로지** | W3C 표준 형식 (RDF/RDFS/OWL)으로 표현된 것 |

### 현재 프로젝트는?

```
✅ 개념적 온톨로지: 맞음 (UPW 도메인의 지식을 구조화함)
❌ 기술적 온톨로지: 아님 (W3C 표준 형식이 아닌 Neo4j 고유 형식)
```

**결론: 온톨로지 "개념"은 구현했지만, 온톨로지 "표준 형식"은 아닙니다.**

### RDF/RDFS 필요한 경우 - 쉬운 예시

#### 1. 다른 시스템과 데이터 공유

```
예: A회사(Neo4j) ↔ B회사(다른 DB)

RDF 사용 시:  A회사 → RDF 파일 → B회사 (바로 이해 가능)
Cypher 사용 시: A회사 → ??? → B회사 (변환 작업 필요)
```

RDF는 "만국 공통어" 같은 것입니다.

#### 2. Linked Data 연결

```
예: 우리 시스템의 "서울"을 위키피디아의 "서울" 정보와 연결

RDF: <우리시스템:서울> owl:sameAs <dbpedia:Seoul>
     → 자동으로 위키피디아의 서울 정보 활용 가능

Neo4j: 직접 연결 불가 (별도 개발 필요)
```

#### 3. 표준 어휘 재사용

```
예: "사람" 개념 정의

직접 정의:   (:Person {name: "홍길동"})  → 우리만 이해
표준 어휘:   foaf:Person, schema:name   → 전 세계가 이해
```

#### 4. 다른 DB로 이동

```
Neo4j → Amazon Neptune (또는 다른 Graph DB)

RDF 형식: 그대로 임포트 가능
Cypher 형식: 전체 변환 작업 필요
```

### 비유로 설명

| 비유 | RDF/RDFS | Neo4j Cypher |
|------|----------|--------------|
| 문서 형식 | PDF (어디서든 열림) | HWP (한컴에서만 열림) |
| 언어 | 영어 (국제 표준) | 한국어 (한국에서만 통용) |
| 전원 플러그 | 유럽 표준 (EU 전체 호환) | 한국 전용 (한국에서만 사용) |

---

## Q9: Neo4j에서 RDF/TTL로 역변환 가능 여부

**질문:** "개념적 온톨로지: 도메인 지식을 구조화한 것"로 Neo4j GraphDB에 구현한 다음, 다시 "기술적 온톨로지: W3C 표준 형식 (RDF/RDFS/OWL)으로 표현된 것"로 ttl을 작성할 수 없나요?

**답변:** 네, 가능합니다! n10s 플러그인이 바로 그 기능을 제공합니다.

### 양방향 변환 가능

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   Neo4j GraphDB  ←──────────────→  RDF/TTL 파일         │
│   (Property Graph)    n10s       (Semantic Web)        │
│                                                         │
│   • 임포트: n10s.rdf.import.*                           │
│   • 익스포트: n10s.rdf.export.*                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### n10s 익스포트 기능

#### 1. Cypher 결과를 RDF로 익스포트

```cypher
// Neo4j 데이터를 TTL 형식으로 내보내기
MATCH (e:Equipment)-[r:HAS_SENSOR]->(s:Sensor)
CALL n10s.rdf.export.cypher("MATCH (e:Equipment)-[r:HAS_SENSOR]->(s:Sensor) RETURN *", "Turtle")
YIELD value
RETURN value
```

#### 2. 전체 그래프 익스포트

```cypher
// 전체 그래프를 RDF로 내보내기
CALL n10s.rdf.export.spo(null, null, null, "Turtle")
YIELD subject, predicate, object
RETURN *
```

#### 3. 매핑 정의 (Neo4j ↔ RDF 어휘)

```cypher
// Neo4j 레이블을 표준 RDF 클래스로 매핑
CALL n10s.mapping.add("http://schema.org/Thing", "Equipment")
CALL n10s.mapping.add("http://schema.org/Property", "HAS_SENSOR")
```

---

## Q10: 공리/제약조건 TTL 변환 한계

**질문:** 하지만 이렇게 처리할 경우 "공리", "제약조건"에 해당하는 내용은 ttl로 변환할 수 없는 것 아닌가요? 왜냐면 이 부분은 해당 내용들을 모두 Neo4j GraphDB Cypher Query로 로직을 구현한 것이어서요.

**답변:** 정확합니다! 핵심을 짚으셨습니다.

### 현재 구조의 한계

```
┌─────────────────────────────────────────────────────────┐
│              Neo4j에 저장된 것 (데이터)                   │
│  ✅ 노드 (Equipment, Sensor 등)                         │
│  ✅ 관계 (HAS_SENSOR, FEEDS_INTO 등)                    │
│  ✅ 속성 (healthScore, name 등)                         │
│                                                         │
│  → n10s로 TTL 익스포트 가능                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              Python 코드에 있는 것 (로직)                 │
│  ❌ 공리 (axiom_service.py)                             │
│  ❌ 제약조건 (constraint_service.py)                     │
│  ❌ 추론 규칙 (reasoning_service.py)                     │
│                                                         │
│  → n10s로 TTL 익스포트 불가능                            │
└─────────────────────────────────────────────────────────┘
```

### 왜 익스포트가 안 되는가?

| 구분 | 저장 위치 | 형태 | TTL 변환 |
|------|----------|------|----------|
| 데이터 | Neo4j DB | 그래프 노드/관계 | ✅ 가능 |
| 공리/제약조건 | Python 파일 | Cypher 쿼리 문자열 | ❌ 불가능 |

**공리/제약조건은 "데이터"가 아니라 "코드"이기 때문입니다.**

### 표준 온톨로지 방식과의 비교

#### OWL/SHACL 방식 (표준)

```turtle
# 공리: OWL로 정의 (TTL 파일에 저장)
upw:Equipment owl:disjointWith upw:Sensor .
upw:healthScore rdfs:domain upw:Equipment .

# 제약조건: SHACL로 정의 (TTL 파일에 저장)
upw:EquipmentShape a sh:NodeShape ;
    sh:targetClass upw:Equipment ;
    sh:property [
        sh:path upw:healthScore ;
        sh:minInclusive 0 ;
        sh:maxInclusive 100 ;
    ] .
```

→ 모든 것이 TTL 파일에 있으므로 **완전한 이식성**

#### 현재 프로젝트 방식

```python
# 공리: Python 코드로 정의
AXIOMS = {
    'AX001': {
        'check_query': 'MATCH (n) WHERE (n:Equipment AND n:Sensor) RETURN n'
    }
}

# 제약조건: Python 코드로 정의
CONSTRAINTS = {
    'CONS002': {
        'validation_query': 'MATCH (e:Equipment) WHERE e.healthScore < 0 OR e.healthScore > 100 RETURN e'
    }
}
```

→ 로직이 Python에 있으므로 **TTL로 변환 불가**

### 해결 방법

| 옵션 | 설명 |
|------|------|
| **옵션 1** | 수동으로 OWL/SHACL 작성 (이중 관리 필요) |
| **옵션 2** | Python → OWL/SHACL 변환 도구 개발 |
| **옵션 3** | 처음부터 OWL/SHACL로 설계 (구조 변경 필요) |

---

## Q11: OWL/SHACL TTL 임포트 시 자동 추론/검증 여부

**질문:** 표준 온톨로지 방식으로 온톨로지 구축하는 경우에 "공리", "제약조건"을 OWL, SHACL로 구현하여 ttl에 저장을 한다. 그리고 이 ttl 내용을 Neo4j GraphDB에 임포트하면 Neo4j GraphDB Cypher에는 "추론", "제약조건"을 검증하는 기능 및 코드가 자동으로 생성되나요? 아니면 이 "공리", "제약조건"이 기존 그래프 데이터 즉 노드, 관계, 속성 등에 반영되나요?

**답변:** **"둘 다 아닙니다"**.

### OWL/SHACL TTL을 Neo4j에 임포트하면?

```
┌─────────────────────────────────────────────────────────┐
│                    임포트 결과                           │
│                                                         │
│  OWL 공리      →  단순히 "데이터"로 저장됨                │
│  SHACL 제약조건 →  단순히 "데이터"로 저장됨                │
│                                                         │
│  ❌ 자동으로 Cypher 검증 코드 생성 안됨                   │
│  ❌ 자동으로 추론/검증 기능 활성화 안됨                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Neo4j는 OWL/SHACL을 "이해"하지 못함

| 기능 | Neo4j + n10s | 전용 Triple Store (Stardog, GraphDB 등) |
|------|-------------|----------------------------------------|
| RDF 데이터 저장 | ✅ | ✅ |
| OWL 공리 저장 | ✅ (데이터로만) | ✅ |
| OWL 자동 추론 | ❌ | ✅ (내장 Reasoner) |
| SHACL 자동 검증 | ❌ | ✅ (내장 Validator) |

### 예시로 이해하기

#### OWL 공리 임포트 시

**TTL 파일:**
```turtle
upw:Equipment owl:disjointWith upw:Sensor .
```

**Neo4j 임포트 후:**
```
(:Class {uri: "upw:Equipment"})
  -[:owl__disjointWith]->
(:Class {uri: "upw:Sensor"})
```

→ 그냥 **노드와 관계로 저장**될 뿐, "Equipment와 Sensor는 동시에 될 수 없다"는 규칙이 **자동 적용되지 않음**

### 결론

```
Q: OWL/SHACL TTL을 Neo4j에 임포트하면 자동으로 검증되나?
A: 아니요. Neo4j는 OWL/SHACL의 "의미"를 이해하지 못합니다.
   단순히 데이터(노드/관계)로 저장할 뿐입니다.

┌─────────────────────────────────────────────────────────┐
│  Neo4j = Property Graph DB (데이터 저장소)               │
│  Stardog/GraphDB = Semantic Graph DB (추론 엔진 내장)    │
└─────────────────────────────────────────────────────────┘
```

**OWL/SHACL 자동 추론/검증을 원하면 Neo4j가 아닌 전용 Triple Store를 사용해야 합니다.**

---

## Q12: Triple Store 자동 추론/검증의 의미

**질문:** OWL/SHACL 자동 추론/검증을 원하면 Neo4j가 아닌 전용 Triple Store를 사용하면 자동으로 추론, 검증 한다는 것이 어떤 의미인가요? 이 프로그램을 실행한 다음 ttl파일을 읽어서 안에 OWL/SHACL 문법을 해석하여 결과를 도출한다는 의미인가요? 해당 ttl파일에는 RDF, RDFS, OWL, SHACL 스키마로 작성한 내용이 모두 있어야 하나요?

**답변:**

### Triple Store의 자동 추론/검증 원리

```
┌─────────────────────────────────────────────────────────┐
│                Triple Store (예: Stardog)               │
│                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │ TTL 임포트   │ →  │ 내장 Reasoner│ →  │ 추론된 결과  │ │
│  │ (스키마+데이터)│    │ (Pellet 등) │    │ 자동 생성   │ │
│  └─────────────┘    └─────────────┘    └─────────────┘ │
│                                                         │
│  사용자가 쿼리하면 → 원본 데이터 + 추론된 데이터 함께 반환  │
└─────────────────────────────────────────────────────────┘
```

**네, 맞습니다.** Triple Store가 TTL 파일을 읽고, OWL/SHACL 문법을 해석하여 자동으로 결과를 도출합니다.

### 파일 구성 방법

#### 방법 1: 하나의 TTL 파일에 모두 포함

```turtle
# === 1. 네임스페이스 정의 ===
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix upw: <http://example.org/upw#> .

# === 2. 클래스 정의 (RDFS/OWL) ===
upw:Equipment a owl:Class .
upw:Sensor a owl:Class .

# === 3. 공리 (OWL) ===
upw:Equipment owl:disjointWith upw:Sensor .

# === 4. 제약조건 (SHACL) ===
upw:EquipmentShape a sh:NodeShape ;
    sh:targetClass upw:Equipment ;
    sh:property [
        sh:path upw:healthScore ;
        sh:minInclusive 0 ;
        sh:maxInclusive 100 ;
    ] .

# === 5. 인스턴스 데이터 ===
upw:RO-001 a upw:Equipment ;
    upw:healthScore 85 .
```

#### 방법 2: 역할별로 파일 분리 (권장)

```
ontology/
├── schema.ttl        # 클래스, 속성 정의 (RDFS/OWL)
├── axioms.ttl        # 공리 (OWL)
├── shapes.ttl        # 제약조건 (SHACL)
└── data.ttl          # 인스턴스 데이터
```

### 각 표준의 역할

| 표준 | 역할 | 예시 |
|------|------|------|
| **RDF** | 데이터 표현 기본 형식 | `subject predicate object .` |
| **RDFS** | 클래스/속성 계층 정의 | `subClassOf`, `domain`, `range` |
| **OWL** | 복잡한 공리/추론 규칙 | `disjointWith`, `TransitiveProperty`, `inverseOf` |
| **SHACL** | 데이터 유효성 제약조건 | 값 범위, 필수 속성, 카디널리티 |

### 필수 여부

```
✅ RDF: 필수 (기본 문법)
✅ RDFS: 거의 필수 (클래스/속성 정의)
⭕ OWL: 선택 (자동 추론이 필요하면 사용)
⭕ SHACL: 선택 (데이터 검증이 필요하면 사용)
```

---

## Q13: Reasoner와 Validator가 읽는 파일

**질문:** Triple Store의 Reasoner와 Validator 각각 아래 파일들 중에서 어떤 파일을 읽어서 어떤 결과를 도출하나요?

```
ontology/
├── schema.ttl        # 클래스, 속성 정의 (RDFS/OWL)
├── axioms.ttl        # 공리 (OWL)
├── shapes.ttl        # 제약조건 (SHACL)
└── data.ttl          # 인스턴스 데이터
```

**답변:**

### Reasoner와 Validator의 역할 분담

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Triple Store                                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    OWL Reasoner                              │   │
│  │                                                              │   │
│  │   입력 파일:                                                  │   │
│  │   ├── schema.ttl (클래스/속성 계층)                           │   │
│  │   ├── axioms.ttl (OWL 공리)                                  │   │
│  │   └── data.ttl   (인스턴스 데이터)                            │   │
│  │                                                              │   │
│  │   출력: 추론된 새로운 트리플 (Inferred Triples)                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   SHACL Validator                            │   │
│  │                                                              │   │
│  │   입력 파일:                                                  │   │
│  │   ├── shapes.ttl (SHACL 제약조건)                            │   │
│  │   └── data.ttl   (검증할 데이터)                              │   │
│  │                                                              │   │
│  │   출력: 검증 보고서 (Validation Report)                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 파일별 역할 정리

| 파일 | Reasoner | Validator |
|------|----------|-----------|
| **schema.ttl** | ✅ 사용 | ❌ 미사용 |
| **axioms.ttl** | ✅ 사용 | ❌ 미사용 |
| **shapes.ttl** | ❌ 미사용 | ✅ 사용 |
| **data.ttl** | ✅ 사용 | ✅ 사용 |

```
schema.ttl + axioms.ttl + data.ttl → Reasoner → 추론된 트리플
shapes.ttl + data.ttl              → Validator → 검증 보고서
```

---

## Q14: 백엔드에서 Triple Store 제어 방식

**질문:** 백엔드 서버에서 Triple Store의 Reasoner와 Validator를 Python 코드를 통하여 제어 즉 동작하게 하나요?

**답변:** 네, 맞습니다. 백엔드에서 Python 코드로 Triple Store를 제어합니다.

### Triple Store 제어 방식

```
┌─────────────────────────────────────────────────────────────────────┐
│                         백엔드 서버 (Python)                         │
│                                                                     │
│   ┌─────────────────┐      HTTP/SPARQL       ┌─────────────────┐   │
│   │  Python 코드     │ ◄──────────────────► │  Triple Store    │   │
│   │                 │                        │  (Stardog 등)    │   │
│   │  - SPARQLWrapper│                        │                 │   │
│   │  - RDFLib       │                        │  - Reasoner     │   │
│   │  - 전용 SDK     │                        │  - Validator    │   │
│   └─────────────────┘                        └─────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 동작 방식 2가지

#### 방식 1: 쿼리 시 자동 추론 (Query-time Reasoning)

```python
# SPARQL 쿼리에 추론 옵션 포함
query = """
    SELECT ?equipment WHERE {
        ?equipment a upw:Equipment .
    }
"""

# 추론 활성화하여 쿼리 (Stardog 예시)
response = requests.get(
    "http://localhost:5820/mydb/query",
    params={"query": query, "reasoning": "true"},  # 추론 ON
    headers={"Accept": "application/json"}
)
```

#### 방식 2: 명시적 호출 (On-demand)

```python
# 추론 실행 요청
def run_reasoning():
    response = requests.post(
        "http://localhost:5820/mydb/reasoning/consistency"
    )
    return response.json()

# SHACL 검증 실행 요청
def run_shacl_validation():
    response = requests.post(
        "http://localhost:5820/mydb/validate",
        headers={"Content-Type": "application/ld+json"}
    )
    return response.json()  # 검증 보고서 반환
```

### 아키텍처 비교

#### 현재 프로젝트 (Neo4j)

```
Python 백엔드
├── reasoning_service.py  → Cypher 쿼리 직접 실행
├── axiom_service.py      → Cypher 쿼리 직접 실행
└── constraint_service.py → Cypher 쿼리 직접 실행
         │
         ▼
      Neo4j (데이터 저장만)
```

#### Triple Store 방식

```
Python 백엔드
├── SPARQL 쿼리 + reasoning=true  → Reasoner 호출
└── SHACL validate API            → Validator 호출
         │
         ▼
      Triple Store
      ├── 내장 OWL Reasoner (자동 추론)
      └── 내장 SHACL Validator (자동 검증)
```

### 결론

```
Q: 백엔드에서 Python으로 Triple Store의 Reasoner/Validator를 제어하나?
A: 네. HTTP API 또는 전용 SDK를 통해 제어합니다.

   - 쿼리 시 reasoning=true 옵션 → Reasoner 동작
   - validate API 호출 → Validator 동작

   로직은 Triple Store 내부에 있고,
   Python은 "실행 요청"만 합니다.
```

---

## 최종 요약

### 현재 프로젝트 구현 방식

| 구분 | 구현 방식 |
|------|----------|
| 데이터베이스 | Neo4j GraphDB |
| 추론 엔진 | Python + Cypher 쿼리 (직접 구현) |
| 공리 검증 | Python + Cypher 쿼리 (직접 구현) |
| 제약조건 검증 | Python + Cypher 쿼리 (직접 구현) |
| OWL/SHACL | 문서화 용도로만 사용 |
| n10s | RDF 임포트용으로만 사용 |

### 표준 온톨로지 방식과의 차이

| 구분 | 현재 프로젝트 | 표준 온톨로지 방식 |
|------|-------------|------------------|
| DB | Neo4j (Property Graph) | Triple Store (RDF Graph) |
| 추론 | Python 코드 | OWL Reasoner (내장) |
| 검증 | Python 코드 | SHACL Validator (내장) |
| 이식성 | 낮음 (Neo4j 종속) | 높음 (W3C 표준) |
| 구현 복잡도 | 낮음 | 높음 |
| 자동화 | 수동 구현 필요 | 자동 추론/검증 |

---

*문서 생성일: 2026-01-27*
