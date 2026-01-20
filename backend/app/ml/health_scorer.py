"""
Health Score Calculator for UPW Equipment

Calculates equipment health scores (0-100) based on:
- Sensor readings vs normal ranges
- Anomaly detection results
- Operating hours and maintenance history
"""
from typing import Dict, List, Any, Optional
import numpy as np


class HealthScorer:
    """Calculate equipment health scores"""

    def __init__(self):
        self.weights = {
            'sensor_health': 0.40,
            'anomaly_history': 0.30,
            'operating_age': 0.15,
            'maintenance_status': 0.15
        }

    def calculate_health_score(self,
                               sensor_data: Dict[str, Dict],
                               anomaly_history: List[Dict],
                               operating_hours: float,
                               expected_lifetime_hours: float = 20000,
                               last_maintenance_days: int = 0) -> Dict[str, Any]:
        """
        Calculate overall health score for equipment

        Args:
            sensor_data: Dict with sensor readings and their normal ranges
            anomaly_history: List of recent anomalies
            operating_hours: Total operating hours
            expected_lifetime_hours: Expected equipment lifetime
            last_maintenance_days: Days since last maintenance

        Returns:
            Dict with overall score and component breakdowns
        """
        # Calculate individual components
        sensor_score = self._calculate_sensor_health(sensor_data)
        anomaly_score = self._calculate_anomaly_score(anomaly_history)
        age_score = self._calculate_age_score(operating_hours, expected_lifetime_hours)
        maintenance_score = self._calculate_maintenance_score(last_maintenance_days)

        # Weighted average
        overall_score = (
            sensor_score * self.weights['sensor_health'] +
            anomaly_score * self.weights['anomaly_history'] +
            age_score * self.weights['operating_age'] +
            maintenance_score * self.weights['maintenance_status']
        )

        # Determine status
        if overall_score >= 85:
            status = 'Normal'
        elif overall_score >= 70:
            status = 'Warning'
        else:
            status = 'Critical'

        return {
            'overall_score': round(float(overall_score), 1),
            'status': status,
            'components': {
                'sensor_health': {
                    'score': round(float(sensor_score), 1),
                    'weight': self.weights['sensor_health']
                },
                'anomaly_history': {
                    'score': round(float(anomaly_score), 1),
                    'weight': self.weights['anomaly_history']
                },
                'operating_age': {
                    'score': round(float(age_score), 1),
                    'weight': self.weights['operating_age']
                },
                'maintenance_status': {
                    'score': round(float(maintenance_score), 1),
                    'weight': self.weights['maintenance_status']
                }
            }
        }

    def _calculate_sensor_health(self, sensor_data: Dict[str, Dict]) -> float:
        """
        Calculate health based on sensor readings

        Args:
            sensor_data: Dict mapping sensor_id to {
                'current_value': float,
                'normal_min': float,
                'normal_max': float,
                'warning_threshold': float (optional),
                'critical_threshold': float (optional)
            }

        Returns:
            Score 0-100
        """
        if not sensor_data:
            return 100.0

        scores = []
        for sensor_id, data in sensor_data.items():
            current = data.get('current_value')
            normal_min = data.get('normal_min')
            normal_max = data.get('normal_max')

            if current is None or normal_min is None or normal_max is None:
                continue

            # Calculate how far the value is from the normal range
            if normal_min <= current <= normal_max:
                score = 100.0
            else:
                # Calculate deviation percentage
                if current < normal_min:
                    deviation = (normal_min - current) / (normal_max - normal_min)
                else:
                    deviation = (current - normal_max) / (normal_max - normal_min)

                # Score decreases exponentially with deviation
                score = max(0, 100 * np.exp(-deviation))

            scores.append(score)

        return np.mean(scores) if scores else 100.0

    def _calculate_anomaly_score(self, anomaly_history: List[Dict]) -> float:
        """
        Calculate health based on recent anomaly history

        Args:
            anomaly_history: List of recent anomaly detections

        Returns:
            Score 0-100
        """
        if not anomaly_history:
            return 100.0

        # Consider anomalies from last 30 days
        recent_anomalies = anomaly_history[:30]  # Assuming sorted by recency

        if not recent_anomalies:
            return 100.0

        # Weight by severity and recency
        total_impact = 0
        for i, anomaly in enumerate(recent_anomalies):
            severity = anomaly.get('severity', 0.5)
            recency_weight = 1 / (i + 1)  # More recent anomalies have higher impact
            total_impact += severity * recency_weight

        # Normalize to 0-100 scale
        max_possible_impact = sum(1 / (i + 1) for i in range(len(recent_anomalies)))
        normalized_impact = total_impact / max_possible_impact if max_possible_impact > 0 else 0

        return max(0, 100 * (1 - normalized_impact))

    def _calculate_age_score(self, operating_hours: float,
                             expected_lifetime: float) -> float:
        """
        Calculate health based on equipment age

        Args:
            operating_hours: Total hours of operation
            expected_lifetime: Expected lifetime in hours

        Returns:
            Score 0-100
        """
        if expected_lifetime <= 0:
            return 100.0

        age_ratio = operating_hours / expected_lifetime

        if age_ratio <= 0.5:
            # Less than 50% of lifetime - full score
            return 100.0
        elif age_ratio <= 0.8:
            # 50-80% of lifetime - gradual decrease
            return 100 - (age_ratio - 0.5) * 100
        elif age_ratio <= 1.0:
            # 80-100% of lifetime - steeper decrease
            return 70 - (age_ratio - 0.8) * 200
        else:
            # Beyond expected lifetime
            return max(0, 30 - (age_ratio - 1.0) * 50)

    def _calculate_maintenance_score(self, days_since_maintenance: int) -> float:
        """
        Calculate health based on maintenance status

        Args:
            days_since_maintenance: Days since last maintenance

        Returns:
            Score 0-100
        """
        if days_since_maintenance <= 30:
            return 100.0
        elif days_since_maintenance <= 60:
            return 90.0
        elif days_since_maintenance <= 90:
            return 80.0
        elif days_since_maintenance <= 180:
            return 60.0
        else:
            return max(30, 60 - (days_since_maintenance - 180) / 10)

    def get_recommendations(self, health_result: Dict[str, Any]) -> List[str]:
        """
        Generate maintenance recommendations based on health assessment

        Args:
            health_result: Result from calculate_health_score

        Returns:
            List of recommendation strings
        """
        recommendations = []
        components = health_result.get('components', {})

        if components.get('sensor_health', {}).get('score', 100) < 70:
            recommendations.append("Sensor readings indicate potential equipment degradation. Inspect equipment parameters.")

        if components.get('anomaly_history', {}).get('score', 100) < 70:
            recommendations.append("Frequent anomalies detected. Schedule diagnostic inspection.")

        if components.get('operating_age', {}).get('score', 100) < 70:
            recommendations.append("Equipment approaching end of expected lifetime. Plan for replacement.")

        if components.get('maintenance_status', {}).get('score', 100) < 70:
            recommendations.append("Overdue for scheduled maintenance. Schedule service appointment.")

        if health_result['overall_score'] < 50:
            recommendations.insert(0, "URGENT: Equipment health is critical. Immediate attention required.")

        if not recommendations:
            recommendations.append("Equipment health is good. Continue regular monitoring.")

        return recommendations
