"""
Ontology/Graph API endpoints
"""
from flask import Blueprint, jsonify, request
from ..services.neo4j_service import Neo4jService

bp = Blueprint('ontology', __name__)


@bp.route('/graph', methods=['GET'])
def get_graph():
    """Get graph data for visualization"""
    try:
        center_id = request.args.get('center')
        depth = request.args.get('depth', 2, type=int)

        graph_data = Neo4jService.get_graph_data(center_id=center_id, depth=depth)
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
        # Query distinct labels
        from neo4j import GraphDatabase
        from flask import current_app

        uri = current_app.config.get('NEO4J_URI', 'bolt://localhost:7688')
        user = current_app.config.get('NEO4J_USER', 'neo4j')
        password = current_app.config.get('NEO4J_PASSWORD', 'upw_password_2024')

        driver = GraphDatabase.driver(uri, auth=(user, password))
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
