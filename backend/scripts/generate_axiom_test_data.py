"""
공리 및 제약조건 테스트 데이터 생성 스크립트

이 스크립트는 다음과 같은 테스트 데이터를 생성합니다:
1. 공리 위반 사례
2. 제약조건 위반 사례
3. 정상 사례 (공리와 제약조건을 모두 만족)
"""
from neo4j import GraphDatabase
from datetime import datetime, timedelta
import random


class AxiomTestDataGenerator:
    def __init__(self, uri, user, password):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def clear_test_data(self):
        """기존 테스트 데이터 삭제 (isTestData=true인 것만)"""
        with self.driver.session() as session:
            # 테스트 데이터로 표시된 노드와 관계 삭제
            session.run("""
                MATCH (n)
                WHERE n.isTestData = true
                DETACH DELETE n
            """)
            print("✓ 기존 테스트 데이터 삭제 완료")

    def generate_axiom_violation_data(self):
        """공리 위반 사례 생성"""
        with self.driver.session() as session:
            print("\n=== 공리 위반 사례 생성 ===")

            # AX001 위반: Equipment와 Sensor 동시 레이블
            session.run("""
                CREATE (n:Equipment:Sensor {
                    equipmentId: 'TEST-AX001-VIOLATION',
                    sensorId: 'TEST-AX001-SENSOR',
                    name: 'Hybrid Equipment-Sensor (위반)',
                    type: 'Invalid',
                    isTestData: true
                })
            """)
            print("  ✓ AX001 위반 (Equipment+Sensor 동시 레이블) 생성")

            # AX002 위반: Sensor에 healthScore 속성
            session.run("""
                CREATE (s:Sensor {
                    sensorId: 'TEST-AX002-SENSOR',
                    name: 'Sensor with HealthScore (위반)',
                    healthScore: 85.5,
                    type: 'InvalidSensor',
                    isTestData: true
                })
            """)
            print("  ✓ AX002 위반 (Sensor에 healthScore) 생성")

            # AX003 위반: HAS_SENSOR 있지만 IS_ATTACHED_TO 없음
            session.run("""
                CREATE (e:Equipment {
                    equipmentId: 'TEST-AX003-EQ',
                    name: 'Equipment Missing Inverse (위반)',
                    type: 'TestEquipment',
                    healthScore: 80,
                    isTestData: true
                })
                CREATE (s:Sensor {
                    sensorId: 'TEST-AX003-SENSOR',
                    name: 'Sensor Missing Inverse',
                    type: 'TestSensor',
                    isTestData: true
                })
                CREATE (e)-[:HAS_SENSOR]->(s)
            """)
            print("  ✓ AX003 위반 (역관계 누락) 생성")

            # AX004 위반: FEEDS_INTO 전이성 누락
            session.run("""
                CREATE (e1:Equipment {
                    equipmentId: 'TEST-AX004-E1',
                    name: 'Equipment A (전이성 테스트)',
                    type: 'TestEquipment',
                    healthScore: 85,
                    isTestData: true
                })
                CREATE (e2:Equipment {
                    equipmentId: 'TEST-AX004-E2',
                    name: 'Equipment B (전이성 테스트)',
                    type: 'TestEquipment',
                    healthScore: 88,
                    isTestData: true
                })
                CREATE (e3:Equipment {
                    equipmentId: 'TEST-AX004-E3',
                    name: 'Equipment C (전이성 테스트)',
                    type: 'TestEquipment',
                    healthScore: 90,
                    isTestData: true
                })
                CREATE (e1)-[:FEEDS_INTO]->(e2)
                CREATE (e2)-[:FEEDS_INTO]->(e3)
            """)
            print("  ✓ AX004 위반 (전이성 누락: A→B→C but not A→C) 생성")

            # AX005 위반: healthScore 누락
            session.run("""
                CREATE (e:Equipment {
                    equipmentId: 'TEST-AX005-NO-HEALTH',
                    name: 'Equipment Without HealthScore (위반)',
                    type: 'TestEquipment',
                    isTestData: true
                })
            """)
            print("  ✓ AX005 위반 (healthScore 누락) 생성")

            # AX006 위반: RO 출력 전도도 >= 입력 전도도
            result = session.run("""
                CREATE (ro:Equipment {
                    equipmentId: 'TEST-AX006-RO',
                    name: 'RO with Bad Water Quality (위반)',
                    type: 'ReverseOsmosis',
                    healthScore: 70,
                    isTestData: true
                })
                CREATE (csIn:Sensor {
                    sensorId: 'TEST-AX006-CS-IN',
                    name: 'Input Conductivity Sensor',
                    type: 'ConductivitySensor',
                    unit: 'μS/cm',
                    isTestData: true
                })
                CREATE (csOut:Sensor {
                    sensorId: 'TEST-AX006-CS-OUT',
                    name: 'Output Conductivity Sensor',
                    type: 'ConductivitySensor',
                    unit: 'μS/cm',
                    isTestData: true
                })
                CREATE (ro)-[:HAS_SENSOR]->(csIn)
                CREATE (ro)-[:HAS_SENSOR]->(csOut)

                // 입력 전도도: 평균 5.0
                WITH ro, csIn, csOut
                UNWIND range(1, 10) AS i
                CREATE (obsIn:Observation {
                    value: 5.0 + (rand() * 0.5 - 0.25),
                    timestamp: datetime() - duration('PT' + toString(i) + 'M'),
                    unit: 'μS/cm',
                    isTestData: true
                })
                CREATE (obsIn)-[:OBSERVED_BY]->(csIn)

                // 출력 전도도: 평균 6.0 (입력보다 높음 - 위반!)
                WITH ro, csOut
                UNWIND range(1, 10) AS i
                CREATE (obsOut:Observation {
                    value: 6.0 + (rand() * 0.5 - 0.25),
                    timestamp: datetime() - duration('PT' + toString(i) + 'M'),
                    unit: 'μS/cm',
                    isTestData: true
                })
                CREATE (obsOut)-[:OBSERVED_BY]->(csOut)

                RETURN count(*) AS created
            """)
            print(f"  ✓ AX006 위반 (RO 수질 악화) 생성: {result.single()['created']} observations")

            # AX007 위반: EDI에 전압 센서만 있고 전류 센서 없음
            session.run("""
                CREATE (edi:Equipment {
                    equipmentId: 'TEST-AX007-EDI',
                    name: 'EDI Missing Current Sensor (위반)',
                    type: 'Electrodeionization',
                    healthScore: 82,
                    isTestData: true
                })
                CREATE (vs:Sensor {
                    sensorId: 'TEST-AX007-VS',
                    name: 'Voltage Sensor Only',
                    type: 'VoltageSensor',
                    unit: 'V',
                    isTestData: true
                })
                CREATE (edi)-[:HAS_SENSOR]->(vs)
            """)
            print("  ✓ AX007 위반 (EDI 전류 센서 누락) 생성")

            # AX008 위반: UV Sterilizer에 UV 강도 센서 없음
            session.run("""
                CREATE (uv:Equipment {
                    equipmentId: 'TEST-AX008-UV',
                    name: 'UV Sterilizer Without Intensity Sensor (위반)',
                    type: 'UVSterilizer',
                    healthScore: 75,
                    isTestData: true
                })
                CREATE (ts:Sensor {
                    sensorId: 'TEST-AX008-TEMP',
                    name: 'Temperature Sensor (wrong type)',
                    type: 'TemperatureSensor',
                    unit: '°C',
                    isTestData: true
                })
                CREATE (uv)-[:HAS_SENSOR]->(ts)
            """)
            print("  ✓ AX008 위반 (UV 강도 센서 누락) 생성")

            # AX010 위반: RO 압력차 > 1.5 bar
            result = session.run("""
                CREATE (ro:Equipment {
                    equipmentId: 'TEST-AX010-RO',
                    name: 'RO with High Pressure Diff (위반)',
                    type: 'ReverseOsmosis',
                    healthScore: 68,
                    isTestData: true
                })
                CREATE (psIn:Sensor {
                    sensorId: 'TEST-AX010-PS-IN',
                    name: 'Input Pressure Sensor',
                    type: 'PressureSensor',
                    unit: 'bar',
                    isTestData: true
                })
                CREATE (psOut:Sensor {
                    sensorId: 'TEST-AX010-PS-OUT',
                    name: 'Output Pressure Sensor',
                    type: 'PressureSensor',
                    unit: 'bar',
                    isTestData: true
                })
                CREATE (ro)-[:HAS_SENSOR]->(psIn)
                CREATE (ro)-[:HAS_SENSOR]->(psOut)

                // 입력 압력: 평균 12 bar
                WITH ro, psIn, psOut
                UNWIND range(1, 10) AS i
                CREATE (obsIn:Observation {
                    value: 12.0 + (rand() * 0.4 - 0.2),
                    timestamp: datetime() - duration('PT' + toString(i) + 'M'),
                    unit: 'bar',
                    isTestData: true
                })
                CREATE (obsIn)-[:OBSERVED_BY]->(psIn)

                // 출력 압력: 평균 10 bar (압력차 2 bar - 위반!)
                WITH ro, psOut
                UNWIND range(1, 10) AS i
                CREATE (obsOut:Observation {
                    value: 10.0 + (rand() * 0.4 - 0.2),
                    timestamp: datetime() - duration('PT' + toString(i) + 'M'),
                    unit: 'bar',
                    isTestData: true
                })
                CREATE (obsOut)-[:OBSERVED_BY]->(psOut)

                RETURN count(*) AS created
            """)
            print(f"  ✓ AX010 위반 (RO 압력차 초과) 생성: {result.single()['created']} observations")

            # AX011 위반: 전도도 증가 추세
            result = session.run("""
                CREATE (eq:Equipment {
                    equipmentId: 'TEST-AX011-EQ',
                    name: 'Equipment with Increasing Conductivity (위반)',
                    type: 'ReverseOsmosis',
                    healthScore: 72,
                    isTestData: true
                })
                CREATE (cs:Sensor {
                    sensorId: 'TEST-AX011-CS-OUT',
                    name: 'Output Conductivity Sensor',
                    type: 'ConductivitySensor',
                    unit: 'μS/cm',
                    isTestData: true
                })
                CREATE (eq)-[:HAS_SENSOR]->(cs)

                // 7일간 증가 추세 (0.5 → 0.7 μS/cm, 40% 증가)
                WITH eq, cs
                UNWIND range(0, 6) AS day
                WITH cs, day, 0.5 + (day * 0.033) AS baseValue
                UNWIND range(1, 5) AS reading
                CREATE (obs:Observation {
                    value: baseValue + (rand() * 0.02 - 0.01),
                    timestamp: datetime() - duration('P' + toString(6-day) + 'D') - duration('PT' + toString(reading) + 'H'),
                    unit: 'μS/cm',
                    isTestData: true
                })
                CREATE (obs)-[:OBSERVED_BY]->(cs)

                RETURN count(*) AS created
            """)
            print(f"  ✓ AX011 위반 (전도도 증가 추세) 생성: {result.single()['created']} observations")

    def generate_constraint_violation_data(self):
        """제약조건 위반 사례 생성"""
        with self.driver.session() as session:
            print("\n=== 제약조건 위반 사례 생성 ===")

            # CONS001 위반: 필수 속성 누락
            session.run("""
                CREATE (e1:Equipment {
                    equipmentId: 'TEST-CONS001-NO-NAME',
                    type: 'TestEquipment',
                    healthScore: 85,
                    isTestData: true
                })
                CREATE (e2:Equipment {
                    name: 'Equipment Without ID',
                    type: 'TestEquipment',
                    healthScore: 80,
                    isTestData: true
                })
                CREATE (e3:Equipment {
                    equipmentId: 'TEST-CONS001-NO-TYPE',
                    name: 'Equipment Without Type',
                    healthScore: 88,
                    isTestData: true
                })
            """)
            print("  ✓ CONS001 위반 (필수 속성 누락) 3건 생성")

            # CONS002 위반: healthScore 범위 초과
            session.run("""
                CREATE (e1:Equipment {
                    equipmentId: 'TEST-CONS002-NEGATIVE',
                    name: 'Equipment with Negative HealthScore',
                    type: 'TestEquipment',
                    healthScore: -10,
                    isTestData: true
                })
                CREATE (e2:Equipment {
                    equipmentId: 'TEST-CONS002-OVER100',
                    name: 'Equipment with HealthScore > 100',
                    type: 'TestEquipment',
                    healthScore: 150,
                    isTestData: true
                })
            """)
            print("  ✓ CONS002 위반 (healthScore 범위 초과) 2건 생성")

            # CONS003 위반: 센서 없는 장비
            session.run("""
                CREATE (e:Equipment {
                    equipmentId: 'TEST-CONS003-NO-SENSOR',
                    name: 'Equipment Without Any Sensor',
                    type: 'TestEquipment',
                    healthScore: 85,
                    isTestData: true
                })
            """)
            print("  ✓ CONS003 위반 (센서 없음) 1건 생성")

            # CONS004 위반: equipmentId 중복
            # Note: DB에 unique constraint가 있어서 실제 중복 생성 불가
            # 대신 제약조건 검증 쿼리로 기존 데이터의 중복을 탐지
            print("  ⚠ CONS004 위반 (equipmentId 중복) 스킵 - DB unique constraint 존재")

            # CONS005 위반: 온도 센서 범위 초과
            result = session.run("""
                CREATE (eq:Equipment {
                    equipmentId: 'TEST-CONS005-EQ',
                    name: 'Equipment with Extreme Temperature',
                    type: 'TestEquipment',
                    healthScore: 88,
                    isTestData: true
                })
                CREATE (ts:Sensor {
                    sensorId: 'TEST-CONS005-TEMP',
                    name: 'Temperature Sensor',
                    type: 'Temperature',
                    unit: '°C',
                    isTestData: true
                })
                CREATE (eq)-[:HAS_SENSOR]->(ts)

                // 극한 온도 관측값
                WITH ts
                CREATE (obs1:Observation {
                    value: -100.0,
                    timestamp: datetime() - duration('PT1H'),
                    unit: '°C',
                    isTestData: true
                })
                CREATE (obs2:Observation {
                    value: 250.0,
                    timestamp: datetime() - duration('PT30M'),
                    unit: '°C',
                    isTestData: true
                })
                CREATE (obs1)-[:OBSERVED_BY]->(ts)
                CREATE (obs2)-[:OBSERVED_BY]->(ts)

                RETURN count(*) AS created
            """)
            print(f"  ✓ CONS005 위반 (온도 범위 초과) 생성: {result.single()['created']} observations")

            # CONS006 위반: RO 압력 범위 초과
            result = session.run("""
                CREATE (ro:Equipment {
                    equipmentId: 'TEST-CONS006-RO',
                    name: 'RO with Extreme Pressure',
                    type: 'ReverseOsmosis',
                    healthScore: 75,
                    isTestData: true
                })
                CREATE (ps:Sensor {
                    sensorId: 'TEST-CONS006-PS-IN',
                    name: 'Input Pressure Sensor',
                    type: 'PressureSensor',
                    unit: 'bar',
                    isTestData: true
                })
                CREATE (ro)-[:HAS_SENSOR]->(ps)

                // 압력 범위 초과
                WITH ps
                CREATE (obs1:Observation {
                    value: 5.0,
                    timestamp: datetime() - duration('PT2H'),
                    unit: 'bar',
                    isTestData: true
                })
                CREATE (obs2:Observation {
                    value: 20.0,
                    timestamp: datetime() - duration('PT1H'),
                    unit: 'bar',
                    isTestData: true
                })
                CREATE (obs1)-[:OBSERVED_BY]->(ps)
                CREATE (obs2)-[:OBSERVED_BY]->(ps)

                RETURN count(*) AS created
            """)
            print(f"  ✓ CONS006 위반 (RO 압력 범위 초과) 생성: {result.single()['created']} observations")

            # CONS007 위반: EDI 전압 범위 초과
            result = session.run("""
                CREATE (edi:Equipment {
                    equipmentId: 'TEST-CONS007-EDI',
                    name: 'EDI with Extreme Voltage',
                    type: 'Electrodeionization',
                    healthScore: 78,
                    isTestData: true
                })
                CREATE (vs:Sensor {
                    sensorId: 'TEST-CONS007-VS',
                    name: 'Voltage Sensor',
                    type: 'VoltageSensor',
                    unit: 'V',
                    isTestData: true
                })
                CREATE (edi)-[:HAS_SENSOR]->(vs)

                // 전압 범위 초과
                WITH vs
                CREATE (obs1:Observation {
                    value: 150.0,
                    timestamp: datetime() - duration('PT2H'),
                    unit: 'V',
                    isTestData: true
                })
                CREATE (obs2:Observation {
                    value: 700.0,
                    timestamp: datetime() - duration('PT1H'),
                    unit: 'V',
                    isTestData: true
                })
                CREATE (obs1)-[:OBSERVED_BY]->(vs)
                CREATE (obs2)-[:OBSERVED_BY]->(vs)

                RETURN count(*) AS created
            """)
            print(f"  ✓ CONS007 위반 (EDI 전압 범위 초과) 생성: {result.single()['created']} observations")

            # CONS008 위반: UV 강도 부족
            result = session.run("""
                CREATE (uv:Equipment {
                    equipmentId: 'TEST-CONS008-UV',
                    name: 'UV with Low Intensity',
                    type: 'UVSterilizer',
                    healthScore: 70,
                    isTestData: true
                })
                CREATE (uvs:Sensor {
                    sensorId: 'TEST-CONS008-UVS',
                    name: 'UV Intensity Sensor',
                    type: 'UVIntensitySensor',
                    unit: 'mW/cm²',
                    isTestData: true
                })
                CREATE (uv)-[:HAS_SENSOR]->(uvs)

                // UV 강도 부족 (< 30)
                WITH uvs
                UNWIND range(1, 5) AS i
                CREATE (obs:Observation {
                    value: 15.0 + (rand() * 5),
                    timestamp: datetime() - duration('PT' + toString(i) + 'H'),
                    unit: 'mW/cm²',
                    isTestData: true
                })
                CREATE (obs)-[:OBSERVED_BY]->(uvs)

                RETURN count(*) AS created
            """)
            print(f"  ✓ CONS008 위반 (UV 강도 부족) 생성: {result.single()['created']} observations")

            # CONS009 위반: 출력 전도도 초과
            result = session.run("""
                CREATE (eq:Equipment {
                    equipmentId: 'TEST-CONS009-EQ',
                    name: 'Equipment with High Output Conductivity',
                    type: 'ReverseOsmosis',
                    healthScore: 65,
                    isTestData: true
                })
                CREATE (cs:Sensor {
                    sensorId: 'TEST-CONS009-CS-OUT',
                    name: 'Output Conductivity Sensor',
                    type: 'ConductivitySensor',
                    unit: 'μS/cm',
                    isTestData: true
                })
                CREATE (eq)-[:HAS_SENSOR]->(cs)

                // 출력 전도도 초과 (> 1.0)
                WITH cs
                UNWIND range(1, 5) AS i
                CREATE (obs:Observation {
                    value: 1.5 + (rand() * 0.5),
                    timestamp: datetime() - duration('PT' + toString(i) + 'H'),
                    unit: 'μS/cm',
                    isTestData: true
                })
                CREATE (obs)-[:OBSERVED_BY]->(cs)

                RETURN count(*) AS created
            """)
            print(f"  ✓ CONS009 위반 (출력 전도도 초과) 생성: {result.single()['created']} observations")

            # CONS010 위반: RO 유량 부족
            result = session.run("""
                CREATE (ro:Equipment {
                    equipmentId: 'TEST-CONS010-RO',
                    name: 'RO with Low Flow Rate',
                    type: 'ReverseOsmosis',
                    healthScore: 68,
                    isTestData: true
                })
                CREATE (fs:Sensor {
                    sensorId: 'TEST-CONS010-FS',
                    name: 'Flow Sensor',
                    type: 'FlowSensor',
                    unit: 'm³/h',
                    isTestData: true
                })
                CREATE (ro)-[:HAS_SENSOR]->(fs)

                // 유량 부족 (< 30)
                WITH fs
                UNWIND range(1, 5) AS i
                CREATE (obs:Observation {
                    value: 20.0 + (rand() * 5),
                    timestamp: datetime() - duration('PT' + toString(i) + 'H'),
                    unit: 'm³/h',
                    isTestData: true
                })
                CREATE (obs)-[:OBSERVED_BY]->(fs)

                RETURN count(*) AS created
            """)
            print(f"  ✓ CONS010 위반 (RO 유량 부족) 생성: {result.single()['created']} observations")

            # CONS011 위반: RO 가동시간 초과
            session.run("""
                CREATE (ro:Equipment {
                    equipmentId: 'TEST-CONS011-RO',
                    name: 'RO with Excessive Operating Hours',
                    type: 'ReverseOsmosis',
                    healthScore: 62,
                    operatingHours: 9500,
                    isTestData: true
                })
            """)
            print("  ✓ CONS011 위반 (RO 가동시간 초과) 생성")

    def generate_valid_data(self):
        """정상 사례 생성 (공리와 제약조건을 모두 만족)"""
        with self.driver.session() as session:
            print("\n=== 정상 사례 생성 ===")

            # 정상 RO 시스템
            result = session.run("""
                CREATE (ro:Equipment {
                    equipmentId: 'TEST-VALID-RO-001',
                    name: 'Valid RO System',
                    type: 'ReverseOsmosis',
                    healthScore: 92,
                    operatingHours: 3500,
                    isTestData: true
                })

                // 입력 압력 센서
                CREATE (psIn:Sensor {
                    sensorId: 'TEST-VALID-RO-001-PS-IN',
                    name: 'Input Pressure Sensor',
                    type: 'PressureSensor',
                    unit: 'bar',
                    isTestData: true
                })

                // 출력 압력 센서
                CREATE (psOut:Sensor {
                    sensorId: 'TEST-VALID-RO-001-PS-OUT',
                    name: 'Output Pressure Sensor',
                    type: 'PressureSensor',
                    unit: 'bar',
                    isTestData: true
                })

                // 입력 전도도 센서
                CREATE (csIn:Sensor {
                    sensorId: 'TEST-VALID-RO-001-CS-IN',
                    name: 'Input Conductivity Sensor',
                    type: 'ConductivitySensor',
                    unit: 'μS/cm',
                    isTestData: true
                })

                // 출력 전도도 센서
                CREATE (csOut:Sensor {
                    sensorId: 'TEST-VALID-RO-001-CS-OUT',
                    name: 'Output Conductivity Sensor',
                    type: 'ConductivitySensor',
                    unit: 'μS/cm',
                    isTestData: true
                })

                // 유량 센서
                CREATE (fs:Sensor {
                    sensorId: 'TEST-VALID-RO-001-FS',
                    name: 'Flow Sensor',
                    type: 'FlowSensor',
                    unit: 'm³/h',
                    isTestData: true
                })

                // 온도 센서
                CREATE (ts:Sensor {
                    sensorId: 'TEST-VALID-RO-001-TS',
                    name: 'Temperature Sensor',
                    type: 'Temperature',
                    unit: '°C',
                    isTestData: true
                })

                // 관계 생성 (양방향)
                CREATE (ro)-[:HAS_SENSOR]->(psIn)
                CREATE (psIn)-[:IS_ATTACHED_TO]->(ro)
                CREATE (ro)-[:HAS_SENSOR]->(psOut)
                CREATE (psOut)-[:IS_ATTACHED_TO]->(ro)
                CREATE (ro)-[:HAS_SENSOR]->(csIn)
                CREATE (csIn)-[:IS_ATTACHED_TO]->(ro)
                CREATE (ro)-[:HAS_SENSOR]->(csOut)
                CREATE (csOut)-[:IS_ATTACHED_TO]->(ro)
                CREATE (ro)-[:HAS_SENSOR]->(fs)
                CREATE (fs)-[:IS_ATTACHED_TO]->(ro)
                CREATE (ro)-[:HAS_SENSOR]->(ts)
                CREATE (ts)-[:IS_ATTACHED_TO]->(ro)

                // 정상 관측값 생성
                WITH ro, psIn, psOut, csIn, csOut, fs, ts

                // 간단한 관측값 생성 (메모리 절약)
                WITH ro, psIn, psOut, csIn, csOut, fs, ts
                UNWIND range(1, 5) AS i
                CREATE (obs:Observation {
                    value: 11.0,
                    timestamp: datetime() - duration('PT' + toString(i*12) + 'M'),
                    unit: 'bar',
                    isTestData: true
                })
                CREATE (obs)-[:OBSERVED_BY]->(psIn)

                WITH ro, psOut, csIn, csOut, fs, ts
                UNWIND range(1, 5) AS i
                CREATE (obs:Observation {
                    value: 10.0,
                    timestamp: datetime() - duration('PT' + toString(i*12) + 'M'),
                    unit: 'bar',
                    isTestData: true
                })
                CREATE (obs)-[:OBSERVED_BY]->(psOut)

                WITH ro, csIn, csOut, fs, ts
                UNWIND range(1, 5) AS i
                CREATE (obs:Observation {
                    value: 10.0,
                    timestamp: datetime() - duration('PT' + toString(i*12) + 'M'),
                    unit: 'μS/cm',
                    isTestData: true
                })
                CREATE (obs)-[:OBSERVED_BY]->(csIn)

                WITH ro, csOut, fs, ts
                UNWIND range(1, 5) AS i
                CREATE (obs:Observation {
                    value: 0.5,
                    timestamp: datetime() - duration('PT' + toString(i*12) + 'M'),
                    unit: 'μS/cm',
                    isTestData: true
                })
                CREATE (obs)-[:OBSERVED_BY]->(csOut)

                WITH ro, fs, ts
                UNWIND range(1, 5) AS i
                CREATE (obs:Observation {
                    value: 45.0,
                    timestamp: datetime() - duration('PT' + toString(i*12) + 'M'),
                    unit: 'm³/h',
                    isTestData: true
                })
                CREATE (obs)-[:OBSERVED_BY]->(fs)

                WITH ts
                UNWIND range(1, 5) AS i
                CREATE (obs:Observation {
                    value: 25.0,
                    timestamp: datetime() - duration('PT' + toString(i*12) + 'M'),
                    unit: '°C',
                    isTestData: true
                })
                CREATE (obs)-[:OBSERVED_BY]->(ts)

                RETURN count(*) AS created
            """)
            print(f"  ✓ 정상 RO 시스템 생성: {result.single()['created']} observations")

            # 정상 EDI 시스템
            result = session.run("""
                CREATE (edi:Equipment {
                    equipmentId: 'TEST-VALID-EDI-001',
                    name: 'Valid EDI System',
                    type: 'Electrodeionization',
                    healthScore: 89,
                    isTestData: true
                })

                // 전압 센서
                CREATE (vs:Sensor {
                    sensorId: 'TEST-VALID-EDI-001-VS',
                    name: 'Voltage Sensor',
                    type: 'VoltageSensor',
                    unit: 'V',
                    isTestData: true
                })

                // 전류 센서
                CREATE (cs:Sensor {
                    sensorId: 'TEST-VALID-EDI-001-CS',
                    name: 'Current Sensor',
                    type: 'CurrentSensor',
                    unit: 'A',
                    isTestData: true
                })

                // 관계 생성
                CREATE (edi)-[:HAS_SENSOR]->(vs)
                CREATE (vs)-[:IS_ATTACHED_TO]->(edi)
                CREATE (edi)-[:HAS_SENSOR]->(cs)
                CREATE (cs)-[:IS_ATTACHED_TO]->(edi)

                // 정상 관측값
                WITH vs, cs

                // 전압: 400V (정상 범위)
                UNWIND range(1, 5) AS i
                CREATE (obs:Observation {
                    value: 400.0,
                    timestamp: datetime() - duration('PT' + toString(i*12) + 'M'),
                    unit: 'V',
                    isTestData: true
                })
                CREATE (obs)-[:OBSERVED_BY]->(vs)

                WITH cs
                // 전류: 15A
                UNWIND range(1, 5) AS i
                CREATE (obs:Observation {
                    value: 15.0,
                    timestamp: datetime() - duration('PT' + toString(i*12) + 'M'),
                    unit: 'A',
                    isTestData: true
                })
                CREATE (obs)-[:OBSERVED_BY]->(cs)

                RETURN count(*) AS created
            """)
            print(f"  ✓ 정상 EDI 시스템 생성: {result.single()['created']} observations")

            # 정상 UV Sterilizer
            result = session.run("""
                CREATE (uv:Equipment {
                    equipmentId: 'TEST-VALID-UV-001',
                    name: 'Valid UV Sterilizer',
                    type: 'UVSterilizer',
                    healthScore: 94,
                    isTestData: true
                })

                // UV 강도 센서
                CREATE (uvs:Sensor {
                    sensorId: 'TEST-VALID-UV-001-UVS',
                    name: 'UV Intensity Sensor',
                    type: 'UVIntensitySensor',
                    unit: 'mW/cm²',
                    isTestData: true
                })

                // 관계 생성
                CREATE (uv)-[:HAS_SENSOR]->(uvs)
                CREATE (uvs)-[:IS_ATTACHED_TO]->(uv)

                // 정상 UV 강도: 45 mW/cm²
                WITH uvs
                UNWIND range(1, 5) AS i
                CREATE (obs:Observation {
                    value: 45.0,
                    timestamp: datetime() - duration('PT' + toString(i*12) + 'M'),
                    unit: 'mW/cm²',
                    isTestData: true
                })
                CREATE (obs)-[:OBSERVED_BY]->(uvs)

                RETURN count(*) AS created
            """)
            print(f"  ✓ 정상 UV Sterilizer 생성: {result.single()['created']} observations")

            # 공정 흐름 생성 (RO → EDI → UV)
            session.run("""
                MATCH (ro:Equipment {equipmentId: 'TEST-VALID-RO-001'})
                MATCH (edi:Equipment {equipmentId: 'TEST-VALID-EDI-001'})
                MATCH (uv:Equipment {equipmentId: 'TEST-VALID-UV-001'})

                CREATE (ro)-[:FEEDS_INTO]->(edi)
                CREATE (edi)-[:FEEDS_INTO]->(uv)
                CREATE (ro)-[:FEEDS_INTO]->(uv)
            """)
            print("  ✓ 정상 공정 흐름 생성 (RO → EDI → UV, 전이성 포함)")

    def print_summary(self):
        """생성된 데이터 요약"""
        with self.driver.session() as session:
            print("\n=== 생성된 테스트 데이터 요약 ===")

            # 노드 카운트
            result = session.run("""
                MATCH (n)
                WHERE n.isTestData = true
                RETURN labels(n)[0] AS label, count(*) AS count
                ORDER BY count DESC
            """)
            print("\n노드:")
            for record in result:
                print(f"  {record['label']}: {record['count']}")

            # 관계 카운트
            result = session.run("""
                MATCH (a)-[r]->(b)
                WHERE a.isTestData = true OR b.isTestData = true
                RETURN type(r) AS relType, count(*) AS count
                ORDER BY count DESC
            """)
            print("\n관계:")
            for record in result:
                print(f"  {record['relType']}: {record['count']}")

            # 총계
            result = session.run("""
                MATCH (n)
                WHERE n.isTestData = true
                WITH count(n) AS nodeCount
                MATCH (a)-[r]->(b)
                WHERE a.isTestData = true OR b.isTestData = true
                RETURN nodeCount, count(r) AS relCount
            """)
            record = result.single()
            print(f"\n총 노드: {record['nodeCount']}")
            print(f"총 관계: {record['relCount']}")


def main():
    # Neo4j 연결 정보
    URI = "bolt://localhost:7688"
    USER = "neo4j"
    PASSWORD = "upw_password_2024"

    generator = AxiomTestDataGenerator(URI, USER, PASSWORD)

    try:
        print("=" * 60)
        print("공리 및 제약조건 테스트 데이터 생성기")
        print("=" * 60)

        # 기존 테스트 데이터 삭제
        generator.clear_test_data()

        # 공리 위반 데이터 생성
        generator.generate_axiom_violation_data()

        # 제약조건 위반 데이터 생성
        generator.generate_constraint_violation_data()

        # 정상 데이터 생성
        generator.generate_valid_data()

        # 요약
        generator.print_summary()

        print("\n" + "=" * 60)
        print("✓ 테스트 데이터 생성 완료!")
        print("=" * 60)

    finally:
        generator.close()


if __name__ == "__main__":
    main()
