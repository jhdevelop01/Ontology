"""
Equipment API endpoints
"""
from flask import Blueprint, jsonify, request
from ..services.neo4j_service import Neo4jService

bp = Blueprint('equipment', __name__)


@bp.route('', methods=['GET'])
def get_all_equipment():
    """Get all equipment with health status"""
    try:
        equipment_list = Neo4jService.get_all_equipment()
        return jsonify({
            'status': 'success',
            'data': equipment_list,
            'count': len(equipment_list)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/<equipment_id>', methods=['GET'])
def get_equipment(equipment_id: str):
    """Get equipment by ID"""
    try:
        equipment = Neo4jService.get_equipment_by_id(equipment_id)
        if equipment:
            return jsonify({'status': 'success', 'data': equipment})
        return jsonify({'status': 'error', 'message': 'Equipment not found'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/<equipment_id>/sensors', methods=['GET'])
def get_equipment_sensors(equipment_id: str):
    """Get all sensors for an equipment"""
    try:
        sensors = Neo4jService.get_equipment_sensors(equipment_id)
        return jsonify({
            'status': 'success',
            'data': sensors,
            'count': len(sensors)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/<equipment_id>/health', methods=['GET'])
def get_equipment_health(equipment_id: str):
    """Get equipment health status and score"""
    try:
        equipment = Neo4jService.get_equipment_by_id(equipment_id)
        if not equipment:
            return jsonify({'status': 'error', 'message': 'Equipment not found'}), 404

        health_data = {
            'equipmentId': equipment.get('equipmentId'),
            'healthScore': equipment.get('healthScore'),
            'status': equipment.get('status'),
            'operatingHours': equipment.get('operatingHours'),
            'failureModes': equipment.get('failureModes', [])
        }
        return jsonify({'status': 'success', 'data': health_data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/<equipment_id>/health', methods=['PUT'])
def update_equipment_health(equipment_id: str):
    """Update equipment health score and status"""
    try:
        data = request.get_json()
        health_score = data.get('healthScore')
        health_status = data.get('healthStatus', 'Normal')

        if health_score is None:
            return jsonify({'status': 'error', 'message': 'healthScore is required'}), 400

        success = Neo4jService.update_equipment_health(
            equipment_id, health_score, health_status
        )
        if success:
            return jsonify({'status': 'success', 'message': 'Health updated'})
        return jsonify({'status': 'error', 'message': 'Failed to update'}), 500
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
