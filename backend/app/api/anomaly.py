"""
Anomaly Detection API endpoints
"""
from flask import Blueprint, jsonify, request
from datetime import datetime
from ..services.neo4j_service import Neo4jService
from ..ml.anomaly_detector import AnomalyDetectorFactory

bp = Blueprint('anomaly', __name__)


@bp.route('/detect', methods=['POST'])
def detect_anomaly():
    """Run anomaly detection for specified equipment"""
    try:
        data = request.get_json()
        equipment_id = data.get('equipmentId')

        if not equipment_id:
            return jsonify({
                'status': 'error',
                'message': 'equipmentId is required'
            }), 400

        # Get equipment info
        equipment = Neo4jService.get_equipment_by_id(equipment_id)
        if not equipment:
            return jsonify({'status': 'error', 'message': 'Equipment not found'}), 404

        # Get recent sensor observations
        sensors = Neo4jService.get_equipment_sensors(equipment_id)
        sensor_data = {}
        for sensor in sensors:
            observations = Neo4jService.get_sensor_observations(
                sensor['sensorId'], limit=100
            )
            sensor_data[sensor['sensorId']] = observations

        # Run anomaly detection
        detector = AnomalyDetectorFactory.get_detector(equipment.get('uri', ''))
        result = detector.detect(sensor_data)

        # Save anomaly if detected
        if result['is_anomaly']:
            anomaly_uri = Neo4jService.save_anomaly_detection(
                equipment_id=equipment_id,
                anomaly_type=result['anomaly_type'],
                severity=result['severity'],
                anomaly_score=result['anomaly_score']
            )
            result['anomaly_uri'] = anomaly_uri

        return jsonify({
            'status': 'success',
            'data': result
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/detect/all', methods=['POST'])
def detect_all_anomalies():
    """Run anomaly detection for all equipment"""
    try:
        equipment_list = Neo4jService.get_all_equipment()
        results = []

        for equipment in equipment_list:
            equipment_id = equipment.get('equipmentId')
            if not equipment_id:
                continue

            try:
                sensors = Neo4jService.get_equipment_sensors(equipment_id)
                sensor_data = {}
                for sensor in sensors:
                    observations = Neo4jService.get_sensor_observations(
                        sensor['sensorId'], limit=100
                    )
                    sensor_data[sensor['sensorId']] = observations

                detector = AnomalyDetectorFactory.get_detector(equipment.get('uri', ''))
                result = detector.detect(sensor_data)
                result['equipmentId'] = equipment_id

                if result['is_anomaly']:
                    Neo4jService.save_anomaly_detection(
                        equipment_id=equipment_id,
                        anomaly_type=result['anomaly_type'],
                        severity=result['severity'],
                        anomaly_score=result['anomaly_score']
                    )

                results.append(result)
            except Exception as e:
                results.append({
                    'equipmentId': equipment_id,
                    'error': str(e)
                })

        anomalies_found = [r for r in results if r.get('is_anomaly')]
        return jsonify({
            'status': 'success',
            'data': {
                'total_equipment': len(results),
                'anomalies_found': len(anomalies_found),
                'results': results
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/history', methods=['GET'])
def get_anomaly_history():
    """Get anomaly detection history"""
    try:
        equipment_id = request.args.get('equipmentId')
        limit = request.args.get('limit', 50, type=int)

        history = Neo4jService.get_anomaly_history(equipment_id, limit)
        return jsonify({
            'status': 'success',
            'data': history,
            'count': len(history)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
