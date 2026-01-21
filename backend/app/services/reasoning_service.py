"""
Reasoning/Inference Service for UPW Ontology

This service implements rule-based reasoning to infer new knowledge
from existing data in the ontology.

추론 과정 추적 기능 포함:
- 각 추론 단계를 기록하고 시각화
- 사용된 증거(노드, 관계, 속성) 추적
- 추론 근거 설명 생성
"""

from typing import List, Dict, Any, Optional
from flask import current_app
from datetime import datetime
from uuid import uuid4

from .neo4j_service import Neo4jService


class ReasoningTrace:
    """추론 과정을 추적하는 클래스"""

    def __init__(self, rule_id: str, rule_name: str, rule_description: str):
        self.id = f"TRACE-{uuid4().hex[:8]}"
        self.rule_id = rule_id
        self.rule_name = rule_name
        self.rule_description = rule_description
        self.started_at = datetime.now()
        self.completed_at = None
        self.steps: List[Dict[str, Any]] = []
        self.evidence: List[Dict[str, Any]] = []
        self.result = "PENDING"
        self.inferred_count = 0
        self.inferred_items: List[Dict[str, Any]] = []

    def add_step(self, step_type: str, description: str, description_detail: str = None,
                 query: str = None, result_summary: str = None,
                 data: Any = None, data_count: int = 0) -> Dict[str, Any]:
        """추론 단계 추가"""
        step = {
            'stepNumber': len(self.steps) + 1,
            'type': step_type,  # MATCH, FILTER, CHECK, INFERENCE
            'description': description,
            'descriptionDetail': description_detail,
            'query': query,
            'resultSummary': result_summary,
            'dataCount': data_count,
            'data': data if data else [],
            'timestamp': datetime.now().isoformat()
        }
        self.steps.append(step)
        return step

    def add_evidence(self, evidence_type: str, node_id: str, label: str,
                     property_name: str, property_value: Any,
                     description: str) -> Dict[str, Any]:
        """추론에 사용된 증거 추가"""
        evidence = {
            'id': f"EV-{len(self.evidence) + 1}",
            'type': evidence_type,  # NODE, RELATIONSHIP, PROPERTY
            'nodeId': node_id,
            'label': label,
            'propertyName': property_name,
            'propertyValue': property_value,
            'description': description
        }
        self.evidence.append(evidence)
        return evidence

    def complete(self, result: str, inferred_count: int = 0,
                 inferred_items: List[Dict[str, Any]] = None):
        """추론 완료 처리"""
        self.completed_at = datetime.now()
        self.result = result  # SUCCESS, NO_MATCH, ERROR
        self.inferred_count = inferred_count
        self.inferred_items = inferred_items or []

    def to_dict(self) -> Dict[str, Any]:
        """딕셔너리로 변환"""
        return {
            'id': self.id,
            'ruleId': self.rule_id,
            'ruleName': self.rule_name,
            'ruleDescription': self.rule_description,
            'startedAt': self.started_at.isoformat(),
            'completedAt': self.completed_at.isoformat() if self.completed_at else None,
            'result': self.result,
            'steps': self.steps,
            'evidence': self.evidence,
            'inferredCount': self.inferred_count,
            'inferredItems': self.inferred_items,
            'summary': self._generate_summary()
        }

    def _generate_summary(self) -> str:
        """추론 결과 요약 생성"""
        if self.result == "NO_MATCH":
            return f"'{self.rule_name}' 규칙을 적용했으나 조건에 맞는 데이터가 없습니다."
        elif self.result == "SUCCESS":
            return f"'{self.rule_name}' 규칙으로 {self.inferred_count}개의 새로운 지식을 추론했습니다."
        elif self.result == "ERROR":
            return f"'{self.rule_name}' 규칙 실행 중 오류가 발생했습니다."
        return "추론이 진행 중입니다."


