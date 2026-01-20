"""
Observation API endpoints
"""
from flask import Blueprint, jsonify, request
from datetime import datetime
from ..services.neo4j_service import Neo4jService

bp = Blueprint('observation', __name__)


@bp.route('', methods=['POST'])
def create_observation():
    """Create a new sensor observation"""
    try:
        data = request.get_json()

        sensor_id = data.get('sensorId')
        equipment_id = data.get('equipmentId')
        value = data.get('value')
        unit = data.get('unit', '')
        timestamp = data.get('timestamp')

        if not all([sensor_id, equipment_id, value is not None]):
            return jsonify({
                'status': 'error',
                'message': 'sensorId, equipmentId, and value are required'
            }), 400

        timestamp_dt = datetime.fromisoformat(timestamp) if timestamp else None

        obs_uri = Neo4jService.save_observation(
            sensor_id, equipment_id, float(value), unit, timestamp_dt
        )

        if obs_uri:
            return jsonify({
                'status': 'success',
                'data': {'uri': obs_uri}
            }), 201
        return jsonify({'status': 'error', 'message': 'Failed to save observation'}), 500
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/batch', methods=['POST'])
def create_observations_batch():
    """Create multiple observations at once"""
    try:
        data = request.get_json()
        observations = data.get('observations', [])

        if not observations:
            return jsonify({
                'status': 'error',
                'message': 'observations array is required'
            }), 400

        created_uris = []
        errors = []

        for obs in observations:
            try:
                sensor_id = obs.get('sensorId')
                equipment_id = obs.get('equipmentId')
                value = obs.get('value')
                unit = obs.get('unit', '')
                timestamp = obs.get('timestamp')

                timestamp_dt = datetime.fromisoformat(timestamp) if timestamp else None

                uri = Neo4jService.save_observation(
                    sensor_id, equipment_id, float(value), unit, timestamp_dt
                )
                if uri:
                    created_uris.append(uri)
            except Exception as e:
                errors.append({'observation': obs, 'error': str(e)})

        return jsonify({
            'status': 'success',
            'data': {
                'created': len(created_uris),
                'failed': len(errors),
                'errors': errors if errors else None
            }
        }), 201
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
