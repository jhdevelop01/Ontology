"""
Maintenance API endpoints
"""
from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
from ..services.neo4j_service import Neo4jService

bp = Blueprint('maintenance', __name__)


@bp.route('/schedule', methods=['GET'])
def get_maintenance_schedule():
    """Get scheduled maintenance activities"""
    try:
        equipment_id = request.args.get('equipmentId')
        schedule = Neo4jService.get_maintenance_schedule(equipment_id)
        return jsonify({
            'status': 'success',
            'data': schedule,
            'count': len(schedule)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/recommend', methods=['POST'])
def create_maintenance_recommendation():
    """Create a maintenance recommendation based on equipment health"""
    try:
        data = request.get_json()
        equipment_id = data.get('equipmentId')

        if not equipment_id:
            return jsonify({
                'status': 'error',
                'message': 'equipmentId is required'
            }), 400

        # Get equipment health data
        equipment = Neo4jService.get_equipment_by_id(equipment_id)
        if not equipment:
            return jsonify({'status': 'error', 'message': 'Equipment not found'}), 404

        health_score = equipment.get('healthScore', 100)
        failure_modes = equipment.get('failureModes', [])

        recommendations = []

        # Generate recommendations based on health score
        if health_score < 70:
            # Critical - recommend immediate maintenance
            scheduled_date = datetime.utcnow() + timedelta(days=7)
            priority = 'high'
        elif health_score < 85:
            # Warning - schedule maintenance soon
            scheduled_date = datetime.utcnow() + timedelta(days=30)
            priority = 'medium'
        else:
            # Normal - routine maintenance
            scheduled_date = datetime.utcnow() + timedelta(days=90)
            priority = 'low'

        # Determine maintenance type based on equipment and failure modes
        equipment_uri = equipment.get('uri', '')
        maintenance_type = 'GeneralInspection'

        if 'ReverseOsmosis' in equipment_uri:
            maintenance_type = 'MembraneReplacement' if health_score < 70 else 'MembraneInspection'
        elif 'Electrodeionization' in equipment_uri:
            maintenance_type = 'ResinRegeneration' if health_score < 70 else 'EDIInspection'
        elif 'UVSterilizer' in equipment_uri:
            maintenance_type = 'UVLampReplacement' if health_score < 70 else 'UVInspection'
        elif 'CirculationPump' in equipment_uri:
            maintenance_type = 'BearingReplacement' if health_score < 70 else 'PumpInspection'

        # Create recommendation
        maint_uri = Neo4jService.create_maintenance_recommendation(
            equipment_id=equipment_id,
            maintenance_type=maintenance_type,
            scheduled_date=scheduled_date
        )

        recommendation = {
            'equipmentId': equipment_id,
            'equipmentName': equipment.get('name'),
            'currentHealthScore': health_score,
            'maintenanceType': maintenance_type,
            'scheduledDate': scheduled_date.isoformat(),
            'priority': priority,
            'uri': maint_uri,
            'reasoning': f"Health score is {health_score}. {'Immediate attention required.' if health_score < 70 else 'Routine maintenance recommended.' if health_score >= 85 else 'Schedule maintenance within 30 days.'}"
        }

        return jsonify({
            'status': 'success',
            'data': recommendation
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/recommend/all', methods=['POST'])
def create_all_recommendations():
    """Create maintenance recommendations for all equipment"""
    try:
        equipment_list = Neo4jService.get_all_equipment()
        recommendations = []
        errors = []

        for equipment in equipment_list:
            equipment_id = equipment.get('equipmentId')
            if not equipment_id:
                continue

            try:
                health_score = equipment.get('healthScore', 100)

                if health_score < 70:
                    scheduled_date = datetime.utcnow() + timedelta(days=7)
                    priority = 'high'
                elif health_score < 85:
                    scheduled_date = datetime.utcnow() + timedelta(days=30)
                    priority = 'medium'
                else:
                    scheduled_date = datetime.utcnow() + timedelta(days=90)
                    priority = 'low'

                recommendations.append({
                    'equipmentId': equipment_id,
                    'equipmentName': equipment.get('name'),
                    'healthScore': health_score,
                    'scheduledDate': scheduled_date.isoformat(),
                    'priority': priority
                })
            except Exception as e:
                errors.append({'equipmentId': equipment_id, 'error': str(e)})

        # Sort by priority
        priority_order = {'high': 0, 'medium': 1, 'low': 2}
        recommendations.sort(key=lambda x: priority_order.get(x['priority'], 3))

        return jsonify({
            'status': 'success',
            'data': {
                'recommendations': recommendations,
                'summary': {
                    'total': len(recommendations),
                    'high_priority': len([r for r in recommendations if r['priority'] == 'high']),
                    'medium_priority': len([r for r in recommendations if r['priority'] == 'medium']),
                    'low_priority': len([r for r in recommendations if r['priority'] == 'low'])
                },
                'errors': errors if errors else None
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
