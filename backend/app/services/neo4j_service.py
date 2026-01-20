"""
Neo4j Service - Database connection and query management for UPW Process Data
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, date
from contextlib import contextmanager

from neo4j import GraphDatabase
from neo4j.time import Date as Neo4jDate, DateTime as Neo4jDateTime
from flask import current_app


class Neo4jService:
    """Service class for Neo4j database operations"""

    _driver = None

    @classmethod
    def get_driver(cls):
        """Get or create Neo4j driver instance"""
        if cls._driver is None:
            uri = current_app.config.get('NEO4J_URI', 'bolt://localhost:7688')
            user = current_app.config.get('NEO4J_USER', 'neo4j')
            password = current_app.config.get('NEO4J_PASSWORD', 'upw_password_2024')
            cls._driver = GraphDatabase.driver(uri, auth=(user, password))
        return cls._driver

    @classmethod
    def close(cls):
        """Close the driver connection"""
        if cls._driver:
            cls._driver.close()
            cls._driver = None

    @classmethod
    @contextmanager
    def session(cls):
        """Context manager for database sessions"""
        driver = cls.get_driver()
        session = driver.session()
        try:
            yield session
        finally:
            session.close()

    @staticmethod
    def _serialize_value(value):
        """Convert Neo4j types to JSON-serializable types"""
        if isinstance(value, (Neo4jDate, Neo4jDateTime)):
            return value.iso_format()
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        if isinstance(value, list):
            return [Neo4jService._serialize_value(v) for v in value]
        return value

    @staticmethod
    def _serialize_record(record: Dict) -> Dict:
        """Serialize a record dictionary"""
        return {k: Neo4jService._serialize_value(v) for k, v in record.items()}

    # =========================================================================
    # Process Area Operations
    # =========================================================================

    @classmethod
    def get_all_process_areas(cls) -> List[Dict[str, Any]]:
        """Get all process areas"""
        query = """
        MATCH (a:ProcessArea)
        OPTIONAL MATCH (a)-[:FEEDS_INTO]->(next:ProcessArea)
        RETURN a.areaId AS areaId,
               a.name AS name,
               a.nameEn AS nameEn,
               a.description AS description,
               collect(next.areaId) AS feedsTo
        ORDER BY a.areaId
        """
        with cls.session() as session:
            result = session.run(query)
            return [cls._serialize_record(dict(r)) for r in result]

    # =========================================================================
    # Equipment Operations
    # =========================================================================

    @classmethod
    def get_all_equipment(cls) -> List[Dict[str, Any]]:
        """Get all equipment with their basic info"""
        query = """
        MATCH (e:Equipment)
        OPTIONAL MATCH (e)-[:LOCATED_IN]->(a:ProcessArea)
        OPTIONAL MATCH (e)-[:HAS_SENSOR]->(s:Sensor)
        RETURN e.equipmentId AS equipmentId,
               e.name AS name,
               e.nameEn AS nameEn,
               e.type AS type,
               e.category AS category,
               e.manufacturer AS manufacturer,
               e.model AS model,
               e.installDate AS installDate,
               e.ratedPower AS ratedPower,
               e.operatingHours AS operatingHours,
               e.healthScore AS healthScore,
               e.status AS status,
               a.areaId AS areaId,
               a.name AS areaName,
               count(s) AS sensorCount
        ORDER BY e.equipmentId
        """
        with cls.session() as session:
            result = session.run(query)
            return [cls._serialize_record(dict(r)) for r in result]

    @classmethod
    def get_equipment_by_id(cls, equipment_id: str) -> Optional[Dict[str, Any]]:
        """Get equipment by ID with all related data"""
        query = """
        MATCH (e:Equipment {equipmentId: $equipment_id})
        OPTIONAL MATCH (e)-[:LOCATED_IN]->(a:ProcessArea)
        OPTIONAL MATCH (e)-[:HAS_SENSOR]->(s:Sensor)
        OPTIONAL MATCH (e)-[:HAS_FAILURE_MODE]->(f:FailureMode)
        OPTIONAL MATCH (e)<-[:FOR_EQUIPMENT]-(m:Maintenance)
        OPTIONAL MATCH (e)<-[:DETECTED_ON]-(anom:Anomaly)
        RETURN e.equipmentId AS equipmentId,
               e.name AS name,
               e.nameEn AS nameEn,
               e.type AS type,
               e.category AS category,
               e.manufacturer AS manufacturer,
               e.model AS model,
               e.installDate AS installDate,
               e.ratedPower AS ratedPower,
               e.operatingHours AS operatingHours,
               e.healthScore AS healthScore,
               e.status AS status,
               e.specs AS specs,
               a.areaId AS areaId,
               a.name AS areaName,
               collect(DISTINCT s.sensorId) AS sensorIds,
               collect(DISTINCT f.name) AS failureModes,
               count(DISTINCT m) AS maintenanceCount,
               count(DISTINCT anom) AS anomalyCount
        """
        with cls.session() as session:
            result = session.run(query, equipment_id=equipment_id)
            record = result.single()
            if record:
                return cls._serialize_record(dict(record))
            return None

    @classmethod
    def get_equipment_sensors(cls, equipment_id: str) -> List[Dict[str, Any]]:
        """Get all sensors for an equipment"""
        query = """
        MATCH (e:Equipment {equipmentId: $equipment_id})-[:HAS_SENSOR]->(s:Sensor)
        OPTIONAL MATCH (s)-[:HAS_OBSERVATION]->(o:Observation)
        WITH s, o
        ORDER BY o.timestamp DESC
        WITH s, collect(o)[0] AS latestObs
        RETURN s.sensorId AS sensorId,
               s.name AS name,
               s.type AS type,
               s.unit AS unit,
               s.min AS minValue,
               s.max AS maxValue,
               s.normalMin AS normalMin,
               s.normalMax AS normalMax,
               s.warning AS warningThreshold,
               s.critical AS criticalThreshold,
               latestObs.value AS latestValue,
               latestObs.timestamp AS latestTimestamp
        ORDER BY s.sensorId
        """
        with cls.session() as session:
            result = session.run(query, equipment_id=equipment_id)
            return [cls._serialize_record(dict(r)) for r in result]

    # =========================================================================
    # Sensor Operations
    # =========================================================================

    @classmethod
    def get_all_sensors(cls) -> List[Dict[str, Any]]:
        """Get all sensors"""
        query = """
        MATCH (e:Equipment)-[:HAS_SENSOR]->(s:Sensor)
        RETURN s.sensorId AS sensorId,
               s.name AS name,
               s.type AS type,
               s.unit AS unit,
               e.equipmentId AS equipmentId,
               e.name AS equipmentName
        ORDER BY s.sensorId
        """
        with cls.session() as session:
            result = session.run(query)
            return [cls._serialize_record(dict(r)) for r in result]

    @classmethod
    def get_sensor_by_id(cls, sensor_id: str) -> Optional[Dict[str, Any]]:
        """Get sensor by ID"""
        query = """
        MATCH (e:Equipment)-[:HAS_SENSOR]->(s:Sensor {sensorId: $sensor_id})
        RETURN s.sensorId AS sensorId,
               s.name AS name,
               s.type AS type,
               s.unit AS unit,
               s.min AS minValue,
               s.max AS maxValue,
               s.normalMin AS normalMin,
               s.normalMax AS normalMax,
               s.warning AS warningThreshold,
               s.critical AS criticalThreshold,
               e.equipmentId AS equipmentId,
               e.name AS equipmentName
        """
        with cls.session() as session:
            result = session.run(query, sensor_id=sensor_id)
            record = result.single()
            if record:
                return cls._serialize_record(dict(record))
            return None

    @classmethod
    def get_sensor_observations(cls, sensor_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Get observations for a sensor"""
        query = """
        MATCH (s:Sensor {sensorId: $sensor_id})-[:HAS_OBSERVATION]->(o:Observation)
        RETURN o.timestamp AS timestamp,
               o.value AS value,
               o.unit AS unit,
               o.quality AS quality
        ORDER BY o.timestamp DESC
        LIMIT $limit
        """
        with cls.session() as session:
            result = session.run(query, sensor_id=sensor_id, limit=limit)
            return [cls._serialize_record(dict(r)) for r in result]

    # =========================================================================
    # Maintenance Operations
    # =========================================================================

    @classmethod
    def get_maintenance_schedule(cls, equipment_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get scheduled maintenance activities"""
        query = """
        MATCH (m:Maintenance)-[:FOR_EQUIPMENT]->(e:Equipment)
        """
        params = {}
        if equipment_id:
            query += " WHERE e.equipmentId = $equipment_id"
            params['equipment_id'] = equipment_id

        query += """
        RETURN m.maintenanceId AS maintenanceId,
               m.type AS type,
               m.description AS description,
               m.scheduledDate AS scheduledDate,
               m.completedDate AS completedDate,
               m.status AS status,
               m.estimatedDuration AS estimatedDuration,
               m.priority AS priority,
               e.equipmentId AS equipmentId,
               e.name AS equipmentName
        ORDER BY
            CASE m.status
                WHEN 'Urgent' THEN 1
                WHEN 'In Progress' THEN 2
                WHEN 'Scheduled' THEN 3
                WHEN 'Planned' THEN 4
                ELSE 5
            END,
            m.scheduledDate
        """
        with cls.session() as session:
            result = session.run(query, **params)
            return [cls._serialize_record(dict(r)) for r in result]

    # =========================================================================
    # Anomaly Operations
    # =========================================================================

    @classmethod
    def get_anomaly_history(cls, equipment_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """Get anomaly detection history"""
        query = """
        MATCH (a:Anomaly)-[:DETECTED_ON]->(e:Equipment)
        OPTIONAL MATCH (a)-[:FROM_SENSOR]->(s:Sensor)
        """
        params = {'limit': limit}
        if equipment_id:
            query += " WHERE e.equipmentId = $equipment_id"
            params['equipment_id'] = equipment_id

        query += """
        RETURN a.anomalyId AS anomalyId,
               a.type AS type,
               a.description AS description,
               a.severity AS severity,
               a.detectedAt AS detectedAt,
               a.status AS status,
               a.recommendedAction AS recommendedAction,
               e.equipmentId AS equipmentId,
               e.name AS equipmentName,
               s.sensorId AS sensorId,
               s.name AS sensorName
        ORDER BY a.detectedAt DESC
        LIMIT $limit
        """
        with cls.session() as session:
            result = session.run(query, **params)
            return [cls._serialize_record(dict(r)) for r in result]

    # =========================================================================
    # Graph Data Operations
    # =========================================================================

    @classmethod
    def get_graph_data(cls, node_type: Optional[str] = None, center_id: Optional[str] = None, depth: int = 2) -> Dict[str, Any]:
        """Get graph data for visualization"""
        if center_id:
            # Get subgraph centered on a specific node
            query = """
            MATCH (center)
            WHERE center.equipmentId = $center_id
               OR center.sensorId = $center_id
               OR center.areaId = $center_id
            CALL {
                WITH center
                MATCH path = (center)-[*1..2]-(connected)
                RETURN path
            }
            WITH path
            UNWIND nodes(path) AS n
            UNWIND relationships(path) AS r
            WITH collect(DISTINCT n) AS nodes, collect(DISTINCT r) AS rels
            RETURN nodes, rels
            """
            params = {'center_id': center_id}
        else:
            # Get overview graph (equipment and process areas)
            query = """
            MATCH (e:Equipment)-[:LOCATED_IN]->(a:ProcessArea)
            OPTIONAL MATCH (a)-[f:FEEDS_INTO]->(a2:ProcessArea)
            OPTIONAL MATCH (e)-[feeds:FEEDS]->(e2:Equipment)
            WITH collect(DISTINCT e) + collect(DISTINCT a) + collect(DISTINCT a2) + collect(DISTINCT e2) AS allNodes,
                 collect(DISTINCT f) + collect(DISTINCT feeds) AS allRels
            MATCH (n) WHERE n IN allNodes
            OPTIONAL MATCH (n)-[r]->(m) WHERE m IN allNodes
            RETURN collect(DISTINCT n) AS nodes, collect(DISTINCT r) AS rels
            """
            params = {}

        with cls.session() as session:
            result = session.run(query, **params)
            record = result.single()

            if not record:
                return {'nodes': [], 'edges': []}

            nodes = []
            for n in record['nodes']:
                if n is None:
                    continue
                node_data = {
                    'id': n.element_id,
                    'labels': list(n.labels),
                    'properties': dict(n)
                }
                # Add display label
                if 'Equipment' in n.labels:
                    node_data['displayLabel'] = n.get('name', n.get('equipmentId', ''))
                    node_data['nodeType'] = 'equipment'
                elif 'Sensor' in n.labels:
                    node_data['displayLabel'] = n.get('name', n.get('sensorId', ''))
                    node_data['nodeType'] = 'sensor'
                elif 'ProcessArea' in n.labels:
                    node_data['displayLabel'] = n.get('name', n.get('areaId', ''))
                    node_data['nodeType'] = 'area'
                elif 'Maintenance' in n.labels:
                    node_data['displayLabel'] = n.get('description', '')[:20]
                    node_data['nodeType'] = 'maintenance'
                elif 'Anomaly' in n.labels:
                    node_data['displayLabel'] = n.get('type', '')
                    node_data['nodeType'] = 'anomaly'
                else:
                    node_data['displayLabel'] = str(list(n.labels)[0]) if n.labels else 'Unknown'
                    node_data['nodeType'] = 'other'
                nodes.append(node_data)

            edges = []
            for r in record['rels']:
                if r is None:
                    continue
                edges.append({
                    'id': r.element_id,
                    'source': r.start_node.element_id,
                    'target': r.end_node.element_id,
                    'type': r.type,
                    'properties': dict(r)
                })

            return {'nodes': nodes, 'edges': edges}

    @classmethod
    def get_process_flow_graph(cls) -> Dict[str, Any]:
        """Get the complete process flow graph as nodes and edges for visualization"""
        # Get all equipment with their areas
        equipment_query = """
        MATCH (e:Equipment)
        OPTIONAL MATCH (e)-[:LOCATED_IN]->(a:ProcessArea)
        RETURN e.equipmentId AS id,
               e.name AS name,
               e.nameEn AS nameEn,
               e.type AS type,
               e.status AS status,
               e.healthScore AS healthScore,
               a.areaId AS areaId
        ORDER BY a.areaId, e.equipmentId
        """

        # Get equipment connections (FEEDS relationships)
        edges_query = """
        MATCH (e1:Equipment)-[f:FEEDS]->(e2:Equipment)
        RETURN e1.equipmentId AS source,
               e2.equipmentId AS target,
               type(f) AS type
        """

        with cls.session() as session:
            # Get nodes
            eq_result = session.run(equipment_query)
            nodes = []
            for r in eq_result:
                node = cls._serialize_record(dict(r))
                nodes.append({
                    'id': node['id'],
                    'name': node.get('nameEn') or node.get('name', ''),
                    'nameKo': node.get('name', ''),
                    'type': node.get('type', ''),
                    'status': node.get('status', ''),
                    'healthScore': node.get('healthScore'),
                    'areaId': node.get('areaId', '')
                })

            # Get edges
            edges_result = session.run(edges_query)
            edges = []
            for r in edges_result:
                edge = dict(r)
                edges.append({
                    'source': edge['source'],
                    'target': edge['target'],
                    'type': edge['type']
                })

            return {'nodes': nodes, 'edges': edges}

    # =========================================================================
    # Dashboard Statistics
    # =========================================================================

    @classmethod
    def get_dashboard_stats(cls) -> Dict[str, Any]:
        """Get dashboard statistics in format expected by frontend"""
        with cls.session() as session:
            # Equipment stats
            eq_result = session.run("""
                MATCH (e:Equipment)
                RETURN count(e) AS total,
                       avg(e.healthScore) AS avgHealth
            """)
            eq_stats = dict(eq_result.single())

            # Health distribution
            health_result = session.run("""
                MATCH (e:Equipment)
                RETURN
                    sum(CASE WHEN e.healthScore >= 85 THEN 1 ELSE 0 END) AS normal,
                    sum(CASE WHEN e.healthScore >= 70 AND e.healthScore < 85 THEN 1 ELSE 0 END) AS warning,
                    sum(CASE WHEN e.healthScore < 70 THEN 1 ELSE 0 END) AS critical
            """)
            health_stats = dict(health_result.single())

            # Equipment by type
            eq_by_type_result = session.run("""
                MATCH (e:Equipment)
                RETURN e.type AS type, count(e) AS count
                ORDER BY count DESC
            """)
            equipment_by_type = {r['type']: r['count'] for r in eq_by_type_result}

            # Sensor stats
            sensor_result = session.run("MATCH (s:Sensor) RETURN count(s) AS total")
            sensor_count = sensor_result.single()['total']

            # Sensor by type
            sensor_by_type_result = session.run("""
                MATCH (s:Sensor)
                RETURN s.type AS type, count(s) AS count
                ORDER BY count DESC
            """)
            sensor_by_type = {r['type']: r['count'] for r in sensor_by_type_result}

            # Active anomalies
            anomaly_result = session.run("""
                MATCH (a:Anomaly)
                WHERE a.status IN ['Open', 'Monitoring']
                RETURN count(a) AS active
            """)
            active_anomalies = anomaly_result.single()['active']

            return {
                'totalEquipment': eq_stats['total'],
                'totalSensors': sensor_count,
                'totalAnomalies': active_anomalies,
                'averageHealthScore': round(eq_stats['avgHealth'], 1) if eq_stats['avgHealth'] else 0,
                'equipmentByType': equipment_by_type,
                'sensorByType': sensor_by_type,
                'healthDistribution': {
                    'Normal': health_stats['normal'],
                    'Warning': health_stats['warning'],
                    'Critical': health_stats['critical']
                }
            }
