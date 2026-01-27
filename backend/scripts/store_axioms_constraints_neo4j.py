"""
Script to store Axioms and Constraints as nodes in Neo4j

이 스크립트는 Python 코드에 정의된 공리(Axioms)와 제약조건(Constraints)을
Neo4j 데이터베이스에 노드로 저장합니다.
"""

from neo4j import GraphDatabase
from datetime import datetime


class AxiomConstraintStore:
    def __init__(self, uri, user, password):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def clear_existing(self):
        """기존 Axiom 및 Constraint 노드 삭제"""
        with self.driver.session() as session:
            session.run("MATCH (a:Axiom) DETACH DELETE a")
            session.run("MATCH (c:Constraint) DETACH DELETE c")
            print("✓ 기존 Axiom/Constraint 노드 삭제 완료")

    def store_axioms(self):
        """공리(Axioms)를 Neo4j에 저장"""
        axioms = [
            {
                'axiomId': 'AX001',
                'type': 'DisjointClasses',
                'name': '장비-센서 분리 공리',
                'description': 'Equipment와 Sensor는 서로 다른 클래스입니다. 하나의 노드가 동시에 Equipment와 Sensor가 될 수 없습니다.',
                'severity': 'High',
                'classes': ['Equipment', 'Sensor'],
                'checkQuery': '''
                    MATCH (n)
                    WHERE 'Equipment' IN labels(n) AND 'Sensor' IN labels(n)
                    RETURN n.equipmentId AS nodeId, labels(n) AS labels
                '''
            },
            {
                'axiomId': 'AX002',
                'type': 'PropertyDomain',
                'name': 'healthScore 도메인 제약',
                'description': 'healthScore 속성은 Equipment 노드에만 사용할 수 있습니다.',
                'severity': 'High',
                'property': 'healthScore',
                'domain': 'Equipment',
                'checkQuery': '''
                    MATCH (n)
                    WHERE n.healthScore IS NOT NULL AND NOT 'Equipment' IN labels(n)
                    RETURN id(n) AS nodeId, labels(n) AS labels, n.healthScore AS healthScore
                '''
            },
            {
                'axiomId': 'AX003',
                'type': 'InverseProperty',
                'name': 'hasSensor-isAttachedTo 역관계',
                'description': 'HAS_SENSOR와 IS_ATTACHED_TO는 역관계입니다. HAS_SENSOR 관계가 있으면 반드시 IS_ATTACHED_TO 역관계도 존재해야 합니다.',
                'severity': 'Medium',
                'property1': 'HAS_SENSOR',
                'property2': 'IS_ATTACHED_TO',
                'checkQuery': '''
                    MATCH (e:Equipment)-[:HAS_SENSOR]->(s:Sensor)
                    WHERE NOT EXISTS((s)-[:IS_ATTACHED_TO]->(e))
                    RETURN e.equipmentId AS equipmentId, s.sensorId AS sensorId
                '''
            },
            {
                'axiomId': 'AX004',
                'type': 'TransitiveProperty',
                'name': 'FEEDS_INTO 전이성',
                'description': 'FEEDS_INTO는 전이적 관계입니다. A→B, B→C이면 A→C도 성립해야 합니다.',
                'severity': 'Low',
                'property': 'FEEDS_INTO',
                'checkQuery': '''
                    MATCH (a:Equipment)-[:FEEDS_INTO]->(b:Equipment)-[:FEEDS_INTO]->(c:Equipment)
                    WHERE a <> c AND NOT EXISTS((a)-[:FEEDS_INTO]->(c))
                    RETURN a.equipmentId AS from, b.equipmentId AS via, c.equipmentId AS to
                '''
            },
            {
                'axiomId': 'AX005',
                'type': 'FunctionalProperty',
                'name': 'healthScore 단일값 제약',
                'description': 'healthScore는 함수적 속성입니다. 각 Equipment는 정확히 하나의 healthScore 값만 가져야 합니다.',
                'severity': 'Medium',
                'property': 'healthScore',
                'checkQuery': '''
                    MATCH (e:Equipment)
                    WHERE e.healthScore IS NULL
                    RETURN e.equipmentId AS equipmentId, 'Missing healthScore property' AS issue
                '''
            },
            {
                'axiomId': 'AX006',
                'type': 'PropertyDomain',
                'name': 'RO 수질 개선 공리',
                'description': 'RO(역삼투) 장비의 출력 전도도는 입력 전도도보다 낮아야 합니다.',
                'severity': 'High',
                'domain': 'ReverseOsmosis',
                'checkQuery': '''
                    MATCH (ro:Equipment)
                    WHERE ro.type IN ['ReverseOsmosis', 'RO']
                    // 입출력 전도도 비교 쿼리
                    RETURN ro.equipmentId AS equipmentId
                '''
            },
            {
                'axiomId': 'AX007',
                'type': 'PropertyDomain',
                'name': 'EDI 필수 센서 공리',
                'description': 'EDI 장비는 전압 센서와 전류 센서를 반드시 가져야 합니다.',
                'severity': 'High',
                'domain': 'Electrodeionization',
                'checkQuery': '''
                    MATCH (edi:Equipment)
                    WHERE edi.type IN ['Electrodeionization', 'EDI']
                    OPTIONAL MATCH (edi)-[:HAS_SENSOR]->(vs:Sensor)
                    WHERE vs.type IN ['VoltageSensor', 'Voltage']
                    OPTIONAL MATCH (edi)-[:HAS_SENSOR]->(cs:Sensor)
                    WHERE cs.type IN ['CurrentSensor', 'Current']
                    WITH edi, count(DISTINCT vs) > 0 AS hasVoltage, count(DISTINCT cs) > 0 AS hasCurrent
                    WHERE NOT hasVoltage OR NOT hasCurrent
                    RETURN edi.equipmentId AS equipmentId
                '''
            },
            {
                'axiomId': 'AX008',
                'type': 'PropertyDomain',
                'name': 'UV 살균 센서 공리',
                'description': 'UV Sterilizer는 UV 강도 센서를 반드시 가져야 합니다.',
                'severity': 'High',
                'domain': 'UVSterilizer',
                'checkQuery': '''
                    MATCH (uv:Equipment)
                    WHERE uv.type IN ['UVSterilizer', 'UV']
                    OPTIONAL MATCH (uv)-[:HAS_SENSOR]->(s:Sensor)
                    WHERE s.type IN ['UVIntensitySensor', 'UVIntensity']
                    WITH uv, count(s) AS uvSensorCount
                    WHERE uvSensorCount = 0
                    RETURN uv.equipmentId AS equipmentId
                '''
            },
            {
                'axiomId': 'AX009',
                'type': 'PropertyRange',
                'name': '공정 순서 공리',
                'description': 'RO는 EDI보다 공정 순서상 앞에 위치해야 합니다.',
                'severity': 'High',
                'domain': 'ProcessFlow',
                'checkQuery': '''
                    MATCH (ro:Equipment {type: 'ReverseOsmosis'})-[:FEEDS_INTO*]->(edi:Equipment {type: 'Electrodeionization'})
                    WITH ro, edi
                    MATCH path = (edi)-[:FEEDS_INTO*]->(ro)
                    RETURN ro.equipmentId AS roId, edi.equipmentId AS ediId
                '''
            },
            {
                'axiomId': 'AX010',
                'type': 'PropertyRange',
                'name': '압력차 이상 공리',
                'description': 'RO 장비의 입출력 압력차가 1.5 bar를 초과하면 막힘 가능성이 있습니다.',
                'severity': 'Medium',
                'domain': 'ReverseOsmosis',
                'threshold': 1.5,
                'unit': 'bar',
                'checkQuery': '''
                    // RO 압력차 체크 쿼리
                    RETURN null LIMIT 0
                '''
            },
            {
                'axiomId': 'AX011',
                'type': 'PropertyRange',
                'name': '전도도 추이 공리',
                'description': '출력 전도도가 7일간 지속적으로 증가하면 막 열화 가능성이 있습니다.',
                'severity': 'Medium',
                'domain': 'ReverseOsmosis',
                'trendDays': 7,
                'checkQuery': '''
                    // 전도도 추이 체크 쿼리
                    RETURN null LIMIT 0
                '''
            }
        ]

        with self.driver.session() as session:
            for axiom in axioms:
                # classes 배열을 문자열로 변환
                classes_str = ','.join(axiom.get('classes', []))

                session.run('''
                    CREATE (a:Axiom {
                        axiomId: $axiomId,
                        type: $type,
                        name: $name,
                        description: $description,
                        severity: $severity,
                        property: $property,
                        property1: $property1,
                        property2: $property2,
                        domain: $domain,
                        classes: $classes,
                        threshold: $threshold,
                        unit: $unit,
                        trendDays: $trendDays,
                        checkQuery: $checkQuery,
                        createdAt: datetime()
                    })
                ''', {
                    'axiomId': axiom['axiomId'],
                    'type': axiom['type'],
                    'name': axiom['name'],
                    'description': axiom['description'],
                    'severity': axiom['severity'],
                    'property': axiom.get('property'),
                    'property1': axiom.get('property1'),
                    'property2': axiom.get('property2'),
                    'domain': axiom.get('domain'),
                    'classes': classes_str if classes_str else None,
                    'threshold': axiom.get('threshold'),
                    'unit': axiom.get('unit'),
                    'trendDays': axiom.get('trendDays'),
                    'checkQuery': axiom.get('checkQuery', '')
                })
                print(f"  ✓ {axiom['axiomId']}: {axiom['name']}")

            print(f"\n✓ 총 {len(axioms)}개의 공리 저장 완료")

    def store_constraints(self):
        """제약조건(Constraints)을 Neo4j에 저장"""
        constraints = [
            {
                'constraintId': 'CONS001',
                'type': 'RequiredProperty',
                'nodeType': 'Equipment',
                'name': '필수 속성: 장비 ID',
                'description': 'Equipment 노드는 equipmentId, name, type 속성을 반드시 가져야 합니다.',
                'severity': 'High',
                'properties': ['equipmentId', 'name', 'type'],
                'checkQuery': '''
                    MATCH (e:Equipment)
                    WHERE e.equipmentId IS NULL OR e.name IS NULL OR e.type IS NULL
                    RETURN coalesce(e.equipmentId, id(e)) AS nodeId
                '''
            },
            {
                'constraintId': 'CONS002',
                'type': 'ValueRange',
                'nodeType': 'Equipment',
                'name': 'healthScore 범위 제약',
                'description': 'Equipment의 healthScore는 0에서 100 사이의 값이어야 합니다.',
                'severity': 'High',
                'property': 'healthScore',
                'min': 0,
                'max': 100,
                'checkQuery': '''
                    MATCH (e:Equipment)
                    WHERE e.healthScore IS NOT NULL AND (e.healthScore < 0 OR e.healthScore > 100)
                    RETURN e.equipmentId AS equipmentId, e.healthScore AS invalidValue
                '''
            },
            {
                'constraintId': 'CONS003',
                'type': 'Cardinality',
                'nodeType': 'Equipment',
                'name': '최소 센서 개수 제약',
                'description': 'Equipment는 최소 1개의 센서를 가져야 합니다.',
                'severity': 'Medium',
                'relationship': 'HAS_SENSOR',
                'minCardinality': 1,
                'checkQuery': '''
                    MATCH (e:Equipment)
                    OPTIONAL MATCH (e)-[:HAS_SENSOR]->(s:Sensor)
                    WITH e, count(s) AS sensorCount
                    WHERE sensorCount < 1
                    RETURN e.equipmentId AS equipmentId, sensorCount AS actualCount
                '''
            },
            {
                'constraintId': 'CONS004',
                'type': 'Uniqueness',
                'nodeType': 'Equipment',
                'name': '장비 ID 유일성',
                'description': 'Equipment의 equipmentId는 유일해야 합니다. 중복된 ID가 존재하면 안 됩니다.',
                'severity': 'Critical',
                'property': 'equipmentId',
                'checkQuery': '''
                    MATCH (e:Equipment)
                    WHERE e.equipmentId IS NOT NULL
                    WITH e.equipmentId AS id, count(*) AS cnt
                    WHERE cnt > 1
                    RETURN id AS duplicateId, cnt AS count
                '''
            },
            {
                'constraintId': 'CONS005',
                'type': 'ValueRange',
                'nodeType': 'Observation',
                'name': '온도 센서 범위',
                'description': '온도 센서의 관측값은 -50°C에서 200°C 사이여야 합니다.',
                'severity': 'Medium',
                'sensorType': 'Temperature',
                'property': 'value',
                'min': -50,
                'max': 200,
                'unit': '°C',
                'checkQuery': '''
                    MATCH (o:Observation)-[:OBSERVED_BY]->(s:Sensor)
                    WHERE s.type IN ['Temperature', 'TemperatureSensor']
                      AND o.value IS NOT NULL
                      AND (o.value < -50 OR o.value > 200)
                    RETURN s.sensorId AS sensorId, o.value AS invalidValue
                    LIMIT 100
                '''
            },
            {
                'constraintId': 'CONS006',
                'type': 'ValueRange',
                'nodeType': 'Observation',
                'name': 'RO 압력 범위',
                'description': 'RO(역삼투) 장비의 입력 압력은 8-15 bar 범위 내에 있어야 합니다.',
                'severity': 'High',
                'equipmentType': 'ReverseOsmosis',
                'property': 'value',
                'min': 8,
                'max': 15,
                'unit': 'bar',
                'checkQuery': '''
                    MATCH (ro:Equipment)-[:HAS_SENSOR]->(ps:Sensor)
                    WHERE ro.type IN ['ReverseOsmosis', 'RO']
                      AND ps.type IN ['PressureSensor', 'Pressure']
                    MATCH (obs:Observation)-[:OBSERVED_BY]->(ps)
                    WHERE obs.value IS NOT NULL AND (obs.value < 8 OR obs.value > 15)
                    RETURN ro.equipmentId AS equipmentId, obs.value AS invalidValue
                    LIMIT 50
                '''
            },
            {
                'constraintId': 'CONS007',
                'type': 'ValueRange',
                'nodeType': 'Observation',
                'name': 'EDI 전압 범위',
                'description': 'EDI 장비의 전압은 200-600V 범위 내에 있어야 정상 작동합니다.',
                'severity': 'High',
                'equipmentType': 'Electrodeionization',
                'property': 'value',
                'min': 200,
                'max': 600,
                'unit': 'V',
                'checkQuery': '''
                    MATCH (edi:Equipment)-[:HAS_SENSOR]->(vs:Sensor)
                    WHERE edi.type IN ['Electrodeionization', 'EDI']
                      AND vs.type IN ['VoltageSensor', 'Voltage']
                    MATCH (obs:Observation)-[:OBSERVED_BY]->(vs)
                    WHERE obs.value IS NOT NULL AND (obs.value < 200 OR obs.value > 600)
                    RETURN edi.equipmentId AS equipmentId, obs.value AS invalidValue
                    LIMIT 50
                '''
            },
            {
                'constraintId': 'CONS008',
                'type': 'ValueRange',
                'nodeType': 'Observation',
                'name': 'UV 강도 최소값',
                'description': 'UV Sterilizer의 UV 강도는 30 mW/cm² 이상이어야 효과적인 살균이 가능합니다.',
                'severity': 'High',
                'equipmentType': 'UVSterilizer',
                'property': 'value',
                'min': 30,
                'unit': 'mW/cm²',
                'checkQuery': '''
                    MATCH (uv:Equipment)-[:HAS_SENSOR]->(uvs:Sensor)
                    WHERE uv.type IN ['UVSterilizer', 'UV']
                      AND uvs.type IN ['UVIntensitySensor', 'UVIntensity']
                    MATCH (obs:Observation)-[:OBSERVED_BY]->(uvs)
                    WHERE obs.value IS NOT NULL AND obs.value < 30
                    RETURN uv.equipmentId AS equipmentId, obs.value AS invalidValue
                    LIMIT 50
                '''
            },
            {
                'constraintId': 'CONS009',
                'type': 'ValueRange',
                'nodeType': 'Observation',
                'name': '출력 전도도 상한',
                'description': 'UPW 시스템의 최종 출력 전도도는 0.1 μS/cm 이하여야 합니다.',
                'severity': 'Critical',
                'property': 'value',
                'max': 0.1,
                'unit': 'μS/cm',
                'checkQuery': '''
                    MATCH (e:Equipment)-[:HAS_SENSOR]->(cs:Sensor)
                    WHERE cs.type IN ['ConductivitySensor', 'Conductivity']
                      AND cs.sensorId CONTAINS 'OUT'
                    MATCH (obs:Observation)-[:OBSERVED_BY]->(cs)
                    WHERE obs.value IS NOT NULL AND obs.value > 0.1
                    RETURN e.equipmentId AS equipmentId, obs.value AS invalidValue
                    LIMIT 50
                '''
            },
            {
                'constraintId': 'CONS010',
                'type': 'ValueRange',
                'nodeType': 'Observation',
                'name': 'RO 유량 범위',
                'description': 'RO 장비의 생산 유량은 최소 설계 용량의 50% 이상이어야 합니다.',
                'severity': 'Medium',
                'equipmentType': 'ReverseOsmosis',
                'property': 'value',
                'min': 30,
                'unit': 'm³/h',
                'checkQuery': '''
                    MATCH (ro:Equipment)-[:HAS_SENSOR]->(fs:Sensor)
                    WHERE ro.type IN ['ReverseOsmosis', 'RO']
                      AND fs.type IN ['FlowSensor', 'Flow']
                    MATCH (obs:Observation)-[:OBSERVED_BY]->(fs)
                    WHERE obs.value IS NOT NULL AND obs.value < 30
                    RETURN ro.equipmentId AS equipmentId, obs.value AS invalidValue
                    LIMIT 50
                '''
            },
            {
                'constraintId': 'CONS011',
                'type': 'ValueRange',
                'nodeType': 'Equipment',
                'name': 'RO 가동시간 제한',
                'description': 'RO 멤브레인의 권장 교체 주기는 30,000 가동시간입니다.',
                'severity': 'Medium',
                'equipmentType': 'ReverseOsmosis',
                'property': 'operatingHours',
                'max': 30000,
                'unit': 'hours',
                'checkQuery': '''
                    MATCH (ro:Equipment)
                    WHERE ro.type IN ['ReverseOsmosis', 'RO']
                      AND ro.operatingHours IS NOT NULL
                      AND ro.operatingHours > 30000
                    RETURN ro.equipmentId AS equipmentId, ro.operatingHours AS operatingHours
                '''
            }
        ]

        with self.driver.session() as session:
            for constraint in constraints:
                # properties 배열을 문자열로 변환
                properties_str = ','.join(constraint.get('properties', []))

                session.run('''
                    CREATE (c:Constraint {
                        constraintId: $constraintId,
                        type: $type,
                        nodeType: $nodeType,
                        name: $name,
                        description: $description,
                        severity: $severity,
                        property: $property,
                        properties: $properties,
                        relationship: $relationship,
                        minCardinality: $minCardinality,
                        sensorType: $sensorType,
                        equipmentType: $equipmentType,
                        min: $min,
                        max: $max,
                        unit: $unit,
                        checkQuery: $checkQuery,
                        createdAt: datetime()
                    })
                ''', {
                    'constraintId': constraint['constraintId'],
                    'type': constraint['type'],
                    'nodeType': constraint['nodeType'],
                    'name': constraint['name'],
                    'description': constraint['description'],
                    'severity': constraint['severity'],
                    'property': constraint.get('property'),
                    'properties': properties_str if properties_str else None,
                    'relationship': constraint.get('relationship'),
                    'minCardinality': constraint.get('minCardinality'),
                    'sensorType': constraint.get('sensorType'),
                    'equipmentType': constraint.get('equipmentType'),
                    'min': constraint.get('min'),
                    'max': constraint.get('max'),
                    'unit': constraint.get('unit'),
                    'checkQuery': constraint.get('checkQuery', '')
                })
                print(f"  ✓ {constraint['constraintId']}: {constraint['name']}")

            print(f"\n✓ 총 {len(constraints)}개의 제약조건 저장 완료")

    def print_summary(self):
        """저장된 데이터 요약"""
        with self.driver.session() as session:
            print("\n" + "=" * 60)
            print("Neo4j에 저장된 공리 및 제약조건 요약")
            print("=" * 60)

            # Axiom 카운트
            result = session.run("MATCH (a:Axiom) RETURN count(a) AS count")
            axiom_count = result.single()['count']
            print(f"\n공리 (Axiom) 노드: {axiom_count}개")

            # Axiom 목록
            result = session.run("""
                MATCH (a:Axiom)
                RETURN a.axiomId AS id, a.name AS name, a.type AS type, a.severity AS severity
                ORDER BY a.axiomId
            """)
            for record in result:
                print(f"  - {record['id']}: {record['name']} [{record['type']}] ({record['severity']})")

            # Constraint 카운트
            result = session.run("MATCH (c:Constraint) RETURN count(c) AS count")
            constraint_count = result.single()['count']
            print(f"\n제약조건 (Constraint) 노드: {constraint_count}개")

            # Constraint 목록
            result = session.run("""
                MATCH (c:Constraint)
                RETURN c.constraintId AS id, c.name AS name, c.type AS type, c.severity AS severity
                ORDER BY c.constraintId
            """)
            for record in result:
                print(f"  - {record['id']}: {record['name']} [{record['type']}] ({record['severity']})")

            print("\n" + "=" * 60)


def main():
    # Neo4j 연결 정보
    URI = "bolt://localhost:7688"
    USER = "neo4j"
    PASSWORD = "upw_password_2024"

    print("=" * 60)
    print("공리 및 제약조건 Neo4j 저장 스크립트")
    print("=" * 60)

    store = AxiomConstraintStore(URI, USER, PASSWORD)

    try:
        # 기존 데이터 삭제
        store.clear_existing()

        # 공리 저장
        print("\n=== 공리(Axioms) 저장 ===")
        store.store_axioms()

        # 제약조건 저장
        print("\n=== 제약조건(Constraints) 저장 ===")
        store.store_constraints()

        # 요약 출력
        store.print_summary()

    finally:
        store.close()

    print("\n✓ 완료!")


if __name__ == "__main__":
    main()
