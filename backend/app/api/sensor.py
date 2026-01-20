"""
Sensor API endpoints
"""
from flask import Blueprint, jsonify, request
from datetime import datetime
from ..services.neo4j_service import Neo4jService

bp = Blueprint('sensor', __name__)


@bp.route('', methods=['GET'])
def get_all_sensors():
    """Get all sensors"""
    try:
        sensors = Neo4jService.get_all_sensors()
        return jsonify({
            'status': 'success',
            'data': sensors,
            'count': len(sensors)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/<sensor_id>', methods=['GET'])
def get_sensor(sensor_id: str):
    """Get sensor by ID"""
    try:
        sensor = Neo4jService.get_sensor_by_id(sensor_id)
        if sensor:
            return jsonify({'status': 'success', 'data': sensor})
        return jsonify({'status': 'error', 'message': 'Sensor not found'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/<sensor_id>/observations', methods=['GET'])
def get_sensor_observations(sensor_id: str):
    """Get observations for a sensor"""
    try:
        # Parse query parameters
        start_time = request.args.get('start')
        end_time = request.args.get('end')
        limit = request.args.get('limit', 100, type=int)

        start_dt = datetime.fromisoformat(start_time) if start_time else None
        end_dt = datetime.fromisoformat(end_time) if end_time else None

        observations = Neo4jService.get_sensor_observations(
            sensor_id, start_dt, end_dt, limit
        )
        return jsonify({
            'status': 'success',
            'data': observations,
            'count': len(observations)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
