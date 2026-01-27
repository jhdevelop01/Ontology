"""
Ontology/Graph API endpoints
"""
from flask import Blueprint, jsonify, request, Response
from ..services.neo4j_service import Neo4jService
from ..services.reasoning_service import ReasoningService
from ..services.test_data_service import TestDataService
from ..services.axiom_service import AxiomService
from ..services.constraint_service import ConstraintService
from neo4j import GraphDatabase
from flask import current_app
import json

bp = Blueprint('ontology', __name__)


def get_neo4j_driver():
    """Get Neo4j driver instance"""
    uri = current_app.config.get('NEO4J_URI', 'bolt://localhost:7688')
    user = current_app.config.get('NEO4J_USER', 'neo4j')
    password = current_app.config.get('NEO4J_PASSWORD', 'upw_password_2024')
    return GraphDatabase.driver(uri, auth=(user, password))


@bp.route('/graph', methods=['GET'])
def get_graph():
    """Get graph data for visualization

    Query Parameters:
        center: Center node ID for subgraph
        depth: Depth of traversal from center node (default: 2)
        fetch_all: If 'true', fetch all nodes and edges from database
        exclude_observations: If 'false', include Observation/SensorReading nodes (default: true for performance)
    """
    try:
        center_id = request.args.get('center')
        depth = request.args.get('depth', 2, type=int)
        fetch_all = request.args.get('fetch_all', 'false').lower() == 'true'
        exclude_observations = request.args.get('exclude_observations', 'true').lower() != 'false'

        graph_data = Neo4jService.get_graph_data(
            center_id=center_id,
            depth=depth,
            fetch_all=fetch_all,
            exclude_observations=exclude_observations
        )
        return jsonify({
            'status': 'success',
            'data': graph_data
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/process-flow', methods=['GET'])
def get_process_flow():
    """Get process flow graph data"""
    try:
        flow_data = Neo4jService.get_process_flow_graph()
        return jsonify({
            'status': 'success',
            'data': flow_data
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/areas', methods=['GET'])
def get_process_areas():
    """Get all process areas"""
    try:
        areas = Neo4jService.get_all_process_areas()
        return jsonify({
            'status': 'success',
            'data': areas,
            'count': len(areas)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/stats', methods=['GET'])
def get_stats():
    """Get dashboard statistics"""
    try:
        stats = Neo4jService.get_dashboard_stats()
        return jsonify({
            'status': 'success',
            'data': stats
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/classes', methods=['GET'])
def get_classes():
    """Get node types (labels) in the database"""
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            result = session.run("""
                MATCH (n)
                WITH labels(n) AS labels, count(n) AS count
                UNWIND labels AS label
                RETURN label AS name, sum(count) AS count
                ORDER BY count DESC
            """)
            classes = [{'name': r['name'], 'count': r['count']} for r in result]
        driver.close()

        return jsonify({
            'status': 'success',
            'data': classes,
            'count': len(classes)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/cypher', methods=['POST'])
def execute_cypher():
    """Execute a Cypher query (SPARQL-like for Neo4j)"""
    try:
        data = request.get_json()
        query = data.get('query', '')

        if not query:
            return jsonify({'status': 'error', 'message': 'Query is required'}), 400

        # Security: Only allow read queries
        query_upper = query.upper().strip()
        if any(keyword in query_upper for keyword in ['CREATE', 'DELETE', 'SET', 'REMOVE', 'MERGE', 'DROP', 'DETACH']):
            return jsonify({'status': 'error', 'message': 'Only read queries are allowed'}), 403

        driver = get_neo4j_driver()
        with driver.session() as session:
            result = session.run(query)
            records = []
            keys = None
            for record in result:
                if keys is None:
                    keys = record.keys()
                row = {}
                for key in keys:
                    value = record[key]
                    # Convert Neo4j types to JSON-serializable types
                    if hasattr(value, '__dict__'):
                        row[key] = dict(value)
                    elif hasattr(value, 'items'):
                        row[key] = dict(value.items())
                    else:
                        row[key] = value
                records.append(row)
        driver.close()

        return jsonify({
            'status': 'success',
            'data': records,
            'columns': list(keys) if keys else [],
            'count': len(records)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/hierarchy', methods=['GET'])
def get_class_hierarchy():
    """Get class hierarchy tree structure"""
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            # Get all node labels with their relationships
            result = session.run("""
                MATCH (n)
                WITH DISTINCT labels(n) AS nodeLabels
                UNWIND nodeLabels AS label
                WITH DISTINCT label
                OPTIONAL MATCH (child)-[:SUBCLASS_OF|:TYPE_OF|:PART_OF]->(parent)
                WHERE label IN labels(child) OR label IN labels(parent)
                WITH label,
                     collect(DISTINCT [l IN labels(parent) WHERE l <> label | l][0]) AS parents,
                     collect(DISTINCT [l IN labels(child) WHERE l <> label | l][0]) AS children
                RETURN label, parents, children
                ORDER BY label
            """)

            hierarchy = {}
            for record in result:
                label = record['label']
                hierarchy[label] = {
                    'name': label,
                    'parents': [p for p in record['parents'] if p],
                    'children': [c for c in record['children'] if c]
                }

            # Get counts for each label
            count_result = session.run("""
                MATCH (n)
                UNWIND labels(n) AS label
                RETURN label, count(*) AS count
            """)

            for record in count_result:
                label = record['label']
                if label in hierarchy:
                    hierarchy[label]['count'] = record['count']

        driver.close()

        # Build tree structure
        tree = build_hierarchy_tree(hierarchy)

        return jsonify({
            'status': 'success',
            'data': {
                'flat': list(hierarchy.values()),
                'tree': tree
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def build_hierarchy_tree(hierarchy):
    """Build a tree structure from flat hierarchy data"""
    # Find root nodes (nodes without parents)
    roots = []
    for name, data in hierarchy.items():
        if not data.get('parents') or len(data['parents']) == 0:
            roots.append(name)

    def build_node(name, visited=None):
        if visited is None:
            visited = set()
        if name in visited:
            return None
        visited.add(name)

        data = hierarchy.get(name, {'name': name, 'count': 0})
        children = []
        for child_name in data.get('children', []):
            if child_name and child_name in hierarchy:
                child_node = build_node(child_name, visited.copy())
                if child_node:
                    children.append(child_node)

        return {
            'name': name,
            'count': data.get('count', 0),
            'children': children
        }

    return [build_node(root) for root in roots if root]


@bp.route('/search', methods=['GET'])
def search_nodes():
    """Search nodes by name or property"""
    try:
        query = request.args.get('q', '')
        node_type = request.args.get('type', '')
        limit = request.args.get('limit', 50, type=int)

        if not query and not node_type:
            return jsonify({'status': 'error', 'message': 'Search query or type is required'}), 400

        driver = get_neo4j_driver()
        with driver.session() as session:
            cypher = """
                MATCH (n)
                WHERE
            """
            conditions = []
            params = {'limit': limit}

            if query:
                conditions.append("""
                    (toLower(n.name) CONTAINS toLower($query)
                    OR toLower(n.equipmentId) CONTAINS toLower($query)
                    OR toLower(n.sensorId) CONTAINS toLower($query)
                    OR any(label IN labels(n) WHERE toLower(label) CONTAINS toLower($query)))
                """)
                params['query'] = query

            if node_type:
                conditions.append("$nodeType IN labels(n)")
                params['nodeType'] = node_type

            cypher += " AND ".join(conditions)
            cypher += """
                RETURN
                    elementId(n) AS id,
                    labels(n) AS labels,
                    properties(n) AS properties
                LIMIT $limit
            """

            result = session.run(cypher, params)
            nodes = []
            for record in result:
                props = dict(record['properties'])
                nodes.append({
                    'id': record['id'],
                    'labels': record['labels'],
                    'name': props.get('name') or props.get('equipmentId') or props.get('sensorId') or record['id'],
                    'properties': props
                })

        driver.close()

        return jsonify({
            'status': 'success',
            'data': nodes,
            'count': len(nodes)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/relationships', methods=['GET'])
def get_relationship_types():
    """Get all relationship types in the database"""
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            result = session.run("""
                MATCH ()-[r]->()
                RETURN DISTINCT type(r) AS type, count(r) AS count
                ORDER BY count DESC
            """)
            relationships = [{'type': r['type'], 'count': r['count']} for r in result]
        driver.close()

        return jsonify({
            'status': 'success',
            'data': relationships,
            'count': len(relationships)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/node/<path:node_id>', methods=['GET'])
def get_node_details(node_id):
    """Get detailed information about a specific node"""
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            # Get node with all relationships
            result = session.run("""
                MATCH (n)
                WHERE elementId(n) = $nodeId
                OPTIONAL MATCH (n)-[r_out]->(target)
                OPTIONAL MATCH (source)-[r_in]->(n)
                RETURN
                    n,
                    labels(n) AS labels,
                    properties(n) AS properties,
                    collect(DISTINCT {
                        type: type(r_out),
                        target: elementId(target),
                        targetLabels: labels(target),
                        targetName: coalesce(target.name, target.equipmentId, target.sensorId)
                    }) AS outgoing,
                    collect(DISTINCT {
                        type: type(r_in),
                        source: elementId(source),
                        sourceLabels: labels(source),
                        sourceName: coalesce(source.name, source.equipmentId, source.sensorId)
                    }) AS incoming
            """, {'nodeId': node_id})

            record = result.single()
            if not record:
                return jsonify({'status': 'error', 'message': 'Node not found'}), 404

            props = dict(record['properties'])
            node_data = {
                'id': node_id,
                'labels': record['labels'],
                'name': props.get('name') or props.get('equipmentId') or props.get('sensorId') or node_id,
                'properties': props,
                'outgoing': [r for r in record['outgoing'] if r['type']],
                'incoming': [r for r in record['incoming'] if r['type']]
            }

        driver.close()

        return jsonify({
            'status': 'success',
            'data': node_data
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/path', methods=['GET'])
def find_path():
    """Find shortest path between two nodes"""
    try:
        source_id = request.args.get('source')
        target_id = request.args.get('target')
        max_depth = request.args.get('maxDepth', 5, type=int)

        if not source_id or not target_id:
            return jsonify({'status': 'error', 'message': 'Source and target node IDs are required'}), 400

        driver = get_neo4j_driver()
        with driver.session() as session:
            result = session.run("""
                MATCH path = shortestPath(
                    (source)-[*1..$maxDepth]-(target)
                )
                WHERE elementId(source) = $sourceId AND elementId(target) = $targetId
                RETURN path,
                       [n IN nodes(path) | {
                           id: elementId(n),
                           labels: labels(n),
                           name: coalesce(n.name, n.equipmentId, n.sensorId)
                       }] AS nodes,
                       [r IN relationships(path) | {
                           type: type(r),
                           source: elementId(startNode(r)),
                           target: elementId(endNode(r))
                       }] AS relationships,
                       length(path) AS pathLength
            """, {'sourceId': source_id, 'targetId': target_id, 'maxDepth': max_depth})

            record = result.single()
            if not record:
                return jsonify({
                    'status': 'success',
                    'data': None,
                    'message': 'No path found between the nodes'
                })

            path_data = {
                'nodes': record['nodes'],
                'relationships': record['relationships'],
                'length': record['pathLength']
            }

        driver.close()

        return jsonify({
            'status': 'success',
            'data': path_data
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/export', methods=['GET'])
def export_ontology():
    """Export ontology data in various formats"""
    try:
        format_type = request.args.get('format', 'json')

        driver = get_neo4j_driver()
        with driver.session() as session:
            # Get all nodes
            nodes_result = session.run("""
                MATCH (n)
                RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS properties
            """)
            nodes = [{
                'id': r['id'],
                'labels': r['labels'],
                'properties': dict(r['properties'])
            } for r in nodes_result]

            # Get all relationships
            rels_result = session.run("""
                MATCH (s)-[r]->(t)
                RETURN elementId(s) AS source, elementId(t) AS target, type(r) AS type, properties(r) AS properties
            """)
            relationships = [{
                'source': r['source'],
                'target': r['target'],
                'type': r['type'],
                'properties': dict(r['properties']) if r['properties'] else {}
            } for r in rels_result]

        driver.close()

        export_data = {
            'nodes': nodes,
            'relationships': relationships,
            'metadata': {
                'nodeCount': len(nodes),
                'relationshipCount': len(relationships),
                'exportFormat': format_type
            }
        }

        if format_type == 'json':
            return jsonify({
                'status': 'success',
                'data': export_data
            })
        elif format_type == 'cypher':
            # Generate Cypher CREATE statements
            cypher_statements = []
            for node in nodes:
                labels_str = ':'.join(node['labels'])
                props_str = json.dumps(node['properties'])
                cypher_statements.append(f"CREATE (n:{labels_str} {props_str})")

            return Response(
                '\n'.join(cypher_statements),
                mimetype='text/plain',
                headers={'Content-Disposition': 'attachment; filename=ontology_export.cypher'}
            )
        else:
            return jsonify({'status': 'error', 'message': f'Unsupported format: {format_type}'}), 400

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# CRUD Operations (with proper authentication in production)
@bp.route('/node', methods=['POST'])
def create_node():
    """Create a new node"""
    try:
        data = request.get_json()
        labels = data.get('labels', [])
        properties = data.get('properties', {})

        if not labels:
            return jsonify({'status': 'error', 'message': 'At least one label is required'}), 400

        driver = get_neo4j_driver()
        with driver.session() as session:
            labels_str = ':'.join(labels)
            result = session.run(f"""
                CREATE (n:{labels_str} $properties)
                RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS properties
            """, {'properties': properties})

            record = result.single()
            node_data = {
                'id': record['id'],
                'labels': record['labels'],
                'properties': dict(record['properties'])
            }

        driver.close()

        return jsonify({
            'status': 'success',
            'data': node_data,
            'message': 'Node created successfully'
        }), 201
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/node/<path:node_id>', methods=['PUT'])
def update_node(node_id):
    """Update an existing node's properties"""
    try:
        data = request.get_json()
        properties = data.get('properties', {})

        driver = get_neo4j_driver()
        with driver.session() as session:
            result = session.run("""
                MATCH (n)
                WHERE elementId(n) = $nodeId
                SET n += $properties
                RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS properties
            """, {'nodeId': node_id, 'properties': properties})

            record = result.single()
            if not record:
                return jsonify({'status': 'error', 'message': 'Node not found'}), 404

            node_data = {
                'id': record['id'],
                'labels': record['labels'],
                'properties': dict(record['properties'])
            }

        driver.close()

        return jsonify({
            'status': 'success',
            'data': node_data,
            'message': 'Node updated successfully'
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/node/<path:node_id>', methods=['DELETE'])
def delete_node(node_id):
    """Delete a node and its relationships"""
    try:
        driver = get_neo4j_driver()
        with driver.session() as session:
            result = session.run("""
                MATCH (n)
                WHERE elementId(n) = $nodeId
                DETACH DELETE n
                RETURN count(n) AS deleted
            """, {'nodeId': node_id})

            record = result.single()
            if record['deleted'] == 0:
                return jsonify({'status': 'error', 'message': 'Node not found'}), 404

        driver.close()

        return jsonify({
            'status': 'success',
            'message': 'Node deleted successfully'
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/relationship', methods=['POST'])
def create_relationship():
    """Create a new relationship between nodes"""
    try:
        data = request.get_json()
        source_id = data.get('sourceId')
        target_id = data.get('targetId')
        rel_type = data.get('type')
        properties = data.get('properties', {})

        if not source_id or not target_id or not rel_type:
            return jsonify({'status': 'error', 'message': 'sourceId, targetId, and type are required'}), 400

        driver = get_neo4j_driver()
        with driver.session() as session:
            result = session.run(f"""
                MATCH (source), (target)
                WHERE elementId(source) = $sourceId AND elementId(target) = $targetId
                CREATE (source)-[r:{rel_type} $properties]->(target)
                RETURN elementId(r) AS id, type(r) AS type, properties(r) AS properties
            """, {'sourceId': source_id, 'targetId': target_id, 'properties': properties})

            record = result.single()
            if not record:
                return jsonify({'status': 'error', 'message': 'Source or target node not found'}), 404

            rel_data = {
                'id': record['id'],
                'type': record['type'],
                'properties': dict(record['properties']) if record['properties'] else {}
            }

        driver.close()

        return jsonify({
            'status': 'success',
            'data': rel_data,
            'message': 'Relationship created successfully'
        }), 201
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ============== Reasoning/Inference API ==============

@bp.route('/reasoning/rules', methods=['GET'])
def get_reasoning_rules():
    """Get all available inference rules"""
    try:
        rules = ReasoningService.get_rules()
        return jsonify({
            'status': 'success',
            'data': rules,
            'count': len(rules)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/reasoning/rules/<rule_id>', methods=['GET'])
def get_reasoning_rule(rule_id):
    """Get a specific inference rule by ID"""
    try:
        rule = ReasoningService.get_rule_by_id(rule_id)
        if not rule:
            return jsonify({'status': 'error', 'message': f'Rule {rule_id} not found'}), 404

        return jsonify({
            'status': 'success',
            'data': {
                'id': rule['id'],
                'name': rule['name'],
                'description': rule['description'],
                'category': rule['category']
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/reasoning/rules/<rule_id>/check', methods=['POST'])
def check_reasoning_rule(rule_id):
    """Check what a rule would infer without applying it"""
    try:
        result = ReasoningService.check_rule(rule_id)
        if result.get('status') == 'error':
            return jsonify(result), 400

        return jsonify({
            'status': 'success',
            'data': result
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/reasoning/rules/<rule_id>/apply', methods=['POST'])
def apply_reasoning_rule(rule_id):
    """Apply a specific inference rule"""
    try:
        result = ReasoningService.apply_rule(rule_id)
        if result.get('status') == 'error':
            return jsonify(result), 400

        return jsonify({
            'status': 'success',
            'data': result
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/reasoning/run', methods=['POST'])
def run_all_reasoning():
    """Run all inference rules"""
    try:
        result = ReasoningService.run_all_rules()
        return jsonify({
            'status': 'success',
            'data': result
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/reasoning/inferred', methods=['GET'])
def get_inferred_facts():
    """Get all inferred facts (nodes and relationships)"""
    try:
        limit = request.args.get('limit', 100, type=int)
        result = ReasoningService.get_inferred_facts(limit=limit)

        if result.get('status') == 'error':
            return jsonify(result), 400

        return jsonify({
            'status': 'success',
            'data': result
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/reasoning/inferred', methods=['DELETE'])
def clear_inferred_facts():
    """Clear all inferred facts"""
    try:
        result = ReasoningService.clear_inferred_facts()

        if result.get('status') == 'error':
            return jsonify(result), 400

        return jsonify({
            'status': 'success',
            'data': result
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/reasoning/stats', methods=['GET'])
def get_inference_statistics():
    """Get statistics about inferred knowledge"""
    try:
        result = ReasoningService.get_inference_statistics()

        if result.get('status') == 'error':
            return jsonify(result), 400

        return jsonify({
            'status': 'success',
            'data': result
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/reasoning/rules/<rule_id>/run-with-trace', methods=['POST'])
def run_rule_with_trace(rule_id):
    """
    추론 과정을 추적하면서 규칙을 실행합니다.
    각 단계에서 어떤 데이터가 사용되었고, 왜 추론이 이루어졌는지 상세하게 반환합니다.
    """
    try:
        result = ReasoningService.run_rule_with_trace(rule_id)

        if result.get('status') == 'error':
            return jsonify(result), 400

        return jsonify({
            'status': 'success',
            'data': result.get('trace')
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ===== Test Data API =====

@bp.route('/test-data/scenarios', methods=['GET'])
def get_test_scenarios():
    """테스트 시나리오 목록 조회"""
    try:
        scenarios = TestDataService.get_scenarios()
        return jsonify({
            'status': 'success',
            'data': scenarios
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/test-data/status', methods=['GET'])
def get_test_data_status():
    """테스트 데이터 현재 상태 조회"""
    try:
        result = TestDataService.get_scenario_status()

        if result.get('status') == 'error':
            return jsonify(result), 400

        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/test-data/load', methods=['POST'])
def load_all_test_data():
    """모든 테스트 시나리오 데이터 로드"""
    try:
        result = TestDataService.load_all_scenarios()

        if result.get('status') == 'error':
            return jsonify(result), 400

        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/test-data/load/<scenario_id>', methods=['POST'])
def load_test_scenario(scenario_id):
    """특정 시나리오 데이터 로드"""
    try:
        result = TestDataService.load_scenario(scenario_id)

        if result.get('status') == 'error':
            return jsonify(result), 400

        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/test-data/reset', methods=['POST'])
def reset_test_data():
    """테스트 데이터 초기화"""
    try:
        result = TestDataService.reset_test_data()

        if result.get('status') == 'error':
            return jsonify(result), 400

        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/test-data/clear-inferred', methods=['POST'])
def clear_inferred_data():
    """추론된 데이터만 삭제"""
    try:
        result = TestDataService.clear_inferred_data()

        if result.get('status') == 'error':
            return jsonify(result), 400

        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ============================================================================
# Axiom Endpoints
# ============================================================================

@bp.route('/axioms', methods=['GET'])
def get_axioms():
    """Get all defined axioms"""
    try:
        driver = get_neo4j_driver()
        axiom_service = AxiomService(driver)
        axioms = axiom_service.get_all_axioms()
        driver.close()

        return jsonify({
            'status': 'success',
            'data': {
                'axioms': axioms,
                'count': len(axioms)
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/axioms/<axiom_id>/check', methods=['POST'])
def check_axiom(axiom_id):
    """Check a specific axiom for violations"""
    try:
        driver = get_neo4j_driver()
        axiom_service = AxiomService(driver)
        result = axiom_service.check_axiom(axiom_id)
        driver.close()

        return jsonify({
            'status': 'success',
            'data': {
                'result': {
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
                    ],
                    'checkedAt': result.checked_at
                }
            }
        })
    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/axioms/check-all', methods=['POST'])
def check_all_axioms():
    """Check all axioms for violations"""
    try:
        driver = get_neo4j_driver()
        axiom_service = AxiomService(driver)
        result = axiom_service.check_all_axioms()
        driver.close()

        return jsonify({
            'status': 'success',
            'data': result
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ============================================================================
# Constraint Endpoints
# ============================================================================

@bp.route('/constraints', methods=['GET'])
def get_constraints():
    """Get all defined constraints"""
    try:
        driver = get_neo4j_driver()
        constraint_service = ConstraintService(driver)
        constraints = constraint_service.get_all_constraints()
        driver.close()

        return jsonify({
            'status': 'success',
            'data': {
                'constraints': constraints,
                'count': len(constraints)
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/constraints/<constraint_id>/validate', methods=['POST'])
def validate_constraint(constraint_id):
    """Validate a specific constraint"""
    try:
        driver = get_neo4j_driver()
        constraint_service = ConstraintService(driver)
        result = constraint_service.validate_constraint(constraint_id)
        driver.close()

        return jsonify({
            'status': 'success',
            'data': {
                'result': {
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
                    ],
                    'checkedAt': result.checked_at
                }
            }
        })
    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/constraints/validate-all', methods=['POST'])
def validate_all_constraints():
    """Validate all constraints"""
    try:
        driver = get_neo4j_driver()
        constraint_service = ConstraintService(driver)
        result = constraint_service.validate_all_constraints()
        driver.close()

        return jsonify({
            'status': 'success',
            'data': result
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ============================================================================
# Combined Validation and Reasoning
# ============================================================================

@bp.route('/reasoning/validate-and-run', methods=['POST'])
def validate_and_run():
    """Validate axioms and constraints, then run reasoning if all pass"""
    try:
        data = request.get_json() or {}
        enable_constraints = data.get('enableConstraints', True)

        driver = get_neo4j_driver()

        # Check axioms
        axiom_service = AxiomService(driver)
        axiom_results = axiom_service.check_all_axioms()

        # Check constraints
        constraint_results = None
        if enable_constraints:
            constraint_service = ConstraintService(driver)
            constraint_results = constraint_service.validate_all_constraints()

        driver.close()

        # If there are violations, return them
        total_violations = axiom_results.get('totalViolations', 0)
        if enable_constraints and constraint_results:
            total_violations += constraint_results.get('totalViolations', 0)

        # Run reasoning
        reasoning_results = ReasoningService.run_all_rules()

        return jsonify({
            'status': 'success',
            'results': {
                'axiomResults': axiom_results,
                'constraintResults': constraint_results,
                'reasoningResults': reasoning_results,
                'totalViolations': total_violations
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
