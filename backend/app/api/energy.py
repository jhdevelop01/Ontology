"""
Energy Prediction API endpoints
"""
from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
from ..services.neo4j_service import Neo4jService
from ..ml.energy_predictor import EnergyPredictor

bp = Blueprint('energy', __name__)


@bp.route('/predict', methods=['POST'])
def predict_energy():
    """Generate energy predictions for next 24 hours (96 intervals of 15 min)"""
    try:
        data = request.get_json() or {}
        target_date_str = data.get('targetDate')

        if target_date_str:
            target_date = datetime.fromisoformat(target_date_str)
        else:
            target_date = datetime.utcnow() + timedelta(days=1)

        # Initialize predictor and generate predictions
        predictor = EnergyPredictor()

        # Get historical energy data from power meters
        sensors = Neo4jService.get_all_sensors()
        power_meters = [s for s in sensors if 'PM' in s.get('sensorId', '')]

        historical_data = {}
        for pm in power_meters:
            observations = Neo4jService.get_sensor_observations(
                pm['sensorId'],
                start_time=datetime.utcnow() - timedelta(days=10),
                limit=9600  # 10 days * 96 intervals
            )
            historical_data[pm['sensorId']] = observations

        # Generate predictions
        predictions = predictor.predict(historical_data, target_date)

        # Save predictions to database
        prediction_records = []
        prediction_time = datetime.utcnow()

        for i, pred in enumerate(predictions):
            interval_time = target_date.replace(hour=0, minute=0, second=0) + timedelta(minutes=15 * i)
            prediction_records.append({
                'uri': f"http://example.org/upw#ENERGY-PRED-{prediction_time.strftime('%Y%m%d%H%M%S')}-{i:03d}",
                'predictionTime': prediction_time.isoformat(),
                'targetTime': interval_time.isoformat(),
                'predictedValue': pred['value'],
                'confidence': pred['confidence']
            })

        saved_count = Neo4jService.save_energy_prediction(prediction_records)

        return jsonify({
            'status': 'success',
            'data': {
                'targetDate': target_date.isoformat(),
                'predictions': predictions,
                'savedCount': saved_count,
                'intervalMinutes': 15,
                'totalIntervals': len(predictions)
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/history', methods=['GET'])
def get_energy_history():
    """Get energy prediction history for a specific date"""
    try:
        date_str = request.args.get('date')
        limit = request.args.get('limit', 96, type=int)

        if date_str:
            target_date = datetime.fromisoformat(date_str)
        else:
            target_date = datetime.utcnow()

        predictions = Neo4jService.get_energy_predictions(target_date, limit)
        return jsonify({
            'status': 'success',
            'data': predictions,
            'count': len(predictions)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.route('/accuracy', methods=['GET'])
def get_prediction_accuracy():
    """Calculate prediction accuracy by comparing predicted vs actual values"""
    try:
        date_str = request.args.get('date')

        if date_str:
            target_date = datetime.fromisoformat(date_str)
        else:
            target_date = datetime.utcnow() - timedelta(days=1)

        predictions = Neo4jService.get_energy_predictions(target_date)

        # Calculate metrics for predictions that have actual values
        predictions_with_actual = [p for p in predictions if p.get('actualValue') is not None]

        if not predictions_with_actual:
            return jsonify({
                'status': 'success',
                'data': {
                    'message': 'No actual values available for comparison',
                    'date': target_date.isoformat()
                }
            })

        mae = sum(abs(p['predictedValue'] - p['actualValue']) for p in predictions_with_actual) / len(predictions_with_actual)
        mse = sum((p['predictedValue'] - p['actualValue']) ** 2 for p in predictions_with_actual) / len(predictions_with_actual)
        rmse = mse ** 0.5

        actual_mean = sum(p['actualValue'] for p in predictions_with_actual) / len(predictions_with_actual)
        mape = sum(abs((p['actualValue'] - p['predictedValue']) / p['actualValue']) for p in predictions_with_actual if p['actualValue'] != 0) / len(predictions_with_actual) * 100

        return jsonify({
            'status': 'success',
            'data': {
                'date': target_date.isoformat(),
                'sampleCount': len(predictions_with_actual),
                'metrics': {
                    'mae': round(mae, 4),
                    'rmse': round(rmse, 4),
                    'mape': round(mape, 2)
                }
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
