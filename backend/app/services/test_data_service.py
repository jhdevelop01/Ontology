"""
Test Data Service for UPW Ontology

이 서비스는 추론 규칙 테스트를 위한 시나리오 데이터를 생성합니다.
각 시나리오는 특정 추론 규칙을 트리거하도록 설계되었습니다.
"""

from typing import List, Dict, Any, Optional
from flask import current_app
from datetime import datetime, timedelta
import random

from .neo4j_service import Neo4jService


class TestDataService:
    """테스트 시나리오 데이터 서비스"""

    # 시나리오 정의
    SCENARIOS = [
        {
            'id': 'scenario_a',
            'name': '시나리오 A: 노후 설비 유지보수',
            'description': '장기 운영으로 인한 설비 성능 저하 - 유지보수 필요 규칙 트리거',
            'targetRule': 'rule_maintenance_needed',
            'expectedResult': '3개 Maintenance 노드 생성'
        },
        {
            'id': 'scenario_b',
            'name': '시나리오 B: 센서 이상값 탐지',
            'description': '다양한 센서에서 비정상 값 감지 - 이상 탐지 규칙 트리거',
            'targetRule': 'rule_anomaly_from_sensor',
            'expectedResult': '4개 Anomaly 노드 생성'
        },
        {
            'id': 'scenario_c',
            'name': '시나리오 C: 진동 증가 고장 예측',
            'description': '펌프 진동이 7일간 점진적 증가 - 고장 예측 규칙 트리거',
            'targetRule': 'rule_failure_prediction',
            'expectedResult': '1개 FailurePrediction 노드 생성'
        },
        {
            'id': 'scenario_d',
            'name': '시나리오 D: 신규 설비 공정 흐름',
            'description': '새로 설치된 EDI-UV 라인의 공정 연결 추론 - 설비 의존성 규칙 트리거',
            'targetRule': 'rule_equipment_dependency',
            'expectedResult': '1개 FEEDS_INTO 관계 생성'
        },
        {
            'id': 'scenario_e',
            'name': '시나리오 E: 압력-유량 상관관계',
            'description': '동일 설비의 압력과 유량 센서 간 물리적 상관관계 - 센서 상관관계 규칙 트리거',
            'targetRule': 'rule_sensor_correlation',
            'expectedResult': '2개 CORRELATES_WITH 관계 생성'
        }
    ]

    # 원본 데이터 백업 (복원용)
    ORIGINAL_HEALTH_SCORES = {
        'RO-001': {'healthScore': 85.5, 'healthStatus': 'Normal'},
        'UV-001': {'healthScore': 72.5, 'healthStatus': 'Normal'},
        'PUMP-001': {'healthScore': 90.0, 'healthStatus': 'Normal'}
    }

    @classmethod
    def get_scenarios(cls) -> List[Dict[str, Any]]:
        """모든 시나리오 목록 반환"""
        return cls.SCENARIOS

    @classmethod
    def get_scenario_status(cls) -> Dict[str, Any]:
        """현재 시나리오 데이터 상태 조회"""
        try:
            with Neo4jService.session() as session:
                status = {
                    'scenarios': [],
                    'dataStatus': {}
                }

                # 시나리오 A 상태: 저건강 설비 확인
                low_health = session.run('''
                    MATCH (e:Equipment)
                    WHERE e.healthScore < 60
                    RETURN count(e) AS count
                ''').single()['count']
                status['dataStatus']['lowHealthEquipment'] = low_health

                # 시나리오 B 상태: 이상 관측값 확인
                anomaly_obs = session.run('''
                    MATCH (o:Observation)
                    WHERE o.isTestData = true
                    RETURN count(o) AS count
                ''').single()['count']
                status['dataStatus']['anomalyObservations'] = anomaly_obs

                # 시나리오 C 상태: 트렌딩 관측값 확인
                trending_obs = session.run('''
                    MATCH (o:Observation)
                    WHERE o.isTrendingData = true
                    RETURN count(o) AS count
                ''').single()['count']
                status['dataStatus']['trendingObservations'] = trending_obs

                # 시나리오 D 상태: 테스트 설비 확인
                test_equipment = session.run('''
                    MATCH (e:Equipment)
                    WHERE e.isTestData = true
                    RETURN count(e) AS count
                ''').single()['count']
                status['dataStatus']['testEquipment'] = test_equipment

                # 시나리오 E 상태: Flow 센서 확인
                flow_sensors = session.run('''
                    MATCH (s:Sensor)
                    WHERE s.isTestData = true AND s.type = 'Flow'
                    RETURN count(s) AS count
                ''').single()['count']
                status['dataStatus']['flowSensors'] = flow_sensors

                # 추론된 데이터 수
                inferred_nodes = session.run('''
                    MATCH (n:Inferred)
                    RETURN count(n) AS count
                ''').single()['count']
                status['dataStatus']['inferredNodes'] = inferred_nodes

                inferred_rels = session.run('''
                    MATCH ()-[r]->()
                    WHERE r.isInferred = true
                    RETURN count(r) AS count
                ''').single()['count']
                status['dataStatus']['inferredRelationships'] = inferred_rels

                # 각 시나리오 상태 판단
                for scenario in cls.SCENARIOS:
                    scenario_status = {
                        'id': scenario['id'],
                        'name': scenario['name'],
                        'loaded': False
                    }

                    if scenario['id'] == 'scenario_a':
                        scenario_status['loaded'] = low_health >= 3
                    elif scenario['id'] == 'scenario_b':
                        scenario_status['loaded'] = anomaly_obs >= 4
                    elif scenario['id'] == 'scenario_c':
                        scenario_status['loaded'] = trending_obs >= 11
                    elif scenario['id'] == 'scenario_d':
                        scenario_status['loaded'] = test_equipment >= 2
                    elif scenario['id'] == 'scenario_e':
                        scenario_status['loaded'] = flow_sensors >= 2

                    status['scenarios'].append(scenario_status)

                return {'status': 'success', 'data': status}

        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @classmethod
    def load_all_scenarios(cls) -> Dict[str, Any]:
        """모든 시나리오 데이터 로드"""
        results = []

        # 먼저 기존 추론 결과 삭제
        cls.clear_inferred_data()

        # 각 시나리오 로드
        results.append(cls.load_scenario_a())
        results.append(cls.load_scenario_b())
        results.append(cls.load_scenario_c())
        results.append(cls.load_scenario_d())
        results.append(cls.load_scenario_e())

        return {
            'status': 'success',
            'message': '모든 테스트 시나리오가 로드되었습니다.',
            'results': results
        }

    @classmethod
    def load_scenario(cls, scenario_id: str) -> Dict[str, Any]:
        """특정 시나리오 데이터 로드"""
        if scenario_id == 'scenario_a':
            return cls.load_scenario_a()
        elif scenario_id == 'scenario_b':
            return cls.load_scenario_b()
        elif scenario_id == 'scenario_c':
            return cls.load_scenario_c()
        elif scenario_id == 'scenario_d':
            return cls.load_scenario_d()
        elif scenario_id == 'scenario_e':
            return cls.load_scenario_e()
        else:
            return {'status': 'error', 'message': f'알 수 없는 시나리오: {scenario_id}'}

    @classmethod
    def load_scenario_a(cls) -> Dict[str, Any]:
        """
        시나리오 A: 노후 설비 유지보수 필요
        - RO-001: healthScore 52 (중간 저하)
        - UV-001: healthScore 38 (심각 저하)
        - PUMP-001: healthScore 58 (경미 저하)
        """
        try:
            with Neo4jService.session() as session:
                # RO-001 건강 점수 저하
                session.run('''
                    MATCH (e:Equipment {equipmentId: "RO-001"})
                    SET e.healthScore = 52, e.healthStatus = "Warning"
                ''')

                # UV-001 건강 점수 심각 저하
                session.run('''
                    MATCH (e:Equipment {equipmentId: "UV-001"})
                    SET e.healthScore = 38, e.healthStatus = "Warning"
                ''')

                # PUMP-001 건강 점수 경미 저하
                session.run('''
                    MATCH (e:Equipment {equipmentId: "PUMP-001"})
                    SET e.healthScore = 58, e.healthStatus = "Warning"
                ''')

                return {
                    'scenario': 'scenario_a',
                    'name': '시나리오 A: 노후 설비 유지보수',
                    'status': 'success',
                    'message': '3개 설비의 건강 점수가 저하되었습니다.',
                    'data': [
                        {'equipmentId': 'RO-001', 'healthScore': 52, 'healthStatus': 'Warning'},
                        {'equipmentId': 'UV-001', 'healthScore': 38, 'healthStatus': 'Warning'},
                        {'equipmentId': 'PUMP-001', 'healthScore': 58, 'healthStatus': 'Warning'}
                    ]
                }

        except Exception as e:
            return {'scenario': 'scenario_a', 'status': 'error', 'message': str(e)}

    @classmethod
    def load_scenario_b(cls) -> Dict[str, Any]:
        """
        시나리오 B: 센서 이상값 탐지
        - 압력 이상: 18.5 bar (정상: 1~10)
        - 온도 이상: 58°C (정상: 10~50)
        - 전도도 이상: 22 μS/cm (정상: <15)
        - 진동 이상: 12.8 mm/s (정상: <8)
        """
        try:
            with Neo4jService.session() as session:
                now = datetime.now().isoformat()

                # 압력 이상 관측값 (RO-001-PS-IN)
                session.run('''
                    MATCH (s:Sensor {sensorId: "RO-001-PS-IN"})
                    CREATE (o:Observation {
                        timestamp: datetime($now),
                        value: 18.5,
                        unit: "bar",
                        quality: "Good",
                        isTestData: true
                    })
                    CREATE (o)-[:OBSERVED_BY]->(s)
                ''', now=now)

                # 온도 센서 생성 및 이상 관측값 (HP-001-TS)
                session.run('''
                    MATCH (e:Equipment {equipmentId: "HP-001"})
                    MERGE (s:Sensor {sensorId: "HP-001-TS"})
                    ON CREATE SET s.name = "고압펌프 온도센서",
                                  s.type = "Temperature",
                                  s.unit = "°C",
                                  s.isTestData = true
                    MERGE (e)-[:HAS_SENSOR]->(s)
                    WITH s
                    CREATE (o:Observation {
                        timestamp: datetime($now),
                        value: 58.2,
                        unit: "°C",
                        quality: "Good",
                        isTestData: true
                    })
                    CREATE (o)-[:OBSERVED_BY]->(s)
                ''', now=now)

                # 전도도 센서 생성 및 이상 관측값 (EDI-001-CS)
                session.run('''
                    MATCH (e:Equipment {equipmentId: "EDI-001"})
                    MERGE (s:Sensor {sensorId: "EDI-001-CS"})
                    ON CREATE SET s.name = "EDI 전도도센서",
                                  s.type = "Conductivity",
                                  s.unit = "μS/cm",
                                  s.isTestData = true
                    MERGE (e)-[:HAS_SENSOR]->(s)
                    WITH s
                    CREATE (o:Observation {
                        timestamp: datetime($now),
                        value: 22.5,
                        unit: "μS/cm",
                        quality: "Good",
                        isTestData: true
                    })
                    CREATE (o)-[:OBSERVED_BY]->(s)
                ''', now=now)

                # 진동 센서 생성 및 이상 관측값 (PUMP-001-VBS)
                session.run('''
                    MATCH (e:Equipment {equipmentId: "PUMP-001"})
                    MERGE (s:Sensor {sensorId: "PUMP-001-VBS"})
                    ON CREATE SET s.name = "공급펌프 진동센서",
                                  s.type = "Vibration",
                                  s.unit = "mm/s",
                                  s.isTestData = true
                    MERGE (e)-[:HAS_SENSOR]->(s)
                    WITH s
                    CREATE (o:Observation {
                        timestamp: datetime($now),
                        value: 12.8,
                        unit: "mm/s",
                        quality: "Good",
                        isTestData: true
                    })
                    CREATE (o)-[:OBSERVED_BY]->(s)
                ''', now=now)

                return {
                    'scenario': 'scenario_b',
                    'name': '시나리오 B: 센서 이상값 탐지',
                    'status': 'success',
                    'message': '4개의 이상 관측값이 생성되었습니다.',
                    'data': [
                        {'sensorId': 'RO-001-PS-IN', 'type': 'Pressure', 'value': 18.5, 'unit': 'bar'},
                        {'sensorId': 'HP-001-TS', 'type': 'Temperature', 'value': 58.2, 'unit': '°C'},
                        {'sensorId': 'EDI-001-CS', 'type': 'Conductivity', 'value': 22.5, 'unit': 'μS/cm'},
                        {'sensorId': 'PUMP-001-VBS', 'type': 'Vibration', 'value': 12.8, 'unit': 'mm/s'}
                    ]
                }

        except Exception as e:
            return {'scenario': 'scenario_b', 'status': 'error', 'message': str(e)}

    @classmethod
    def load_scenario_c(cls) -> Dict[str, Any]:
        """
        시나리오 C: 진동 증가 패턴으로 고장 예측
        - PUMP-001 진동: 4.0 → 4.2 → 4.5 → 5.0 → 5.5 → 6.0 → 6.5 mm/s (7일간 11개)
        - 평균: ~5.0, 최신: 6.5 (130%)
        """
        try:
            with Neo4jService.session() as session:
                # 진동 센서 확보
                session.run('''
                    MATCH (e:Equipment {equipmentId: "PUMP-001"})
                    MERGE (s:Sensor {sensorId: "PUMP-001-VBS"})
                    ON CREATE SET s.name = "공급펌프 진동센서",
                                  s.type = "Vibration",
                                  s.unit = "mm/s"
                    MERGE (e)-[:HAS_SENSOR]->(s)
                ''')

                # 7일간 점진적 증가 패턴 (11개 관측값)
                values = [4.0, 4.2, 4.3, 4.5, 4.8, 5.0, 5.3, 5.6, 5.9, 6.2, 6.5]

                for i, value in enumerate(values):
                    # 7일 전부터 현재까지 분포
                    hours_ago = (len(values) - 1 - i) * 15  # 15시간 간격
                    timestamp = (datetime.now() - timedelta(hours=hours_ago)).isoformat()

                    session.run('''
                        MATCH (s:Sensor {sensorId: "PUMP-001-VBS"})
                        CREATE (o:Observation {
                            timestamp: datetime($timestamp),
                            value: $value,
                            unit: "mm/s",
                            quality: "Good",
                            isTrendingData: true
                        })
                        CREATE (o)-[:OBSERVED_BY]->(s)
                    ''', timestamp=timestamp, value=value)

                return {
                    'scenario': 'scenario_c',
                    'name': '시나리오 C: 진동 증가 고장 예측',
                    'status': 'success',
                    'message': f'11개의 트렌딩 관측값이 생성되었습니다. (평균: {sum(values)/len(values):.1f}, 최신: {values[-1]})',
                    'data': {
                        'sensorId': 'PUMP-001-VBS',
                        'values': values,
                        'average': sum(values) / len(values),
                        'latest': values[-1],
                        'ratio': values[-1] / (sum(values) / len(values))
                    }
                }

        except Exception as e:
            return {'scenario': 'scenario_c', 'status': 'error', 'message': str(e)}

    @classmethod
    def load_scenario_d(cls) -> Dict[str, Any]:
        """
        시나리오 D: 신규 설비 공정 흐름 추론
        - EDI-002 (신규): Electrodeionization
        - UV-002 (신규): UVSterilizer
        - 동일 공정영역: AREA-POLISH
        """
        try:
            with Neo4jService.session() as session:
                # 공정영역 확보
                session.run('''
                    MERGE (a:ProcessArea {areaId: "AREA-POLISH"})
                    ON CREATE SET a.name = "정밀처리 영역",
                                  a.nameEn = "Polishing Area"
                ''')

                # EDI-002 생성
                session.run('''
                    MERGE (e:Equipment {equipmentId: "EDI-002"})
                    ON CREATE SET e.name = "전기탈이온 장치 B",
                                  e.nameEn = "EDI Unit B",
                                  e.type = "Electrodeionization",
                                  e.category = "Polishing",
                                  e.healthScore = 95.0,
                                  e.healthStatus = "Normal",
                                  e.status = "Running",
                                  e.isTestData = true
                    WITH e
                    MATCH (a:ProcessArea {areaId: "AREA-POLISH"})
                    MERGE (e)-[:LOCATED_IN]->(a)
                ''')

                # UV-002 생성
                session.run('''
                    MERGE (e:Equipment {equipmentId: "UV-002"})
                    ON CREATE SET e.name = "UV 살균기 B",
                                  e.nameEn = "UV Sterilizer B",
                                  e.type = "UVSterilizer",
                                  e.category = "Polishing",
                                  e.healthScore = 92.0,
                                  e.healthStatus = "Normal",
                                  e.status = "Running",
                                  e.isTestData = true
                    WITH e
                    MATCH (a:ProcessArea {areaId: "AREA-POLISH"})
                    MERGE (e)-[:LOCATED_IN]->(a)
                ''')

                return {
                    'scenario': 'scenario_d',
                    'name': '시나리오 D: 신규 설비 공정 흐름',
                    'status': 'success',
                    'message': '2개의 신규 설비가 생성되었습니다.',
                    'data': [
                        {'equipmentId': 'EDI-002', 'type': 'Electrodeionization', 'area': 'AREA-POLISH'},
                        {'equipmentId': 'UV-002', 'type': 'UVSterilizer', 'area': 'AREA-POLISH'}
                    ]
                }

        except Exception as e:
            return {'scenario': 'scenario_d', 'status': 'error', 'message': str(e)}

    @classmethod
    def load_scenario_e(cls) -> Dict[str, Any]:
        """
        시나리오 E: 압력-유량 센서 상관관계
        - RO-002: 기존 Pressure 센서 + 신규 Flow 센서
        - HP-001: Pressure 센서 + 신규 Flow 센서
        """
        try:
            with Neo4jService.session() as session:
                # RO-002 Pressure 센서 확보
                session.run('''
                    MATCH (e:Equipment {equipmentId: "RO-002"})
                    MERGE (s:Sensor {sensorId: "RO-002-PS-IN"})
                    ON CREATE SET s.name = "2차 RO 입력 압력센서",
                                  s.type = "Pressure",
                                  s.unit = "bar"
                    MERGE (e)-[:HAS_SENSOR]->(s)
                ''')

                # RO-002 Flow 센서 추가
                session.run('''
                    MATCH (e:Equipment {equipmentId: "RO-002"})
                    MERGE (s:Sensor {sensorId: "RO-002-FS"})
                    ON CREATE SET s.name = "2차 RO 유량센서",
                                  s.type = "Flow",
                                  s.unit = "m³/h",
                                  s.isTestData = true
                    MERGE (e)-[:HAS_SENSOR]->(s)
                ''')

                # HP-001 Pressure 센서 확보
                session.run('''
                    MATCH (e:Equipment {equipmentId: "HP-001"})
                    MERGE (s:Sensor {sensorId: "HP-001-PS-OUT"})
                    ON CREATE SET s.name = "고압펌프 출력 압력센서",
                                  s.type = "Pressure",
                                  s.unit = "bar"
                    MERGE (e)-[:HAS_SENSOR]->(s)
                ''')

                # HP-001 Flow 센서 추가
                session.run('''
                    MATCH (e:Equipment {equipmentId: "HP-001"})
                    MERGE (s:Sensor {sensorId: "HP-001-FS"})
                    ON CREATE SET s.name = "고압펌프 유량센서",
                                  s.type = "Flow",
                                  s.unit = "m³/h",
                                  s.isTestData = true
                    MERGE (e)-[:HAS_SENSOR]->(s)
                ''')

                return {
                    'scenario': 'scenario_e',
                    'name': '시나리오 E: 압력-유량 상관관계',
                    'status': 'success',
                    'message': '2개의 Flow 센서가 추가되었습니다.',
                    'data': [
                        {'equipmentId': 'RO-002', 'pressureSensor': 'RO-002-PS-IN', 'flowSensor': 'RO-002-FS'},
                        {'equipmentId': 'HP-001', 'pressureSensor': 'HP-001-PS-OUT', 'flowSensor': 'HP-001-FS'}
                    ]
                }

        except Exception as e:
            return {'scenario': 'scenario_e', 'status': 'error', 'message': str(e)}

    @classmethod
    def reset_test_data(cls) -> Dict[str, Any]:
        """테스트 데이터를 원래 상태로 복원"""
        try:
            with Neo4jService.session() as session:
                # 1. 추론 결과 삭제
                session.run('MATCH (n:Inferred) DETACH DELETE n')
                session.run('MATCH ()-[r]->() WHERE r.isInferred = true DELETE r')

                # 2. 테스트 관측값 삭제
                session.run('MATCH (o:Observation) WHERE o.isTestData = true DETACH DELETE o')
                session.run('MATCH (o:Observation) WHERE o.isTrendingData = true DETACH DELETE o')

                # 3. 테스트 센서 삭제
                session.run('MATCH (s:Sensor) WHERE s.isTestData = true DETACH DELETE s')

                # 4. 테스트 설비 삭제
                session.run('MATCH (e:Equipment) WHERE e.isTestData = true DETACH DELETE e')

                # 5. 건강 점수 복원
                for equip_id, values in cls.ORIGINAL_HEALTH_SCORES.items():
                    session.run('''
                        MATCH (e:Equipment {equipmentId: $equipmentId})
                        SET e.healthScore = $healthScore, e.healthStatus = $healthStatus
                    ''', equipmentId=equip_id, healthScore=values['healthScore'],
                        healthStatus=values['healthStatus'])

                return {
                    'status': 'success',
                    'message': '테스트 데이터가 초기화되었습니다.'
                }

        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @classmethod
    def clear_inferred_data(cls) -> Dict[str, Any]:
        """추론된 데이터만 삭제"""
        try:
            with Neo4jService.session() as session:
                # 추론 노드 삭제
                nodes_result = session.run('''
                    MATCH (n:Inferred)
                    WITH count(n) AS nodeCount
                    MATCH (n:Inferred) DETACH DELETE n
                    RETURN nodeCount
                ''')
                node_count = nodes_result.single()['nodeCount']

                # 추론 관계 삭제
                rels_result = session.run('''
                    MATCH ()-[r]->()
                    WHERE r.isInferred = true
                    WITH count(r) AS relCount
                    MATCH ()-[r]->()
                    WHERE r.isInferred = true
                    DELETE r
                    RETURN relCount
                ''')
                rel_count = rels_result.single()['relCount']

                return {
                    'status': 'success',
                    'message': f'추론 결과가 삭제되었습니다. (노드: {node_count}, 관계: {rel_count})',
                    'deletedNodes': node_count,
                    'deletedRelationships': rel_count
                }

        except Exception as e:
            return {'status': 'error', 'message': str(e)}