class ReasoningService:
    """Service for ontology reasoning and inference"""

    # Define inference rules
    RULES = [
        {
            'id': 'rule_maintenance_needed',
            'name': '유지보수 필요 규칙',
            'description': '건강 점수가 60 미만인 설비는 유지보수가 필요합니다',
            'category': '유지보수',
            'condition': '설비(Equipment)의 healthScore < 60 AND healthStatus ≠ Critical AND 이미 대기 중인 유지보수가 없음',
            'inference': '해당 설비에 대해 새로운 유지보수(Maintenance) 노드를 생성하고 NEEDS_MAINTENANCE 관계를 추가합니다',
            'input_data': ['Equipment.healthScore', 'Equipment.healthStatus'],
            'output_data': ['Maintenance 노드 (유형: ConditionBased)', 'NEEDS_MAINTENANCE 관계'],
            'query': '''
                MATCH (e:Equipment)
                WHERE e.healthScore < 60 AND e.healthStatus <> 'Critical'
                AND NOT EXISTS {
                    MATCH (e)-[:NEEDS_MAINTENANCE]->(m:Maintenance)
                    WHERE m.status = 'Pending'
                }
                RETURN e.equipmentId AS equipmentId, e.name AS name,
                       e.healthScore AS healthScore, 'NeedsMaintenance' AS inferredType
            ''',
            'action_query': '''
                MATCH (e:Equipment {equipmentId: $equipmentId})
                MERGE (m:Maintenance:Inferred {
                    maintenanceId: 'MAINT-INF-' + e.equipmentId + '-' + toString(datetime()),
                    type: 'ConditionBased',
                    priority: CASE WHEN e.healthScore < 40 THEN 'High' ELSE 'Medium' END,
                    reason: 'Inferred: Low health score (' + toString(e.healthScore) + ')',
                    status: 'Pending',
                    inferredAt: datetime(),
                    isInferred: true
                })
                MERGE (e)-[r:NEEDS_MAINTENANCE {isInferred: true}]->(m)
                RETURN e.equipmentId AS equipmentId, m.maintenanceId AS maintenanceId
            '''
        },
        {
            'id': 'rule_anomaly_from_sensor',
            'name': '이상 탐지 규칙',
            'description': '정상 범위를 벗어난 센서 측정값에서 이상을 탐지합니다',
            'category': '이상탐지',
            'condition': '최근 24시간 내 센서 측정값이 정상 범위를 벗어남 (압력: 1~10, 온도: 10~50, 전도도: <15, 진동: <8)',
            'inference': '이상(Anomaly) 노드를 생성하고 설비에 HAS_ANOMALY 관계를 추가합니다',
            'input_data': ['Observation.value', 'Sensor.sensorType', 'Observation.timestamp'],
            'output_data': ['Anomaly 노드 (심각도: Medium)', 'HAS_ANOMALY 관계'],
            'query': '''
                MATCH (e:Equipment)-[:HAS_SENSOR]->(s:Sensor)
                MATCH (o:Observation)-[:OBSERVED_BY]->(s)
                WHERE o.timestamp > datetime() - duration('P1D')
                WITH e, s, o,
                     CASE
                         WHEN s.type IN ['Pressure', 'PressureSensor'] THEN CASE WHEN o.value < 1 OR o.value > 10 THEN true ELSE false END
                         WHEN s.type IN ['Temperature', 'TemperatureSensor'] THEN CASE WHEN o.value < 10 OR o.value > 50 THEN true ELSE false END
                         WHEN s.type IN ['Conductivity', 'ConductivitySensor'] THEN CASE WHEN o.value > 15 THEN true ELSE false END
                         WHEN s.type IN ['Vibration', 'VibrationSensor'] THEN CASE WHEN o.value > 8 THEN true ELSE false END
                         ELSE false
                     END AS isAnomalous
                WHERE isAnomalous = true
                AND NOT EXISTS {
                    MATCH (e)-[:HAS_ANOMALY]->(a:Anomaly:Inferred)
                    WHERE a.sensorId = s.sensorId AND a.timestamp > datetime() - duration('PT1H')
                }
                RETURN DISTINCT e.equipmentId AS equipmentId, s.sensorId AS sensorId,
                       s.type AS sensorType, o.value AS value,
                       'AnomalyDetected' AS inferredType
                LIMIT 10
            ''',
            'action_query': '''
                MATCH (e:Equipment {equipmentId: $equipmentId})
                MATCH (s:Sensor {sensorId: $sensorId})
                MERGE (a:Anomaly:Inferred {
                    anomalyId: 'ANOM-INF-' + $sensorId + '-' + toString(datetime()),
                    sensorId: $sensorId,
                    sensorType: $sensorType,
                    value: $value,
                    severity: 'Medium',
                    description: 'Inferred: Abnormal ' + $sensorType + ' reading (' + toString($value) + ')',
                    timestamp: datetime(),
                    isInferred: true
                })
                MERGE (e)-[r:HAS_ANOMALY {isInferred: true}]->(a)
                RETURN e.equipmentId AS equipmentId, a.anomalyId AS anomalyId
            '''
        },
        {
            'id': 'rule_failure_prediction',
            'name': '고장 예측 규칙',
            'description': '센서 트렌드를 기반으로 잠재적 고장을 예측합니다',
            'category': '예측',
            'condition': '최근 7일간 진동/온도/압력 센서의 최신 값이 평균의 130%를 초과 (10개 이상 측정값 필요)',
            'inference': '고장예측(FailurePrediction) 노드를 생성하고 설비에 MAY_FAIL 관계를 추가합니다',
            'input_data': ['Observation.value (최근 7일)', 'Sensor.sensorType'],
            'output_data': ['FailurePrediction 노드 (신뢰도: 0.7)', 'MAY_FAIL 관계'],
            'query': '''
                MATCH (e:Equipment)-[:HAS_SENSOR]->(s:Sensor)
                WHERE s.type IN ['Vibration', 'VibrationSensor', 'Temperature', 'TemperatureSensor', 'Pressure', 'PressureSensor']
                MATCH (o:Observation)-[:OBSERVED_BY]->(s)
                WHERE o.timestamp > datetime() - duration('P7D')
                  AND o.isTrendingData = true
                WITH e, s, o
                ORDER BY o.timestamp ASC
                WITH e, s, collect(o.value) AS values
                WHERE size(values) >= 10
                WITH e, s, values,
                     reduce(sum = 0.0, v IN values | sum + v) / size(values) AS avgValue,
                     values[-1] AS latestValue
                WHERE latestValue > avgValue * 1.25
                AND NOT EXISTS {
                    MATCH (e)-[:MAY_FAIL]->(f:FailurePrediction:Inferred)
                    WHERE f.timestamp > datetime() - duration('P1D')
                }
                RETURN e.equipmentId AS equipmentId, e.name AS name,
                       s.type AS sensorType, avgValue, latestValue,
                       'FailurePrediction' AS inferredType
                LIMIT 5
            ''',
            'action_query': '''
                MATCH (e:Equipment {equipmentId: $equipmentId})
                MERGE (f:FailurePrediction:Inferred {
                    predictionId: 'PRED-' + $equipmentId + '-' + toString(datetime()),
                    sensorType: $sensorType,
                    confidence: 0.7,
                    reason: 'Inferred: ' + $sensorType + ' trending up (avg: ' + toString($avgValue) + ', latest: ' + toString($latestValue) + ')',
                    timestamp: datetime(),
                    isInferred: true
                })
                MERGE (e)-[r:MAY_FAIL {isInferred: true}]->(f)
                RETURN e.equipmentId AS equipmentId, f.predictionId AS predictionId
            '''
        },
        {
            'id': 'rule_equipment_dependency',
            'name': '설비 의존성 규칙',
            'description': '공정 흐름을 기반으로 설비 간 의존성을 추론합니다',
            'category': '구조',
            'condition': '동일 공정영역 내 RO/EDI 설비와 UV살균기/저장탱크가 존재하고 FEEDS_INTO 관계가 없음',
            'inference': 'RO/EDI에서 UV살균기/저장탱크로의 FEEDS_INTO 관계를 추가합니다',
            'input_data': ['ProcessArea', 'Equipment.equipmentType'],
            'output_data': ['FEEDS_INTO 관계'],
            'query': '''
                MATCH (e1:Equipment)-[:LOCATED_IN]->(a:ProcessArea)
                MATCH (e2:Equipment)-[:LOCATED_IN]->(a)
                WHERE e1 <> e2
                AND e1.type IN ['ReverseOsmosis', 'Electrodeionization']
                AND e2.type IN ['UVSterilizer', 'StorageTank']
                AND NOT EXISTS {
                    MATCH (e1)-[:FEEDS_INTO]->(e2)
                }
                RETURN e1.equipmentId AS sourceId, e1.name AS sourceName,
                       e2.equipmentId AS targetId, e2.name AS targetName,
                       a.name AS areaName, 'DependencyInferred' AS inferredType
                LIMIT 10
            ''',
            'action_query': '''
                MATCH (e1:Equipment {equipmentId: $sourceId})
                MATCH (e2:Equipment {equipmentId: $targetId})
                MERGE (e1)-[r:FEEDS_INTO {isInferred: true, inferredAt: datetime()}]->(e2)
                RETURN e1.equipmentId AS sourceId, e2.equipmentId AS targetId
            '''
        },
        {
            'id': 'rule_sensor_correlation',
            'name': '센서 상관관계 규칙',
            'description': '동일 설비의 센서 간 상관관계를 식별합니다',
            'category': '분석',
            'condition': '동일 설비에 압력(Pressure) 센서와 유량(Flow) 센서가 모두 존재하고 CORRELATES_WITH 관계가 없음',
            'inference': '압력-유량 센서 간 CORRELATES_WITH 관계를 추가합니다 (물리적 상관관계)',
            'input_data': ['Equipment', 'Sensor.sensorType'],
            'output_data': ['CORRELATES_WITH 관계 (유형: Pressure-Flow)'],
            'query': '''
                MATCH (e:Equipment)-[:HAS_SENSOR]->(s1:Sensor)
                MATCH (e)-[:HAS_SENSOR]->(s2:Sensor)
                WHERE s1 <> s2
                AND s1.type IN ['Pressure', 'PressureSensor'] AND s2.type IN ['Flow', 'FlowSensor']
                AND NOT EXISTS {
                    MATCH (s1)-[:CORRELATES_WITH]->(s2)
                }
                RETURN s1.sensorId AS sensor1Id, s1.name AS sensor1Name,
                       s2.sensorId AS sensor2Id, s2.name AS sensor2Name,
                       e.name AS equipmentName, 'CorrelationInferred' AS inferredType
                LIMIT 10
            ''',
            'action_query': '''
                MATCH (s1:Sensor {sensorId: $sensor1Id})
                MATCH (s2:Sensor {sensorId: $sensor2Id})
                MERGE (s1)-[r:CORRELATES_WITH {
                    isInferred: true,
                    correlationType: 'Pressure-Flow',
                    inferredAt: datetime()
                }]->(s2)
                RETURN s1.sensorId AS sensor1Id, s2.sensorId AS sensor2Id
            '''
        }
    ]

    @classmethod
    def get_rules(cls) -> List[Dict[str, Any]]:
        """Get all inference rules with detailed information"""
        return [
            {
                'id': rule['id'],
                'name': rule['name'],
                'description': rule['description'],
                'category': rule['category'],
                'condition': rule.get('condition', ''),
                'inference': rule.get('inference', ''),
                'inputData': rule.get('input_data', []),
                'outputData': rule.get('output_data', [])
            }
            for rule in cls.RULES
        ]

    @classmethod
    def get_rule_by_id(cls, rule_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific rule by ID"""
        for rule in cls.RULES:
            if rule['id'] == rule_id:
                return rule
        return None

    @classmethod
    def check_rule(cls, rule_id: str) -> Dict[str, Any]:
        """Check what a rule would infer without applying it"""
        rule = cls.get_rule_by_id(rule_id)
        if not rule:
            return {'status': 'error', 'message': f'Rule {rule_id} not found'}

        try:
            with Neo4jService.session() as session:
                result = session.run(rule['query'])
                candidates = [dict(record) for record in result]

                return {
                    'status': 'success',
                    'rule': {
                        'id': rule['id'],
                        'name': rule['name'],
                        'description': rule['description']
                    },
                    'candidates': candidates,
                    'count': len(candidates)
                }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @classmethod
    def apply_rule(cls, rule_id: str) -> Dict[str, Any]:
        """Apply a specific rule and create inferred relationships"""
        rule = cls.get_rule_by_id(rule_id)
        if not rule:
            return {'status': 'error', 'message': f'Rule {rule_id} not found'}

        try:
            with Neo4jService.session() as session:
                # First get candidates
                result = session.run(rule['query'])
                candidates = [dict(record) for record in result]

                if not candidates:
                    return {
                        'status': 'success',
                        'rule': rule['id'],
                        'message': 'No new inferences to make',
                        'inferred': [],
                        'count': 0
                    }

                # Apply action for each candidate
                inferred = []
                for candidate in candidates:
                    try:
                        action_result = session.run(rule['action_query'], candidate)
                        action_record = action_result.single()
                        if action_record:
                            inferred.append(dict(action_record))
                    except Exception as e:
                        print(f"Error applying rule to candidate: {e}")

                return {
                    'status': 'success',
                    'rule': rule['id'],
                    'message': f'Applied {len(inferred)} inferences',
                    'inferred': inferred,
                    'count': len(inferred)
                }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @classmethod
    def run_all_rules(cls) -> Dict[str, Any]:
        """Run all inference rules"""
        results = []
        total_inferred = 0

        for rule in cls.RULES:
            result = cls.apply_rule(rule['id'])
            results.append({
                'ruleId': rule['id'],
                'ruleName': rule['name'],
                'status': result.get('status'),
                'count': result.get('count', 0),
                'message': result.get('message')
            })
            total_inferred += result.get('count', 0)

        return {
            'status': 'success',
            'timestamp': datetime.now().isoformat(),
            'totalInferred': total_inferred,
            'results': results
        }

    @classmethod
    def get_inferred_facts(cls, limit: int = 100) -> Dict[str, Any]:
        """Get all inferred facts/relationships"""
        try:
            with Neo4jService.session() as session:
                # Get inferred nodes
                nodes_result = session.run('''
                    MATCH (n:Inferred)
                    RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS properties
                    ORDER BY n.inferredAt DESC
                    LIMIT $limit
                ''', {'limit': limit})
                nodes = [dict(r) for r in nodes_result]

                # Get inferred relationships
                rels_result = session.run('''
                    MATCH (a)-[r]->(b)
                    WHERE r.isInferred = true
                    RETURN elementId(r) AS id, type(r) AS type,
                           elementId(a) AS sourceId,
                           coalesce(a.name, a.equipmentId, a.sensorId) AS sourceName,
                           elementId(b) AS targetId,
                           coalesce(b.name, b.equipmentId, b.sensorId) AS targetName,
                           properties(r) AS properties
                    ORDER BY r.inferredAt DESC
                    LIMIT $limit
                ''', {'limit': limit})
                relationships = [dict(r) for r in rels_result]

                return {
                    'status': 'success',
                    'nodes': nodes,
                    'relationships': relationships,
                    'nodeCount': len(nodes),
                    'relationshipCount': len(relationships)
                }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @classmethod
    def clear_inferred_facts(cls) -> Dict[str, Any]:
        """Remove all inferred facts"""
        try:
            with Neo4jService.session() as session:
                # Remove inferred relationships
                rel_result = session.run('''
                    MATCH ()-[r]->()
                    WHERE r.isInferred = true
                    DELETE r
                    RETURN count(r) AS deletedRels
                ''')
                deleted_rels = rel_result.single()['deletedRels']

                # Remove inferred nodes
                node_result = session.run('''
                    MATCH (n:Inferred)
                    DETACH DELETE n
                    RETURN count(n) AS deletedNodes
                ''')
                deleted_nodes = node_result.single()['deletedNodes']

                return {
                    'status': 'success',
                    'message': f'Cleared {deleted_nodes} inferred nodes and {deleted_rels} inferred relationships',
                    'deletedNodes': deleted_nodes,
                    'deletedRelationships': deleted_rels
                }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @classmethod
    def get_inference_statistics(cls) -> Dict[str, Any]:
        """Get statistics about inferred knowledge"""
        try:
            with Neo4jService.session() as session:
                # Count inferred nodes by type
                nodes_result = session.run('''
                    MATCH (n:Inferred)
                    UNWIND labels(n) AS label
                    WITH label
                    WHERE label <> 'Inferred'
                    RETURN label, count(*) AS count
                    ORDER BY count DESC
                ''')
                inferred_nodes = [dict(r) for r in nodes_result]

                # Count inferred relationships by type
                rels_result = session.run('''
                    MATCH ()-[r]->()
                    WHERE r.isInferred = true
                    RETURN type(r) AS type, count(*) AS count
                    ORDER BY count DESC
                ''')
                inferred_rels = [dict(r) for r in rels_result]

                # Total counts
                totals_result = session.run('''
                    MATCH (n:Inferred)
                    WITH count(n) AS nodeCount
                    MATCH ()-[r]->()
                    WHERE r.isInferred = true
                    RETURN nodeCount, count(r) AS relCount
                ''')
                totals = totals_result.single()

                return {
                    'status': 'success',
                    'totalInferredNodes': totals['nodeCount'] if totals else 0,
                    'totalInferredRelationships': totals['relCount'] if totals else 0,
                    'nodesByType': inferred_nodes,
                    'relationshipsByType': inferred_rels
                }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @classmethod
    def run_rule_with_trace(cls, rule_id: str) -> Dict[str, Any]:
        """
        추론 과정을 추적하면서 규칙을 실행합니다.
        각 단계에서 어떤 데이터가 사용되었고, 왜 추론이 이루어졌는지 기록합니다.
        """
        rule = cls.get_rule_by_id(rule_id)
        if not rule:
            return {'status': 'error', 'message': f'규칙 {rule_id}을(를) 찾을 수 없습니다'}

        # 추론 추적 객체 생성
        trace = ReasoningTrace(
            rule_id=rule['id'],
            rule_name=rule['name'],
            rule_description=rule['description']
        )

        try:
            with Neo4jService.session() as session:
                # 규칙별 추론 과정 추적
                if rule_id == 'rule_maintenance_needed':
                    cls._trace_maintenance_rule(session, rule, trace)
                elif rule_id == 'rule_anomaly_from_sensor':
                    cls._trace_anomaly_rule(session, rule, trace)
                elif rule_id == 'rule_failure_prediction':
                    cls._trace_failure_prediction_rule(session, rule, trace)
                elif rule_id == 'rule_equipment_dependency':
                    cls._trace_equipment_dependency_rule(session, rule, trace)
                elif rule_id == 'rule_sensor_correlation':
                    cls._trace_sensor_correlation_rule(session, rule, trace)
                else:
                    # 일반 규칙 처리
                    cls._trace_generic_rule(session, rule, trace)

                return {
                    'status': 'success',
                    'trace': trace.to_dict()
                }

        except Exception as e:
            trace.complete("ERROR")
            return {
                'status': 'error',
                'message': str(e),
                'trace': trace.to_dict()
            }

    @classmethod
    def _trace_maintenance_rule(cls, session, rule, trace: ReasoningTrace):
        """유지보수 필요 규칙 추론 과정 추적"""

        # Step 1: 모든 Equipment 노드 검색
        trace.add_step(
            step_type="MATCH",
            description="설비(Equipment) 노드 검색",
            description_detail="데이터베이스에서 모든 설비 노드를 검색합니다.",
            query="MATCH (e:Equipment) RETURN e"
        )

        all_equipment_result = session.run('''
            MATCH (e:Equipment)
            RETURN e.equipmentId AS equipmentId, e.name AS name,
                   e.healthScore AS healthScore, e.healthStatus AS healthStatus
        ''')
        all_equipment = [dict(r) for r in all_equipment_result]

        trace.steps[-1]['resultSummary'] = f"총 {len(all_equipment)}개의 설비 발견"
        trace.steps[-1]['dataCount'] = len(all_equipment)
        trace.steps[-1]['data'] = all_equipment[:5]  # 처음 5개만 표시

        if not all_equipment:
            trace.complete("NO_MATCH", 0)
            return

        # Step 2: healthScore < 60 조건 필터링
        trace.add_step(
            step_type="FILTER",
            description="건강 점수 조건 확인",
            description_detail="건강 점수(healthScore)가 60 미만인 설비를 필터링합니다.",
            query="WHERE e.healthScore < 60"
        )

        low_health_result = session.run('''
            MATCH (e:Equipment)
            WHERE e.healthScore < 60
            RETURN e.equipmentId AS equipmentId, e.name AS name,
                   e.healthScore AS healthScore, e.healthStatus AS healthStatus
        ''')
        low_health_equipment = [dict(r) for r in low_health_result]

        # 증거 추가
        for eq in low_health_equipment:
            trace.add_evidence(
                evidence_type="PROPERTY",
                node_id=eq['equipmentId'],
                label="Equipment",
                property_name="healthScore",
                property_value=eq['healthScore'],
                description=f"설비 '{eq['name']}'의 건강 점수는 {eq['healthScore']}입니다 (기준: 60 미만)"
            )

        trace.steps[-1]['resultSummary'] = f"{len(low_health_equipment)}개 설비가 건강 점수 60 미만"
        trace.steps[-1]['dataCount'] = len(low_health_equipment)
        trace.steps[-1]['data'] = low_health_equipment

        if not low_health_equipment:
            trace.add_step(
                step_type="RESULT",
                description="조건 불충족",
                description_detail="건강 점수가 60 미만인 설비가 없습니다.",
                result_summary="추론 대상 없음"
            )
            trace.complete("NO_MATCH", 0)
            return

        # Step 3: healthStatus != 'Critical' 조건 확인
        trace.add_step(
            step_type="FILTER",
            description="상태 조건 확인",
            description_detail="건강 상태(healthStatus)가 'Critical'이 아닌 설비를 필터링합니다. Critical 상태는 이미 긴급 처리 대상입니다.",
            query="WHERE e.healthStatus <> 'Critical'"
        )

        not_critical_result = session.run('''
            MATCH (e:Equipment)
            WHERE e.healthScore < 60 AND e.healthStatus <> 'Critical'
            RETURN e.equipmentId AS equipmentId, e.name AS name,
                   e.healthScore AS healthScore, e.healthStatus AS healthStatus
        ''')
        not_critical = [dict(r) for r in not_critical_result]

        for eq in not_critical:
            trace.add_evidence(
                evidence_type="PROPERTY",
                node_id=eq['equipmentId'],
                label="Equipment",
                property_name="healthStatus",
                property_value=eq['healthStatus'],
                description=f"설비 '{eq['name']}'의 상태는 '{eq['healthStatus']}'입니다 (Critical 아님)"
            )

        trace.steps[-1]['resultSummary'] = f"{len(not_critical)}개 설비가 Critical 상태 아님"
        trace.steps[-1]['dataCount'] = len(not_critical)
        trace.steps[-1]['data'] = not_critical

        if not not_critical:
            trace.add_step(
                step_type="RESULT",
                description="조건 불충족",
                description_detail="조건을 충족하는 설비가 없습니다.",
                result_summary="추론 대상 없음"
            )
            trace.complete("NO_MATCH", 0)
            return

        # Step 4: 기존 유지보수 관계 확인
        trace.add_step(
            step_type="CHECK",
            description="기존 유지보수 확인",
            description_detail="이미 대기 중인 유지보수(NEEDS_MAINTENANCE 관계)가 없는 설비만 선택합니다.",
            query="NOT EXISTS { MATCH (e)-[:NEEDS_MAINTENANCE]->(m:Maintenance) WHERE m.status = 'Pending' }"
        )

        candidates_result = session.run(rule['query'])
        candidates = [dict(r) for r in candidates_result]

        trace.steps[-1]['resultSummary'] = f"{len(candidates)}개 설비가 유지보수 필요"
        trace.steps[-1]['dataCount'] = len(candidates)
        trace.steps[-1]['data'] = candidates

        if not candidates:
            trace.add_step(
                step_type="RESULT",
                description="추론 불필요",
                description_detail="모든 대상 설비에 이미 유지보수가 예정되어 있습니다.",
                result_summary="추론 대상 없음"
            )
            trace.complete("NO_MATCH", 0)
            return

        # Step 5: 추론 실행
        trace.add_step(
            step_type="INFERENCE",
            description="유지보수 노드 생성",
            description_detail="조건을 충족하는 설비에 대해 새로운 Maintenance 노드를 생성하고 NEEDS_MAINTENANCE 관계를 추가합니다."
        )

        inferred_items = []
        for candidate in candidates:
            try:
                action_result = session.run(rule['action_query'], candidate)
                action_record = action_result.single()
                if action_record:
                    inferred_item = dict(action_record)
                    inferred_items.append(inferred_item)

                    # 추론 결과에 대한 증거 추가
                    trace.add_evidence(
                        evidence_type="RELATIONSHIP",
                        node_id=candidate['equipmentId'],
                        label="NEEDS_MAINTENANCE",
                        property_name="isInferred",
                        property_value=True,
                        description=f"설비 '{candidate['name']}'에 유지보수 관계가 추가되었습니다"
                    )
            except Exception as e:
                print(f"Error applying rule: {e}")

        trace.steps[-1]['resultSummary'] = f"{len(inferred_items)}개의 유지보수 노드 생성됨"
        trace.steps[-1]['dataCount'] = len(inferred_items)
        trace.steps[-1]['data'] = inferred_items

        # 완료
        trace.complete("SUCCESS", len(inferred_items), inferred_items)

    @classmethod
    def _trace_anomaly_rule(cls, session, rule, trace: ReasoningTrace):
        """이상 탐지 규칙 추론 과정 추적"""

        # Step 1: 센서-설비 관계 검색
        trace.add_step(
            step_type="MATCH",
            description="센서-설비 관계 검색",
            description_detail="설비에 연결된 센서 노드를 검색합니다.",
            query="MATCH (e:Equipment)-[:HAS_SENSOR]->(s:Sensor)"
        )

        sensors_result = session.run('''
            MATCH (e:Equipment)-[:HAS_SENSOR]->(s:Sensor)
            RETURN s.sensorId AS sensorId, s.type AS sensorType,
                   e.equipmentId AS equipmentId, e.name AS equipmentName
        ''')
        sensors = [dict(r) for r in sensors_result]

        trace.steps[-1]['resultSummary'] = f"총 {len(sensors)}개의 센서-설비 관계 발견"
        trace.steps[-1]['dataCount'] = len(sensors)
        trace.steps[-1]['data'] = sensors[:5]

        # Step 2: 최근 측정값 검색
        trace.add_step(
            step_type="MATCH",
            description="최근 24시간 측정값 검색",
            description_detail="최근 24시간 이내의 센서 측정값(Observation)을 검색합니다.",
            query="MATCH (o:Observation)-[:OBSERVED_BY]->(s) WHERE o.timestamp > datetime() - duration('P1D')"
        )

        observations_result = session.run('''
            MATCH (e:Equipment)-[:HAS_SENSOR]->(s:Sensor)
            MATCH (o:Observation)-[:OBSERVED_BY]->(s)
            WHERE o.timestamp > datetime() - duration('P1D')
            RETURN s.sensorId AS sensorId, s.type AS sensorType,
                   o.value AS value, o.timestamp AS timestamp
            LIMIT 20
        ''')
        observations = [dict(r) for r in observations_result]

        trace.steps[-1]['resultSummary'] = f"최근 24시간 내 측정값 {len(observations)}개 발견"
        trace.steps[-1]['dataCount'] = len(observations)
        trace.steps[-1]['data'] = observations[:5]

        # Step 3: 이상값 필터링
        trace.add_step(
            step_type="FILTER",
            description="이상값 필터링",
            description_detail="센서 유형별 정상 범위를 벗어난 값을 필터링합니다.\n- 압력(Pressure): 1~10\n- 온도(Temperature): 10~50\n- 전도도(Conductivity): < 15\n- 진동(Vibration): < 8"
        )

        candidates_result = session.run(rule['query'])
        candidates = [dict(r) for r in candidates_result]

        for c in candidates:
            trace.add_evidence(
                evidence_type="PROPERTY",
                node_id=c['sensorId'],
                label="Observation",
                property_name="value",
                property_value=c['value'],
                description=f"센서 '{c['sensorId']}'의 {c['sensorType']} 측정값 {c['value']}이(가) 정상 범위를 벗어남"
            )

        trace.steps[-1]['resultSummary'] = f"{len(candidates)}개의 이상값 탐지됨"
        trace.steps[-1]['dataCount'] = len(candidates)
        trace.steps[-1]['data'] = candidates

        if not candidates:
            trace.complete("NO_MATCH", 0)
            return

        # Step 4: 추론 실행
        trace.add_step(
            step_type="INFERENCE",
            description="이상 노드 생성",
            description_detail="탐지된 이상에 대해 Anomaly 노드를 생성하고 HAS_ANOMALY 관계를 추가합니다."
        )

        inferred_items = []
        for candidate in candidates:
            try:
                action_result = session.run(rule['action_query'], candidate)
                action_record = action_result.single()
                if action_record:
                    inferred_items.append(dict(action_record))
            except Exception as e:
                print(f"Error: {e}")

        trace.steps[-1]['resultSummary'] = f"{len(inferred_items)}개의 이상 노드 생성됨"
        trace.steps[-1]['dataCount'] = len(inferred_items)
        trace.steps[-1]['data'] = inferred_items

        trace.complete("SUCCESS", len(inferred_items), inferred_items)

    @classmethod
    def _trace_failure_prediction_rule(cls, session, rule, trace: ReasoningTrace):
        """고장 예측 규칙 추론 과정 추적"""

        # Step 1: 관련 센서 검색
        trace.add_step(
            step_type="MATCH",
            description="예측 대상 센서 검색",
            description_detail="진동(Vibration), 온도(Temperature), 압력(Pressure) 센서를 검색합니다. 이 센서들은 장비 고장의 선행 지표입니다.",
            query="MATCH (e:Equipment)-[:HAS_SENSOR]->(s:Sensor) WHERE s.type IN ['Vibration', 'VibrationSensor', 'Temperature', 'TemperatureSensor', 'Pressure', 'PressureSensor']"
        )

        sensors_result = session.run('''
            MATCH (e:Equipment)-[:HAS_SENSOR]->(s:Sensor)
            WHERE s.type IN ['Vibration', 'VibrationSensor', 'Temperature', 'TemperatureSensor', 'Pressure', 'PressureSensor']
            RETURN e.equipmentId AS equipmentId, e.name AS equipmentName,
                   s.sensorId AS sensorId, s.type AS sensorType
        ''')
        sensors = [dict(r) for r in sensors_result]

        trace.steps[-1]['resultSummary'] = f"{len(sensors)}개의 예측 대상 센서 발견"
        trace.steps[-1]['dataCount'] = len(sensors)
        trace.steps[-1]['data'] = sensors[:5]

        # Step 2: 7일간 측정값 트렌드 분석
        trace.add_step(
            step_type="FILTER",
            description="측정값 트렌드 분석",
            description_detail="최근 7일간의 측정값을 분석하여 최신 값이 평균의 130%를 초과하는 경우를 찾습니다. 이는 장비 상태 악화의 징후입니다.",
            query="WHERE latestValue > avgValue * 1.3"
        )

        candidates_result = session.run(rule['query'])
        candidates = [dict(r) for r in candidates_result]

        for c in candidates:
            trace.add_evidence(
                evidence_type="PROPERTY",
                node_id=c['equipmentId'],
                label="Sensor",
                property_name="trend",
                property_value=f"avg: {c.get('avgValue', 'N/A')}, latest: {c.get('latestValue', 'N/A')}",
                description=f"설비 '{c['name']}'의 {c['sensorType']} 센서 값이 평균 대비 130% 초과"
            )

        trace.steps[-1]['resultSummary'] = f"{len(candidates)}개의 잠재적 고장 징후 발견"
        trace.steps[-1]['dataCount'] = len(candidates)
        trace.steps[-1]['data'] = candidates

        if not candidates:
            trace.complete("NO_MATCH", 0)
            return

        # Step 3: 추론 실행
        trace.add_step(
            step_type="INFERENCE",
            description="고장 예측 노드 생성",
            description_detail="고장 징후가 발견된 설비에 FailurePrediction 노드를 생성하고 MAY_FAIL 관계를 추가합니다."
        )

        inferred_items = []
        for candidate in candidates:
            try:
                action_result = session.run(rule['action_query'], candidate)
                action_record = action_result.single()
                if action_record:
                    inferred_items.append(dict(action_record))
            except Exception as e:
                print(f"Error: {e}")

        trace.steps[-1]['resultSummary'] = f"{len(inferred_items)}개의 고장 예측 생성됨"
        trace.steps[-1]['dataCount'] = len(inferred_items)
        trace.steps[-1]['data'] = inferred_items

        trace.complete("SUCCESS", len(inferred_items), inferred_items)

    @classmethod
    def _trace_equipment_dependency_rule(cls, session, rule, trace: ReasoningTrace):
        """설비 의존성 규칙 추론 과정 추적"""

        # Step 1: 공정 영역 검색
        trace.add_step(
            step_type="MATCH",
            description="공정 영역 검색",
            description_detail="공정 영역(ProcessArea)과 포함된 설비를 검색합니다.",
            query="MATCH (e:Equipment)-[:LOCATED_IN]->(a:ProcessArea)"
        )

        areas_result = session.run('''
            MATCH (e:Equipment)-[:LOCATED_IN]->(a:ProcessArea)
            RETURN a.name AS areaName, collect(e.name) AS equipment
        ''')
        areas = [dict(r) for r in areas_result]

        trace.steps[-1]['resultSummary'] = f"{len(areas)}개의 공정 영역 발견"
        trace.steps[-1]['dataCount'] = len(areas)
        trace.steps[-1]['data'] = areas

        # Step 2: 관련 설비 유형 필터링
        trace.add_step(
            step_type="FILTER",
            description="의존성 후보 설비 필터링",
            description_detail="RO/EDI 설비와 UV살균기/저장탱크 간의 잠재적 의존성을 검색합니다. 이들은 UPW 공정에서 순차적으로 연결됩니다.",
            query="WHERE e1.type IN ['ReverseOsmosis', 'Electrodeionization'] AND e2.type IN ['UVSterilizer', 'StorageTank']"
        )

        candidates_result = session.run(rule['query'])
        candidates = [dict(r) for r in candidates_result]

        for c in candidates:
            trace.add_evidence(
                evidence_type="RELATIONSHIP",
                node_id=c['sourceId'],
                label="potential_FEEDS_INTO",
                property_name="target",
                property_value=c['targetId'],
                description=f"'{c['sourceName']}'에서 '{c['targetName']}'으로의 공정 흐름이 추론됨"
            )

        trace.steps[-1]['resultSummary'] = f"{len(candidates)}개의 의존성 후보 발견"
        trace.steps[-1]['dataCount'] = len(candidates)
        trace.steps[-1]['data'] = candidates

        if not candidates:
            trace.complete("NO_MATCH", 0)
            return

        # Step 3: 추론 실행
        trace.add_step(
            step_type="INFERENCE",
            description="FEEDS_INTO 관계 생성",
            description_detail="추론된 공정 흐름에 따라 설비 간 FEEDS_INTO 관계를 생성합니다."
        )

        inferred_items = []
        for candidate in candidates:
            try:
                action_result = session.run(rule['action_query'], candidate)
                action_record = action_result.single()
                if action_record:
                    inferred_items.append(dict(action_record))
            except Exception as e:
                print(f"Error: {e}")

        trace.steps[-1]['resultSummary'] = f"{len(inferred_items)}개의 의존성 관계 생성됨"
        trace.steps[-1]['dataCount'] = len(inferred_items)
        trace.steps[-1]['data'] = inferred_items

        trace.complete("SUCCESS", len(inferred_items), inferred_items)

    @classmethod
    def _trace_sensor_correlation_rule(cls, session, rule, trace: ReasoningTrace):
        """센서 상관관계 규칙 추론 과정 추적"""

        # Step 1: 동일 설비의 센서 검색
        trace.add_step(
            step_type="MATCH",
            description="설비별 센서 검색",
            description_detail="동일 설비에 연결된 압력(Pressure)과 유량(Flow) 센서를 검색합니다.",
            query="MATCH (e:Equipment)-[:HAS_SENSOR]->(s:Sensor)"
        )

        sensors_result = session.run('''
            MATCH (e:Equipment)-[:HAS_SENSOR]->(s:Sensor)
            WHERE s.type IN ['Pressure', 'PressureSensor', 'Flow', 'FlowSensor']
            RETURN e.equipmentId AS equipmentId, e.name AS equipmentName,
                   s.sensorId AS sensorId, s.type AS sensorType
        ''')
        sensors = [dict(r) for r in sensors_result]

        trace.steps[-1]['resultSummary'] = f"{len(sensors)}개의 압력/유량 센서 발견"
        trace.steps[-1]['dataCount'] = len(sensors)
        trace.steps[-1]['data'] = sensors[:5]

        # Step 2: 상관관계 후보 필터링
        trace.add_step(
            step_type="FILTER",
            description="상관관계 후보 검색",
            description_detail="압력과 유량은 물리적으로 상관관계가 있습니다. 동일 설비 내에서 이 두 센서 간의 관계를 찾습니다.",
            query="WHERE s1.type IN ['Pressure', 'PressureSensor'] AND s2.type IN ['Flow', 'FlowSensor']"
        )

        candidates_result = session.run(rule['query'])
        candidates = [dict(r) for r in candidates_result]

        for c in candidates:
            trace.add_evidence(
                evidence_type="RELATIONSHIP",
                node_id=c['sensor1Id'],
                label="potential_CORRELATES_WITH",
                property_name="correlationType",
                property_value="Pressure-Flow",
                description=f"'{c['sensor1Name']}'과 '{c['sensor2Name']}'은 물리적 상관관계가 있습니다"
            )

        trace.steps[-1]['resultSummary'] = f"{len(candidates)}개의 상관관계 후보 발견"
        trace.steps[-1]['dataCount'] = len(candidates)
        trace.steps[-1]['data'] = candidates

        if not candidates:
            trace.complete("NO_MATCH", 0)
            return

        # Step 3: 추론 실행
        trace.add_step(
            step_type="INFERENCE",
            description="CORRELATES_WITH 관계 생성",
            description_detail="물리적 상관관계가 있는 센서 간에 CORRELATES_WITH 관계를 생성합니다."
        )

        inferred_items = []
        for candidate in candidates:
            try:
                action_result = session.run(rule['action_query'], candidate)
                action_record = action_result.single()
                if action_record:
                    inferred_items.append(dict(action_record))
            except Exception as e:
                print(f"Error: {e}")

        trace.steps[-1]['resultSummary'] = f"{len(inferred_items)}개의 상관관계 생성됨"
        trace.steps[-1]['dataCount'] = len(inferred_items)
        trace.steps[-1]['data'] = inferred_items

        trace.complete("SUCCESS", len(inferred_items), inferred_items)

    @classmethod
    def _trace_generic_rule(cls, session, rule, trace: ReasoningTrace):
        """일반 규칙 추론 과정 추적"""

        # Step 1: 후보 검색
        trace.add_step(
            step_type="MATCH",
            description="추론 후보 검색",
            description_detail=rule.get('condition', '조건에 맞는 노드를 검색합니다.'),
            query=rule['query']
        )

        candidates_result = session.run(rule['query'])
        candidates = [dict(r) for r in candidates_result]

        trace.steps[-1]['resultSummary'] = f"{len(candidates)}개의 후보 발견"
        trace.steps[-1]['dataCount'] = len(candidates)
        trace.steps[-1]['data'] = candidates

        if not candidates:
            trace.complete("NO_MATCH", 0)
            return

        # Step 2: 추론 실행
        trace.add_step(
            step_type="INFERENCE",
            description="추론 실행",
            description_detail=rule.get('inference', '규칙에 따라 새로운 지식을 생성합니다.')
        )

        inferred_items = []
        for candidate in candidates:
            try:
                action_result = session.run(rule['action_query'], candidate)
                action_record = action_result.single()
                if action_record:
                    inferred_items.append(dict(action_record))
            except Exception as e:
                print(f"Error: {e}")

        trace.steps[-1]['resultSummary'] = f"{len(inferred_items)}개 추론됨"
        trace.steps[-1]['dataCount'] = len(inferred_items)
        trace.steps[-1]['data'] = inferred_items

        trace.complete("SUCCESS", len(inferred_items), inferred_items)
