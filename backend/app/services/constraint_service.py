"""
Constraint Service

Defines and validates data constraints for the UPW ontology.
Constraints ensure data integrity and business rule compliance.
"""
from enum import Enum
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime


class ConstraintType(Enum):
    """Types of constraints supported"""
    REQUIRED_PROPERTY = "RequiredProperty"
    VALUE_RANGE = "ValueRange"
    CARDINALITY = "Cardinality"
    UNIQUENESS = "Uniqueness"
    PATTERN = "Pattern"
    DEPENDENCY = "Dependency"


class ConstraintSeverity(Enum):
    """Severity levels for constraint violations"""
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


@dataclass
class ConstraintViolation:
    """Represents a single constraint violation"""
    constraint_id: str
    node_id: Optional[str]
    description: str
    details: Dict[str, Any]


@dataclass
class ConstraintCheckResult:
    """Result of checking a constraint"""
    constraint_id: str
    constraint_name: str
    passed: bool
    violation_count: int
    violations: List[ConstraintViolation]
    checked_at: str


class Constraint:
    """Represents a single constraint"""

    def __init__(
        self,
        constraint_id: str,
        constraint_type: ConstraintType,
        name: str,
        description: str,
        check_query: str,
        node_type: Optional[str] = None,
        severity: ConstraintSeverity = ConstraintSeverity.MEDIUM,
        **metadata
    ):
        self.constraint_id = constraint_id
        self.constraint_type = constraint_type
        self.name = name
        self.description = description
        self.check_query = check_query
        self.node_type = node_type
        self.severity = severity
        self.metadata = metadata

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation"""
        result = {
            'constraintId': self.constraint_id,
            'type': self.constraint_type.value,
            'name': self.name,
            'description': self.description,
            'severity': self.severity.value,
            **self.metadata
        }
        if self.node_type:
            result['nodeType'] = self.node_type
        return result


class ConstraintService:
    """Service for managing and validating constraints"""

    # Define all constraints
    CONSTRAINTS = [
        Constraint(
            constraint_id='CONS001',
            constraint_type=ConstraintType.REQUIRED_PROPERTY,
            node_type='Equipment',
            name='필수 속성: 장비 ID',
            description='Equipment 노드는 equipmentId, name, type 속성을 반드시 가져야 합니다.',
            check_query='''
                MATCH (e:Equipment)
                WHERE e.equipmentId IS NULL
                   OR e.name IS NULL
                   OR e.type IS NULL
                WITH e,
                     CASE WHEN e.equipmentId IS NULL THEN 'equipmentId' ELSE NULL END AS missing1,
                     CASE WHEN e.name IS NULL THEN 'name' ELSE NULL END AS missing2,
                     CASE WHEN e.type IS NULL THEN 'type' ELSE NULL END AS missing3
                RETURN coalesce(e.equipmentId, id(e)) AS nodeId,
                       [prop IN [missing1, missing2, missing3] WHERE prop IS NOT NULL] AS missingProperties
            ''',
            severity=ConstraintSeverity.HIGH,
            properties=['equipmentId', 'name', 'type']
        ),

        Constraint(
            constraint_id='CONS002',
            constraint_type=ConstraintType.VALUE_RANGE,
            node_type='Equipment',
            name='healthScore 범위 제약',
            description='Equipment의 healthScore는 0에서 100 사이의 값이어야 합니다.',
            check_query='''
                MATCH (e:Equipment)
                WHERE e.healthScore IS NOT NULL
                  AND (e.healthScore < 0 OR e.healthScore > 100)
                RETURN e.equipmentId AS equipmentId,
                       e.healthScore AS invalidValue,
                       CASE
                           WHEN e.healthScore < 0 THEN 'Below minimum (0)'
                           WHEN e.healthScore > 100 THEN 'Above maximum (100)'
                       END AS violation
            ''',
            severity=ConstraintSeverity.HIGH,
            property='healthScore',
            min=0,
            max=100
        ),

        Constraint(
            constraint_id='CONS003',
            constraint_type=ConstraintType.CARDINALITY,
            node_type='Equipment',
            name='최소 센서 개수 제약',
            description='Equipment는 최소 1개의 센서를 가져야 합니다.',
            check_query='''
                MATCH (e:Equipment)
                OPTIONAL MATCH (e)-[:HAS_SENSOR]->(s:Sensor)
                WITH e, count(s) AS sensorCount
                WHERE sensorCount < 1
                RETURN e.equipmentId AS equipmentId,
                       sensorCount AS actualCount,
                       1 AS minimumRequired
            ''',
            severity=ConstraintSeverity.MEDIUM,
            relationship='HAS_SENSOR',
            min=1
        ),

        Constraint(
            constraint_id='CONS004',
            constraint_type=ConstraintType.UNIQUENESS,
            node_type='Equipment',
            name='장비 ID 유일성',
            description='Equipment의 equipmentId는 유일해야 합니다. 중복된 ID가 존재하면 안 됩니다.',
            check_query='''
                MATCH (e:Equipment)
                WHERE e.equipmentId IS NOT NULL
                WITH e.equipmentId AS id, collect(e) AS nodes, count(*) AS cnt
                WHERE cnt > 1
                RETURN id AS duplicateId,
                       cnt AS count,
                       [n IN nodes | id(n)] AS nodeIds
            ''',
            severity=ConstraintSeverity.CRITICAL,
            property='equipmentId'
        ),

        Constraint(
            constraint_id='CONS005',
            constraint_type=ConstraintType.VALUE_RANGE,
            node_type='Observation',
            name='온도 센서 범위',
            description='온도 센서의 관측값은 -50°C에서 200°C 사이여야 합니다.',
            check_query='''
                MATCH (s:Sensor)-[:HAS_OBSERVATION]->(o:Observation)
                WHERE s.type IN ['Temperature', 'TemperatureSensor']
                  AND o.value IS NOT NULL
                  AND (o.value < -50 OR o.value > 200)
                RETURN s.sensorId AS sensorId,
                       o.value AS invalidValue,
                       o.timestamp AS timestamp,
                       CASE
                           WHEN o.value < -50 THEN 'Below minimum (-50°C)'
                           WHEN o.value > 200 THEN 'Above maximum (200°C)'
                       END AS violation
                LIMIT 100
            ''',
            severity=ConstraintSeverity.MEDIUM,
            sensorType='Temperature',
            property='value',
            min=-50,
            max=200,
            unit='°C'
        ),

        # ====================================================================
        # UPW 도메인 특화 제약조건
        # ====================================================================

        Constraint(
            constraint_id='CONS006',
            constraint_type=ConstraintType.VALUE_RANGE,
            node_type='Observation',
            name='RO 압력 범위',
            description='RO(역삼투) 장비의 입력 압력은 8-15 bar 범위 내에 있어야 합니다.',
            check_query='''
                MATCH (ro:Equipment)-[:HAS_SENSOR]->(ps:Sensor)
                WHERE ro.type IN ['ReverseOsmosis', 'RO']
                  AND ps.type IN ['PressureSensor', 'Pressure']
                  AND ps.sensorId CONTAINS 'IN'
                MATCH (obs:Observation)-[:OBSERVED_BY]->(ps)
                WHERE obs.value IS NOT NULL
                  AND (obs.value < 8 OR obs.value > 15)
                RETURN ro.equipmentId AS equipmentId,
                       ps.sensorId AS sensorId,
                       obs.value AS invalidValue,
                       CASE
                           WHEN obs.value < 8 THEN 'Below minimum (8 bar)'
                           WHEN obs.value > 15 THEN 'Above maximum (15 bar)'
                       END AS violation
                LIMIT 50
            ''',
            severity=ConstraintSeverity.HIGH,
            property='value',
            min=8,
            max=15,
            unit='bar'
        ),

        Constraint(
            constraint_id='CONS007',
            constraint_type=ConstraintType.VALUE_RANGE,
            node_type='Observation',
            name='EDI 전압 범위',
            description='EDI 장비의 전압은 200-600V 범위 내에 있어야 정상 작동합니다.',
            check_query='''
                MATCH (edi:Equipment)-[:HAS_SENSOR]->(vs:Sensor)
                WHERE edi.type IN ['Electrodeionization', 'EDI']
                  AND vs.type IN ['VoltageSensor', 'Voltage']
                MATCH (obs:Observation)-[:OBSERVED_BY]->(vs)
                WHERE obs.value IS NOT NULL
                  AND (obs.value < 200 OR obs.value > 600)
                RETURN edi.equipmentId AS equipmentId,
                       vs.sensorId AS sensorId,
                       obs.value AS invalidValue,
                       CASE
                           WHEN obs.value < 200 THEN 'Below minimum (200V)'
                           WHEN obs.value > 600 THEN 'Above maximum (600V)'
                       END AS violation
                LIMIT 50
            ''',
            severity=ConstraintSeverity.HIGH,
            property='value',
            min=200,
            max=600,
            unit='V'
        ),

        Constraint(
            constraint_id='CONS008',
            constraint_type=ConstraintType.VALUE_RANGE,
            node_type='Observation',
            name='UV 강도 최소값',
            description='UV Sterilizer의 UV 강도는 30 mW/cm² 이상이어야 효과적인 살균이 가능합니다.',
            check_query='''
                MATCH (uv:Equipment)-[:HAS_SENSOR]->(uvs:Sensor)
                WHERE uv.type IN ['UVSterilizer', 'UV']
                  AND uvs.type IN ['UVIntensitySensor', 'UVIntensity']
                MATCH (obs:Observation)-[:OBSERVED_BY]->(uvs)
                WHERE obs.value IS NOT NULL
                  AND obs.value < 30
                RETURN uv.equipmentId AS equipmentId,
                       uvs.sensorId AS sensorId,
                       obs.value AS invalidValue,
                       'Below minimum effective UV intensity (30 mW/cm²)' AS violation
                LIMIT 50
            ''',
            severity=ConstraintSeverity.MEDIUM,
            property='value',
            min=30,
            unit='mW/cm²'
        ),

        Constraint(
            constraint_id='CONS009',
            constraint_type=ConstraintType.VALUE_RANGE,
            node_type='Observation',
            name='출력 전도도 최대값',
            description='초순수 출력 전도도는 1.0 μS/cm 이하여야 합니다.',
            check_query='''
                MATCH (e:Equipment)-[:HAS_SENSOR]->(cs:Sensor)
                WHERE cs.type IN ['ConductivitySensor', 'Conductivity']
                  AND cs.sensorId CONTAINS 'OUT'
                MATCH (obs:Observation)-[:OBSERVED_BY]->(cs)
                WHERE obs.value IS NOT NULL
                  AND obs.value > 1.0
                RETURN e.equipmentId AS equipmentId,
                       cs.sensorId AS sensorId,
                       obs.value AS invalidValue,
                       'Above maximum UPW conductivity (1.0 μS/cm)' AS violation
                LIMIT 50
            ''',
            severity=ConstraintSeverity.CRITICAL,
            property='value',
            max=1.0,
            unit='μS/cm'
        ),

        Constraint(
            constraint_id='CONS010',
            constraint_type=ConstraintType.VALUE_RANGE,
            node_type='Observation',
            name='유량 최소값',
            description='RO 장비의 유량은 30 m³/h 이상이어야 정상 생산량을 유지합니다.',
            check_query='''
                MATCH (ro:Equipment)-[:HAS_SENSOR]->(fs:Sensor)
                WHERE ro.type IN ['ReverseOsmosis', 'RO']
                  AND fs.type IN ['FlowSensor', 'Flow']
                MATCH (obs:Observation)-[:OBSERVED_BY]->(fs)
                WHERE obs.value IS NOT NULL
                  AND obs.value < 30
                RETURN ro.equipmentId AS equipmentId,
                       fs.sensorId AS sensorId,
                       obs.value AS invalidValue,
                       'Below minimum production flow rate (30 m³/h)' AS violation
                LIMIT 50
            ''',
            severity=ConstraintSeverity.MEDIUM,
            property='value',
            min=30,
            unit='m³/h'
        ),

        Constraint(
            constraint_id='CONS011',
            constraint_type=ConstraintType.VALUE_RANGE,
            node_type='Equipment',
            name='RO 가동 시간 제한',
            description='RO 장비의 연속 가동 시간은 8000시간을 초과하면 막 교체가 필요합니다.',
            check_query='''
                MATCH (ro:Equipment)
                WHERE ro.type IN ['ReverseOsmosis', 'RO']
                  AND ro.operatingHours IS NOT NULL
                  AND ro.operatingHours > 8000
                RETURN ro.equipmentId AS equipmentId,
                       ro.operatingHours AS invalidValue,
                       'Operating hours exceed membrane replacement threshold (8000h)' AS violation
            ''',
            severity=ConstraintSeverity.HIGH,
            property='operatingHours',
            max=8000,
            unit='hours'
        ),
    ]

    def __init__(self, driver):
        """
        Initialize ConstraintService

        Args:
            driver: Neo4j driver instance
        """
        self.driver = driver

    def get_all_constraints(self) -> List[Dict[str, Any]]:
        """
        Get all defined constraints

        Returns:
            List of constraint dictionaries
        """
        return [constraint.to_dict() for constraint in self.CONSTRAINTS]

    def get_constraint(self, constraint_id: str) -> Optional[Constraint]:
        """
        Get a specific constraint by ID

        Args:
            constraint_id: Constraint identifier

        Returns:
            Constraint instance or None if not found
        """
        for constraint in self.CONSTRAINTS:
            if constraint.constraint_id == constraint_id:
                return constraint
        return None

    def validate_constraint(self, constraint_id: str) -> ConstraintCheckResult:
        """
        Validate a specific constraint

        Args:
            constraint_id: Constraint identifier

        Returns:
            ConstraintCheckResult with violation details
        """
        constraint = self.get_constraint(constraint_id)
        if not constraint:
            raise ValueError(f"Constraint not found: {constraint_id}")

        violations = []

        with self.driver.session() as session:
            # Execute constraint check query
            result = session.run(constraint.check_query)
            records = list(result)

            # Process violations
            for record in records:
                record_dict = dict(record)
                violation = ConstraintViolation(
                    constraint_id=constraint_id,
                    node_id=record_dict.get('nodeId') or record_dict.get('equipmentId') or record_dict.get('sensorId'),
                    description=record_dict.get('violation', f'Constraint {constraint_id} violation'),
                    details=record_dict
                )
                violations.append(violation)

        return ConstraintCheckResult(
            constraint_id=constraint_id,
            constraint_name=constraint.name,
            passed=len(violations) == 0,
            violation_count=len(violations),
            violations=violations,
            checked_at=datetime.now().isoformat()
        )

    def validate_all_constraints(self) -> Dict[str, Any]:
        """
        Validate all constraints

        Returns:
            Dictionary with results for all constraints
        """
        results = []
        total_violations = 0

        for constraint in self.CONSTRAINTS:
            result = self.validate_constraint(constraint.constraint_id)
            total_violations += result.violation_count
            results.append({
                'constraintId': result.constraint_id,
                'constraintName': result.constraint_name,
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
            'totalConstraints': len(self.CONSTRAINTS),
            'passedConstraints': sum(1 for r in results if r['passed']),
            'failedConstraints': sum(1 for r in results if not r['passed']),
            'totalViolations': total_violations,
            'results': results,
            'checkedAt': datetime.now().isoformat()
        }
