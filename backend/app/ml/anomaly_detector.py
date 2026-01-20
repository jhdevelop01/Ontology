"""
Anomaly Detection Models for UPW Equipment

Each equipment type has specific anomaly detection logic:
- RO (Reverse Osmosis): Pressure differential, conductivity anomalies
- EDI (Electrodeionization): Conductivity, voltage, current anomalies
- UV Sterilizer: UV intensity degradation
- Pump: Vibration, temperature anomalies
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
import numpy as np
from dataclasses import dataclass


@dataclass
class AnomalyResult:
    """Result of anomaly detection"""
    is_anomaly: bool
    anomaly_type: str
    severity: float  # 0-1 scale
    anomaly_score: float
    details: Dict[str, Any]


class AnomalyDetector(ABC):
    """Base class for anomaly detectors"""

    def __init__(self, equipment_type: str):
        self.equipment_type = equipment_type
        self.threshold = 0.5

    @abstractmethod
    def detect(self, sensor_data: Dict[str, List[Dict]]) -> Dict[str, Any]:
        """Detect anomalies in sensor data"""
        pass

    def _extract_values(self, observations: List[Dict], key: str = 'value') -> np.ndarray:
        """Extract values from observations"""
        values = [obs.get(key) for obs in observations if obs.get(key) is not None]
        return np.array(values) if values else np.array([])

    def _calculate_zscore(self, values: np.ndarray) -> np.ndarray:
        """Calculate Z-scores for values"""
        if len(values) < 2:
            return np.array([0])
        mean = np.mean(values)
        std = np.std(values)
        if std == 0:
            return np.zeros_like(values)
        return (values - mean) / std


class ROAnomalyDetector(AnomalyDetector):
    """Anomaly detector for Reverse Osmosis equipment

    Key indicators:
    - Pressure differential (inlet - outlet) > 3 bar indicates membrane fouling
    - Permeate conductivity > 10 μS/cm indicates membrane damage
    - Flow rate decrease indicates clogging
    """

    def __init__(self):
        super().__init__('ReverseOsmosis')
        self.pressure_diff_threshold = 3.0  # bar
        self.conductivity_threshold = 10.0  # μS/cm
        self.flow_drop_threshold = 0.2  # 20% drop

    def detect(self, sensor_data: Dict[str, List[Dict]]) -> Dict[str, Any]:
        anomalies = []
        max_severity = 0.0
        max_score = 0.0

        # Find relevant sensors
        pressure_in_data = None
        pressure_out_data = None
        conductivity_data = None
        flow_data = None

        for sensor_id, observations in sensor_data.items():
            if 'PS-IN' in sensor_id:
                pressure_in_data = observations
            elif 'PS-OUT' in sensor_id:
                pressure_out_data = observations
            elif 'CS' in sensor_id:
                conductivity_data = observations
            elif 'FS' in sensor_id:
                flow_data = observations

        # Check pressure differential
        if pressure_in_data and pressure_out_data:
            p_in = self._extract_values(pressure_in_data)
            p_out = self._extract_values(pressure_out_data)
            if len(p_in) > 0 and len(p_out) > 0:
                pressure_diff = np.mean(p_in[-10:]) - np.mean(p_out[-10:])
                if pressure_diff > self.pressure_diff_threshold:
                    severity = min(1.0, (pressure_diff - self.pressure_diff_threshold) / 3.0)
                    anomalies.append({
                        'type': 'PressureAnomaly',
                        'indicator': 'pressure_differential',
                        'value': float(pressure_diff),
                        'threshold': self.pressure_diff_threshold,
                        'severity': severity
                    })
                    max_severity = max(max_severity, severity)
                    max_score = max(max_score, pressure_diff / self.pressure_diff_threshold)

        # Check conductivity
        if conductivity_data:
            conductivity = self._extract_values(conductivity_data)
            if len(conductivity) > 0:
                recent_cond = np.mean(conductivity[-10:])
                if recent_cond > self.conductivity_threshold:
                    severity = min(1.0, (recent_cond - self.conductivity_threshold) / 10.0)
                    anomalies.append({
                        'type': 'QualityAnomaly',
                        'indicator': 'conductivity',
                        'value': float(recent_cond),
                        'threshold': self.conductivity_threshold,
                        'severity': severity
                    })
                    max_severity = max(max_severity, severity)
                    max_score = max(max_score, recent_cond / self.conductivity_threshold)

        # Check flow rate trend
        if flow_data:
            flow = self._extract_values(flow_data)
            if len(flow) > 20:
                early_mean = np.mean(flow[:10])
                recent_mean = np.mean(flow[-10:])
                if early_mean > 0:
                    flow_drop = (early_mean - recent_mean) / early_mean
                    if flow_drop > self.flow_drop_threshold:
                        severity = min(1.0, flow_drop / 0.5)
                        anomalies.append({
                            'type': 'FlowAnomaly',
                            'indicator': 'flow_rate_drop',
                            'value': float(flow_drop * 100),
                            'threshold': self.flow_drop_threshold * 100,
                            'severity': severity
                        })
                        max_severity = max(max_severity, severity)
                        max_score = max(max_score, flow_drop / self.flow_drop_threshold)

        is_anomaly = len(anomalies) > 0
        anomaly_type = anomalies[0]['type'] if anomalies else 'None'

        return {
            'is_anomaly': is_anomaly,
            'anomaly_type': anomaly_type,
            'severity': float(max_severity),
            'anomaly_score': float(max_score),
            'details': {
                'equipment_type': self.equipment_type,
                'anomalies_detected': anomalies
            }
        }


class EDIAnomalyDetector(AnomalyDetector):
    """Anomaly detector for Electrodeionization equipment

    Key indicators:
    - Output conductivity > 5 μS/cm indicates resin exhaustion
    - Module voltage > 20V indicates electrode issues
    - Current anomalies indicate contamination
    """

    def __init__(self):
        super().__init__('Electrodeionization')
        self.conductivity_threshold = 5.0  # μS/cm
        self.voltage_threshold = 20.0  # V
        self.current_deviation_threshold = 0.3  # 30% deviation

    def detect(self, sensor_data: Dict[str, List[Dict]]) -> Dict[str, Any]:
        anomalies = []
        max_severity = 0.0
        max_score = 0.0

        for sensor_id, observations in sensor_data.items():
            values = self._extract_values(observations)
            if len(values) == 0:
                continue

            recent_mean = np.mean(values[-10:]) if len(values) >= 10 else np.mean(values)

            if 'CS' in sensor_id:  # Conductivity
                if recent_mean > self.conductivity_threshold:
                    severity = min(1.0, (recent_mean - self.conductivity_threshold) / 5.0)
                    anomalies.append({
                        'type': 'QualityAnomaly',
                        'indicator': 'output_conductivity',
                        'value': float(recent_mean),
                        'threshold': self.conductivity_threshold,
                        'severity': severity
                    })
                    max_severity = max(max_severity, severity)
                    max_score = max(max_score, recent_mean / self.conductivity_threshold)

            elif 'VS' in sensor_id:  # Voltage
                if recent_mean > self.voltage_threshold:
                    severity = min(1.0, (recent_mean - self.voltage_threshold) / 10.0)
                    anomalies.append({
                        'type': 'EnergyAnomaly',
                        'indicator': 'module_voltage',
                        'value': float(recent_mean),
                        'threshold': self.voltage_threshold,
                        'severity': severity
                    })
                    max_severity = max(max_severity, severity)
                    max_score = max(max_score, recent_mean / self.voltage_threshold)

            elif 'AS' in sensor_id:  # Current
                if len(values) > 20:
                    baseline = np.mean(values[:10])
                    if baseline > 0:
                        deviation = abs(recent_mean - baseline) / baseline
                        if deviation > self.current_deviation_threshold:
                            severity = min(1.0, deviation / 0.5)
                            anomalies.append({
                                'type': 'EnergyAnomaly',
                                'indicator': 'current_deviation',
                                'value': float(deviation * 100),
                                'threshold': self.current_deviation_threshold * 100,
                                'severity': severity
                            })
                            max_severity = max(max_severity, severity)
                            max_score = max(max_score, deviation / self.current_deviation_threshold)

        is_anomaly = len(anomalies) > 0
        anomaly_type = anomalies[0]['type'] if anomalies else 'None'

        return {
            'is_anomaly': is_anomaly,
            'anomaly_type': anomaly_type,
            'severity': float(max_severity),
            'anomaly_score': float(max_score),
            'details': {
                'equipment_type': self.equipment_type,
                'anomalies_detected': anomalies
            }
        }


class UVAnomalyDetector(AnomalyDetector):
    """Anomaly detector for UV Sterilizer equipment

    Key indicators:
    - UV intensity < 80% of initial value indicates lamp degradation
    - Temperature > 50°C indicates cooling issues
    """

    def __init__(self):
        super().__init__('UVSterilizer')
        self.intensity_threshold = 80.0  # % of initial
        self.temperature_threshold = 50.0  # °C

    def detect(self, sensor_data: Dict[str, List[Dict]]) -> Dict[str, Any]:
        anomalies = []
        max_severity = 0.0
        max_score = 0.0

        for sensor_id, observations in sensor_data.items():
            values = self._extract_values(observations)
            if len(values) == 0:
                continue

            recent_mean = np.mean(values[-10:]) if len(values) >= 10 else np.mean(values)

            if 'UIS' in sensor_id:  # UV Intensity
                if recent_mean < self.intensity_threshold:
                    degradation = (self.intensity_threshold - recent_mean) / self.intensity_threshold
                    severity = min(1.0, degradation * 2)
                    anomalies.append({
                        'type': 'QualityAnomaly',
                        'indicator': 'uv_intensity',
                        'value': float(recent_mean),
                        'threshold': self.intensity_threshold,
                        'severity': severity
                    })
                    max_severity = max(max_severity, severity)
                    max_score = max(max_score, 1 + degradation)

            elif 'TS' in sensor_id:  # Temperature
                if recent_mean > self.temperature_threshold:
                    severity = min(1.0, (recent_mean - self.temperature_threshold) / 20.0)
                    anomalies.append({
                        'type': 'TemperatureAnomaly',
                        'indicator': 'chamber_temperature',
                        'value': float(recent_mean),
                        'threshold': self.temperature_threshold,
                        'severity': severity
                    })
                    max_severity = max(max_severity, severity)
                    max_score = max(max_score, recent_mean / self.temperature_threshold)

        is_anomaly = len(anomalies) > 0
        anomaly_type = anomalies[0]['type'] if anomalies else 'None'

        return {
            'is_anomaly': is_anomaly,
            'anomaly_type': anomaly_type,
            'severity': float(max_severity),
            'anomaly_score': float(max_score),
            'details': {
                'equipment_type': self.equipment_type,
                'anomalies_detected': anomalies
            }
        }


class PumpAnomalyDetector(AnomalyDetector):
    """Anomaly detector for Circulation Pump equipment

    Key indicators:
    - Vibration > 10 mm/s indicates bearing wear
    - Motor temperature > 60°C indicates overheating
    - Current deviation > 20% indicates load issues
    """

    def __init__(self):
        super().__init__('CirculationPump')
        self.vibration_threshold = 10.0  # mm/s
        self.temperature_threshold = 60.0  # °C
        self.current_deviation_threshold = 0.2  # 20%

    def detect(self, sensor_data: Dict[str, List[Dict]]) -> Dict[str, Any]:
        anomalies = []
        max_severity = 0.0
        max_score = 0.0

        for sensor_id, observations in sensor_data.items():
            values = self._extract_values(observations)
            if len(values) == 0:
                continue

            recent_mean = np.mean(values[-10:]) if len(values) >= 10 else np.mean(values)

            if 'VBS' in sensor_id:  # Vibration
                if recent_mean > self.vibration_threshold:
                    severity = min(1.0, (recent_mean - self.vibration_threshold) / 10.0)
                    anomalies.append({
                        'type': 'VibrationAnomaly',
                        'indicator': 'vibration_level',
                        'value': float(recent_mean),
                        'threshold': self.vibration_threshold,
                        'severity': severity
                    })
                    max_severity = max(max_severity, severity)
                    max_score = max(max_score, recent_mean / self.vibration_threshold)

            elif 'TS' in sensor_id:  # Temperature
                if recent_mean > self.temperature_threshold:
                    severity = min(1.0, (recent_mean - self.temperature_threshold) / 20.0)
                    anomalies.append({
                        'type': 'TemperatureAnomaly',
                        'indicator': 'motor_temperature',
                        'value': float(recent_mean),
                        'threshold': self.temperature_threshold,
                        'severity': severity
                    })
                    max_severity = max(max_severity, severity)
                    max_score = max(max_score, recent_mean / self.temperature_threshold)

            elif 'AS' in sensor_id:  # Current
                if len(values) > 20:
                    baseline = np.mean(values[:10])
                    if baseline > 0:
                        deviation = abs(recent_mean - baseline) / baseline
                        if deviation > self.current_deviation_threshold:
                            severity = min(1.0, deviation / 0.4)
                            anomalies.append({
                                'type': 'EnergyAnomaly',
                                'indicator': 'motor_current_deviation',
                                'value': float(deviation * 100),
                                'threshold': self.current_deviation_threshold * 100,
                                'severity': severity
                            })
                            max_severity = max(max_severity, severity)
                            max_score = max(max_score, deviation / self.current_deviation_threshold)

        is_anomaly = len(anomalies) > 0
        anomaly_type = anomalies[0]['type'] if anomalies else 'None'

        return {
            'is_anomaly': is_anomaly,
            'anomaly_type': anomaly_type,
            'severity': float(max_severity),
            'anomaly_score': float(max_score),
            'details': {
                'equipment_type': self.equipment_type,
                'anomalies_detected': anomalies
            }
        }


class GenericAnomalyDetector(AnomalyDetector):
    """Generic anomaly detector for equipment without specific detection logic"""

    def __init__(self):
        super().__init__('Generic')
        self.zscore_threshold = 3.0

    def detect(self, sensor_data: Dict[str, List[Dict]]) -> Dict[str, Any]:
        anomalies = []
        max_severity = 0.0
        max_score = 0.0

        for sensor_id, observations in sensor_data.items():
            values = self._extract_values(observations)
            if len(values) < 10:
                continue

            zscores = self._calculate_zscore(values)
            recent_zscore = np.mean(np.abs(zscores[-5:]))

            if recent_zscore > self.zscore_threshold:
                severity = min(1.0, (recent_zscore - self.zscore_threshold) / 3.0)
                anomalies.append({
                    'type': 'StatisticalAnomaly',
                    'indicator': sensor_id,
                    'zscore': float(recent_zscore),
                    'threshold': self.zscore_threshold,
                    'severity': severity
                })
                max_severity = max(max_severity, severity)
                max_score = max(max_score, recent_zscore / self.zscore_threshold)

        is_anomaly = len(anomalies) > 0
        anomaly_type = anomalies[0]['type'] if anomalies else 'None'

        return {
            'is_anomaly': is_anomaly,
            'anomaly_type': anomaly_type,
            'severity': float(max_severity),
            'anomaly_score': float(max_score),
            'details': {
                'equipment_type': self.equipment_type,
                'anomalies_detected': anomalies
            }
        }


class AnomalyDetectorFactory:
    """Factory for creating equipment-specific anomaly detectors"""

    _detectors = {
        'ReverseOsmosis': ROAnomalyDetector,
        'Electrodeionization': EDIAnomalyDetector,
        'UVSterilizer': UVAnomalyDetector,
        'CirculationPump': PumpAnomalyDetector,
    }

    @classmethod
    def get_detector(cls, equipment_uri: str) -> AnomalyDetector:
        """Get appropriate anomaly detector based on equipment type"""
        for eq_type, detector_class in cls._detectors.items():
            if eq_type in equipment_uri:
                return detector_class()
        return GenericAnomalyDetector()
