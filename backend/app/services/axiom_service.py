"""
Axiom Service

Defines and validates OWL axioms for the UPW ontology.
Axioms are formal constraints that must always hold true in the ontology.
"""
from enum import Enum
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime


class AxiomType(Enum):
    """Types of axioms supported"""
    DISJOINT_CLASSES = "DisjointClasses"
    PROPERTY_DOMAIN = "PropertyDomain"
    PROPERTY_RANGE = "PropertyRange"
    INVERSE_PROPERTY = "InverseProperty"
    TRANSITIVE_PROPERTY = "TransitiveProperty"
    SYMMETRIC_PROPERTY = "SymmetricProperty"
    FUNCTIONAL_PROPERTY = "FunctionalProperty"
    INVERSE_FUNCTIONAL = "InverseFunctionalProperty"


class AxiomSeverity(Enum):
    """Severity levels for axiom violations"""
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


@dataclass
class AxiomViolation:
    """Represents a single axiom violation"""
    axiom_id: str
    node_id: Optional[str]
    description: str
    details: Dict[str, Any]


@dataclass
class AxiomCheckResult:
    """Result of checking an axiom"""
    axiom_id: str
    axiom_name: str
    passed: bool
    violation_count: int
    violations: List[AxiomViolation]
    checked_at: str


