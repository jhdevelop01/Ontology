"""
Reasoning/Inference Service for UPW Ontology

This service implements rule-based reasoning to infer new knowledge
from existing data in the ontology.
"""

from typing import List, Dict, Any, Optional
from neo4j import GraphDatabase
from flask import current_app
from datetime import datetime


class ReasoningService:
    """Service for ontology reasoning and inference"""

    # Define inference rules
    RULES = [
        {
            'id': 'rule_maintenance_needed',
            'name': 'Maintenance Needed Rule',
            'description': 'Equipment with health score < 60 needs maintenance',
            'category': 'maintenance',
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
            'name': 'Anomaly Detection Rule',
            'description': 'Detect anomalies from sensor readings outside normal range',
            'category': 'anomaly',
            'query': '''
                MATCH (s:Sensor)-[:BELONGS_TO]->(e:Equipment)
                MATCH (o:Observation)-[:OBSERVED_BY]->(s)
                WHERE o.timestamp > datetime() - duration('P1D')
                WITH e, s, o,
                     CASE s.sensorType
                         WHEN 'Pressure' THEN CASE WHEN o.value < 1 OR o.value > 10 THEN true ELSE false END
                         WHEN 'Temperature' THEN CASE WHEN o.value < 10 OR o.value > 50 THEN true ELSE false END
                         WHEN 'Conductivity' THEN CASE WHEN o.value > 15 THEN true ELSE false END
                         WHEN 'Vibration' THEN CASE WHEN o.value > 8 THEN true ELSE false END
                         ELSE false
                     END AS isAnomalous
                WHERE isAnomalous = true
                AND NOT EXISTS {
                    MATCH (e)-[:HAS_ANOMALY]->(a:Anomaly:Inferred)
                    WHERE a.sensorId = s.sensorId AND a.timestamp > datetime() - duration('PT1H')
                }
                RETURN DISTINCT e.equipmentId AS equipmentId, s.sensorId AS sensorId,
                       s.sensorType AS sensorType, o.value AS value,
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
            'name': 'Failure Prediction Rule',
            'description': 'Predict potential failures based on sensor trends',
            'category': 'prediction',
            'query': '''
                MATCH (e:Equipment)-[:HAS_SENSOR]->(s:Sensor)
                WHERE s.sensorType IN ['Vibration', 'Temperature', 'Pressure']
                MATCH (o:Observation)-[:OBSERVED_BY]->(s)
                WHERE o.timestamp > datetime() - duration('P7D')
                WITH e, s, collect(o.value) AS values
                WHERE size(values) > 10
                WITH e, s, values,
                     reduce(sum = 0.0, v IN values | sum + v) / size(values) AS avgValue,
                     values[-1] AS latestValue
                WHERE latestValue > avgValue * 1.3
                AND NOT EXISTS {
                    MATCH (e)-[:MAY_FAIL]->(f:FailurePrediction:Inferred)
                    WHERE f.timestamp > datetime() - duration('P1D')
                }
                RETURN e.equipmentId AS equipmentId, e.name AS name,
                       s.sensorType AS sensorType, avgValue, latestValue,
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
            'name': 'Equipment Dependency Rule',
            'description': 'Infer equipment dependencies based on process flow',
            'category': 'structure',
            'query': '''
                MATCH (a:ProcessArea)-[:CONTAINS]->(e1:Equipment)
                MATCH (a)-[:CONTAINS]->(e2:Equipment)
                WHERE e1 <> e2
                AND e1.equipmentType IN ['ReverseOsmosis', 'Electrodeionization']
                AND e2.equipmentType IN ['UVSterilizer', 'StorageTank']
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
            'name': 'Sensor Correlation Rule',
            'description': 'Identify correlated sensors on same equipment',
            'category': 'analysis',
            'query': '''
                MATCH (e:Equipment)-[:HAS_SENSOR]->(s1:Sensor)
                MATCH (e)-[:HAS_SENSOR]->(s2:Sensor)
                WHERE s1 <> s2
                AND s1.sensorType = 'Pressure' AND s2.sensorType = 'Flow'
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
    def get_driver(cls):
        """Get Neo4j driver"""
        uri = current_app.config.get('NEO4J_URI', 'bolt://localhost:7688')
        user = current_app.config.get('NEO4J_USER', 'neo4j')
        password = current_app.config.get('NEO4J_PASSWORD', 'upw_password_2024')
        return GraphDatabase.driver(uri, auth=(user, password))

    @classmethod
    def get_rules(cls) -> List[Dict[str, Any]]:
        """Get all inference rules"""
        return [
            {
                'id': rule['id'],
                'name': rule['name'],
                'description': rule['description'],
                'category': rule['category']
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

        driver = cls.get_driver()
        try:
            with driver.session() as session:
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
        finally:
            driver.close()

    @classmethod
    def apply_rule(cls, rule_id: str) -> Dict[str, Any]:
        """Apply a specific rule and create inferred relationships"""
        rule = cls.get_rule_by_id(rule_id)
        if not rule:
            return {'status': 'error', 'message': f'Rule {rule_id} not found'}

        driver = cls.get_driver()
        try:
            with driver.session() as session:
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
        finally:
            driver.close()

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
        driver = cls.get_driver()
        try:
            with driver.session() as session:
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
        finally:
            driver.close()

    @classmethod
    def clear_inferred_facts(cls) -> Dict[str, Any]:
        """Remove all inferred facts"""
        driver = cls.get_driver()
        try:
            with driver.session() as session:
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
        finally:
            driver.close()

    @classmethod
    def get_inference_statistics(cls) -> Dict[str, Any]:
        """Get statistics about inferred knowledge"""
        driver = cls.get_driver()
        try:
            with driver.session() as session:
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
        finally:
            driver.close()