class Axiom:
    """Represents a single axiom"""

    def __init__(
        self,
        axiom_id: str,
        axiom_type: AxiomType,
        name: str,
        description: str,
        check_query: str,
        severity: AxiomSeverity = AxiomSeverity.MEDIUM,
        **metadata
    ):
        self.axiom_id = axiom_id
        self.axiom_type = axiom_type
        self.name = name
        self.description = description
        self.check_query = check_query
        self.severity = severity
        self.metadata = metadata

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation"""
        return {
            'axiomId': self.axiom_id,
            'type': self.axiom_type.value,
            'name': self.name,
            'description': self.description,
            'severity': self.severity.value,
            **self.metadata
        }


class AxiomService:
    """Service for managing and validating axioms"""

    # Define all axioms
    AXIOMS = [
        Axiom(
            axiom_id='AX001',
            axiom_type=AxiomType.DISJOINT_CLASSES,
            name='장비-센서 분리 공리',
            description='Equipment와 Sensor는 서로 다른 클래스입니다. 하나의 노드가 동시에 Equipment와 Sensor가 될 수 없습니다.',
            check_query='''
                MATCH (n)
                WHERE 'Equipment' IN labels(n) AND 'Sensor' IN labels(n)
                RETURN n.equipmentId AS nodeId,
                       labels(n) AS labels
            ''',
            severity=AxiomSeverity.HIGH,
            classes=['Equipment', 'Sensor']
        ),

        Axiom(
            axiom_id='AX002',
            axiom_type=AxiomType.PROPERTY_DOMAIN,
            name='healthScore 도메인 제약',
            description='healthScore 속성은 Equipment 노드에만 사용할 수 있습니다.',
            check_query='''
                MATCH (n)
                WHERE n.healthScore IS NOT NULL
                  AND NOT 'Equipment' IN labels(n)
                RETURN id(n) AS nodeId,
                       labels(n) AS labels,
                       n.healthScore AS healthScore
            ''',
            severity=AxiomSeverity.HIGH,
            property='healthScore',
            domain='Equipment'
        ),

        Axiom(
            axiom_id='AX003',
            axiom_type=AxiomType.INVERSE_PROPERTY,
            name='hasSensor-isAttachedTo 역관계',
            description='HAS_SENSOR와 IS_ATTACHED_TO는 역관계입니다. HAS_SENSOR 관계가 있으면 반드시 IS_ATTACHED_TO 역관계도 존재해야 합니다.',
            check_query='''
                MATCH (e:Equipment)-[:HAS_SENSOR]->(s:Sensor)
                WHERE NOT EXISTS((s)-[:IS_ATTACHED_TO]->(e))
                RETURN e.equipmentId AS equipmentId,
                       s.sensorId AS sensorId,
                       'Missing IS_ATTACHED_TO inverse relationship' AS issue
                UNION
                MATCH (s:Sensor)-[:IS_ATTACHED_TO]->(e:Equipment)
                WHERE NOT EXISTS((e)-[:HAS_SENSOR]->(s))
                RETURN e.equipmentId AS equipmentId,
                       s.sensorId AS sensorId,
                       'Missing HAS_SENSOR inverse relationship' AS issue
            ''',
            severity=AxiomSeverity.MEDIUM,
            property1='HAS_SENSOR',
            property2='IS_ATTACHED_TO'
        ),

        Axiom(
            axiom_id='AX004',
            axiom_type=AxiomType.TRANSITIVE_PROPERTY,
            name='FEEDS_INTO 전이성',
            description='FEEDS_INTO는 전이적 관계입니다. A→B, B→C이면 A→C도 성립해야 합니다.',
            check_query='''
                MATCH (a:Equipment)-[:FEEDS_INTO]->(b:Equipment)-[:FEEDS_INTO]->(c:Equipment)
                WHERE a <> c
                  AND NOT EXISTS((a)-[:FEEDS_INTO]->(c))
                RETURN a.equipmentId AS from,
                       b.equipmentId AS via,
                       c.equipmentId AS to,
                       'Missing transitive FEEDS_INTO relationship' AS issue
            ''',
            severity=AxiomSeverity.LOW,
            property='FEEDS_INTO'
        ),

        Axiom(
            axiom_id='AX005',
            axiom_type=AxiomType.FUNCTIONAL_PROPERTY,
            name='healthScore 단일값 제약',
            description='healthScore는 함수적 속성입니다. 각 Equipment는 정확히 하나의 healthScore 값만 가져야 합니다.',
            check_query='''
                // Neo4j에서 속성은 항상 단일값이므로 이 체크는 항상 통과
                // 대신 healthScore가 있어야 하는 Equipment가 없는 경우를 체크
                MATCH (e:Equipment)
                WHERE e.healthScore IS NULL
                RETURN e.equipmentId AS equipmentId,
                       'Missing healthScore property' AS issue
            ''',
            severity=AxiomSeverity.MEDIUM,
            property='healthScore'
        ),

        # ====================================================================
        # UPW 도메인 특화 공리
        # ====================================================================

        Axiom(
            axiom_id='AX006',
            axiom_type=AxiomType.PROPERTY_DOMAIN,
            name='RO 수질 개선 공리',
            description='RO(역삼투) 장비의 출력 전도도는 입력 전도도보다 낮아야 합니다.',
            check_query='''
                MATCH (ro:Equipment)
                WHERE ro.type IN ['ReverseOsmosis', 'RO']
                MATCH (ro)-[:HAS_SENSOR]->(csIn:Sensor {type: 'ConductivitySensor'})
                WHERE csIn.sensorId CONTAINS 'IN'
                MATCH (ro)-[:HAS_SENSOR]->(csOut:Sensor {type: 'ConductivitySensor'})
                WHERE csOut.sensorId CONTAINS 'OUT'
                MATCH (obsIn:Observation)-[:OBSERVED_BY]->(csIn)
                MATCH (obsOut:Observation)-[:OBSERVED_BY]->(csOut)
                WHERE obsIn.timestamp > datetime() - duration('PT1H')
                  AND obsOut.timestamp > datetime() - duration('PT1H')
                WITH ro, avg(obsIn.value) AS avgIn, avg(obsOut.value) AS avgOut
                WHERE avgOut >= avgIn
                RETURN ro.equipmentId AS equipmentId,
                       avgIn AS inputConductivity,
                       avgOut AS outputConductivity,
                       'RO output conductivity must be lower than input' AS issue
            ''',
            severity=AxiomSeverity.HIGH,
            domain='ReverseOsmosis'
        ),

        Axiom(
            axiom_id='AX007',
            axiom_type=AxiomType.PROPERTY_DOMAIN,
            name='EDI 필수 센서 공리',
            description='EDI 장비는 전압 센서와 전류 센서를 반드시 가져야 합니다.',
            check_query='''
                MATCH (edi:Equipment)
                WHERE edi.type IN ['Electrodeionization', 'EDI']
                OPTIONAL MATCH (edi)-[:HAS_SENSOR]->(vs:Sensor)
                WHERE vs.type IN ['VoltageSensor', 'Voltage']
                OPTIONAL MATCH (edi)-[:HAS_SENSOR]->(cs:Sensor)
                WHERE cs.type IN ['CurrentSensor', 'Current']
                WITH edi, count(DISTINCT vs) > 0 AS hasVoltage, count(DISTINCT cs) > 0 AS hasCurrent
                WHERE NOT hasVoltage OR NOT hasCurrent
                RETURN edi.equipmentId AS equipmentId,
                       hasVoltage AS hasVoltageSensor,
                       hasCurrent AS hasCurrentSensor,
                       CASE
                           WHEN NOT hasVoltage AND NOT hasCurrent THEN 'Missing both Voltage and Current sensors'
                           WHEN NOT hasVoltage THEN 'Missing Voltage sensor'
                           ELSE 'Missing Current sensor'
                       END AS issue
            ''',
            severity=AxiomSeverity.HIGH,
            domain='Electrodeionization'
        ),

        Axiom(
            axiom_id='AX008',
            axiom_type=AxiomType.PROPERTY_DOMAIN,
            name='UV 살균 센서 공리',
            description='UV Sterilizer는 UV 강도 센서를 반드시 가져야 합니다.',
            check_query='''
                MATCH (uv:Equipment)
                WHERE uv.type IN ['UVSterilizer', 'UV']
                OPTIONAL MATCH (uv)-[:HAS_SENSOR]->(s:Sensor)
                WHERE s.type IN ['UVIntensitySensor', 'UVIntensity']
                WITH uv, count(s) AS uvSensorCount
                WHERE uvSensorCount = 0
                RETURN uv.equipmentId AS equipmentId,
                       'Missing UV Intensity sensor' AS issue
            ''',
            severity=AxiomSeverity.HIGH,
            domain='UVSterilizer'
        ),

        Axiom(
            axiom_id='AX009',
            axiom_type=AxiomType.PROPERTY_RANGE,
            name='공정 순서 공리',
            description='RO는 EDI보다 공정 순서상 앞에 위치해야 합니다.',
            check_query='''
                MATCH (ro:Equipment {type: 'ReverseOsmosis'})-[:FEEDS_INTO*]->(edi:Equipment {type: 'Electrodeionization'})
                WITH ro, edi
                MATCH path = (edi)-[:FEEDS_INTO*]->(ro)
                RETURN ro.equipmentId AS roId,
                       edi.equipmentId AS ediId,
                       'Process flow violation: EDI should not feed into RO' AS issue
            ''',
            severity=AxiomSeverity.HIGH,
            domain='ProcessFlow'
        ),

        Axiom(
            axiom_id='AX010',
            axiom_type=AxiomType.PROPERTY_RANGE,
            name='압력차 이상 공리',
            description='RO 장비의 입출력 압력차가 1.5 bar를 초과하면 막힘 가능성이 있습니다.',
            check_query='''
                MATCH (ro:Equipment)
                WHERE ro.type IN ['ReverseOsmosis', 'RO']
                MATCH (ro)-[:HAS_SENSOR]->(psIn:Sensor)
                WHERE psIn.type IN ['PressureSensor', 'Pressure'] AND psIn.sensorId CONTAINS 'IN'
                MATCH (ro)-[:HAS_SENSOR]->(psOut:Sensor)
                WHERE psOut.type IN ['PressureSensor', 'Pressure'] AND psOut.sensorId CONTAINS 'OUT'
                MATCH (obsIn:Observation)-[:OBSERVED_BY]->(psIn)
                MATCH (obsOut:Observation)-[:OBSERVED_BY]->(psOut)
                WHERE obsIn.timestamp > datetime() - duration('PT1H')
                  AND obsOut.timestamp > datetime() - duration('PT1H')
                WITH ro, avg(obsIn.value) AS avgPressureIn, avg(obsOut.value) AS avgPressureOut
                WITH ro, avgPressureIn, avgPressureOut, (avgPressureIn - avgPressureOut) AS pressureDiff
                WHERE pressureDiff > 1.5
                RETURN ro.equipmentId AS equipmentId,
                       pressureDiff AS pressureDifference,
                       'High pressure differential indicates potential membrane fouling' AS issue
            ''',
            severity=AxiomSeverity.MEDIUM,
            domain='ReverseOsmosis'
        ),

        Axiom(
            axiom_id='AX011',
            axiom_type=AxiomType.PROPERTY_RANGE,
            name='전도도 증가 추세 공리',
            description='출력 전도도가 증가 추세이면 멤브레인 노화를 나타냅니다.',
            check_query='''
                MATCH (e:Equipment)-[:HAS_SENSOR]->(cs:Sensor)
                WHERE cs.type IN ['ConductivitySensor', 'Conductivity']
                  AND cs.sensorId CONTAINS 'OUT'
                MATCH (obs:Observation)-[:OBSERVED_BY]->(cs)
                WHERE obs.timestamp > datetime() - duration('P7D')
                WITH e, cs, obs
                ORDER BY obs.timestamp ASC
                WITH e, cs, collect(obs.value) AS values
                WHERE size(values) >= 5
                WITH e, cs, values,
                     values[0] AS firstValue,
                     values[-1] AS lastValue
                WHERE lastValue > firstValue * 1.2
                RETURN e.equipmentId AS equipmentId,
                       cs.sensorId AS sensorId,
                       firstValue AS initialConductivity,
                       lastValue AS currentConductivity,
                       'Increasing conductivity trend indicates membrane aging' AS issue
            ''',
            severity=AxiomSeverity.MEDIUM,
            domain='WaterQuality'
        ),
    ]

    def __init__(self, driver):
        """
        Initialize AxiomService

        Args:
            driver: Neo4j driver instance
        """
        self.driver = driver

    def get_all_axioms(self) -> List[Dict[str, Any]]:
        """
        Get all defined axioms

        Returns:
            List of axiom dictionaries
        """
        return [axiom.to_dict() for axiom in self.AXIOMS]

    def get_axiom(self, axiom_id: str) -> Optional[Axiom]:
        """
        Get a specific axiom by ID

        Args:
            axiom_id: Axiom identifier

        Returns:
            Axiom instance or None if not found
        """
        for axiom in self.AXIOMS:
            if axiom.axiom_id == axiom_id:
                return axiom
        return None

    def check_axiom(self, axiom_id: str) -> AxiomCheckResult:
        """
        Check a specific axiom for violations

        Args:
            axiom_id: Axiom identifier

        Returns:
            AxiomCheckResult with violation details
        """
        axiom = self.get_axiom(axiom_id)
        if not axiom:
            raise ValueError(f"Axiom not found: {axiom_id}")

        violations = []

        with self.driver.session() as session:
            # Execute axiom check query
            result = session.run(axiom.check_query)
            records = list(result)

            # Process violations
            for record in records:
                record_dict = dict(record)
                violation = AxiomViolation(
                    axiom_id=axiom_id,
                    node_id=record_dict.get('nodeId') or record_dict.get('equipmentId'),
                    description=record_dict.get('issue', f'Axiom {axiom_id} violation'),
                    details=record_dict
                )
                violations.append(violation)

        return AxiomCheckResult(
            axiom_id=axiom_id,
            axiom_name=axiom.name,
            passed=len(violations) == 0,
            violation_count=len(violations),
            violations=violations,
            checked_at=datetime.now().isoformat()
        )

    def check_all_axioms(self) -> Dict[str, Any]:
        """
        Check all axioms for violations

        Returns:
            Dictionary with results for all axioms
        """
        results = []
        total_violations = 0

        for axiom in self.AXIOMS:
            result = self.check_axiom(axiom.axiom_id)
            total_violations += result.violation_count
            results.append({
                'axiomId': result.axiom_id,
                'axiomName': result.axiom_name,
                'passed': result.passed,
                'violationCount': result.violation_count,
                'violations': [
                    {
                        'nodeId': v.node_id,
                        'description': v.description,
                        'details': v.details
                    }
                    for v in result.violations
                ]
            })

        return {
            'status': 'success',
            'totalAxioms': len(self.AXIOMS),
            'passedAxioms': sum(1 for r in results if r['passed']),
            'failedAxioms': sum(1 for r in results if not r['passed']),
            'totalViolations': total_violations,
            'results': results,
            'checkedAt': datetime.now().isoformat()
        }
