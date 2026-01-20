import React, { useEffect, useState } from 'react';
import { anomalyApi, equipmentApi } from '../services/api';
import type { Anomaly, Equipment, AnomalyResult } from '../types';

const AnomalyMonitor: React.FC = () => {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [detectionResult, setDetectionResult] = useState<AnomalyResult | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [anomaliesRes, equipmentRes] = await Promise.all([
          anomalyApi.getHistory(undefined, undefined, 50),
          equipmentApi.getAll(),
        ]);

        if (anomaliesRes.status === 'success' && anomaliesRes.data) {
          setAnomalies(anomaliesRes.data);
        }
        if (equipmentRes.status === 'success' && equipmentRes.data) {
          setEquipment(equipmentRes.data);
        }
      } catch (err) {
        setError('Failed to load data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleDetect = async () => {
    if (!selectedEquipment) return;

    setDetecting(true);
    setDetectionResult(null);
    try {
      const response = await anomalyApi.detect(selectedEquipment);
      if (response.status === 'success' && response.data) {
        setDetectionResult(response.data);
        // Refresh anomaly history
        const historyRes = await anomalyApi.getHistory(undefined, undefined, 50);
        if (historyRes.status === 'success' && historyRes.data) {
          setAnomalies(historyRes.data);
        }
      }
    } catch (err) {
      setError('Failed to run anomaly detection');
      console.error(err);
    } finally {
      setDetecting(false);
    }
  };

  const handleDetectAll = async () => {
    setDetecting(true);
    try {
      const response = await anomalyApi.detectAll();
      if (response.status === 'success') {
        // Refresh anomaly history
        const historyRes = await anomalyApi.getHistory(undefined, undefined, 50);
        if (historyRes.status === 'success' && historyRes.data) {
          setAnomalies(historyRes.data);
        }
      }
    } catch (err) {
      setError('Failed to run anomaly detection');
      console.error(err);
    } finally {
      setDetecting(false);
    }
  };

  const getSeverityClass = (severity: number) => {
    if (severity >= 0.7) return 'high';
    if (severity >= 0.4) return 'medium';
    return 'low';
  };

  const getSeverityLabel = (severity: number) => {
    if (severity >= 0.7) return 'High';
    if (severity >= 0.4) return 'Medium';
    return 'Low';
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="anomaly-page">
      <h1 className="page-title">Anomaly Detection Monitor</h1>

      {error && <div className="error-message">{error}</div>}

      {/* Detection Controls */}
      <div className="card">
        <h2 className="card-title">Run Anomaly Detection</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              Select Equipment
            </label>
            <select
              value={selectedEquipment}
              onChange={(e) => setSelectedEquipment(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
              }}
            >
              <option value="">-- Select Equipment --</option>
              {equipment.map((eq) => (
                <option key={eq.equipmentId} value={eq.equipmentId}>
                  {eq.equipmentId} - {typeof eq.name === 'string' ? eq.name : (eq.name as string[])?.[0]}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleDetect}
            disabled={!selectedEquipment || detecting}
          >
            {detecting ? 'Detecting...' : 'Detect Anomalies'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleDetectAll}
            disabled={detecting}
          >
            {detecting ? 'Detecting...' : 'Detect All Equipment'}
          </button>
        </div>

        {/* Detection Result */}
        {detectionResult && (
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f7fafc', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
              Detection Result
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              <div>
                <div style={{ color: '#718096', fontSize: '0.875rem' }}>Status</div>
                <div style={{
                  fontWeight: 600,
                  color: detectionResult.is_anomaly ? '#e53e3e' : '#38a169',
                }}>
                  {detectionResult.is_anomaly ? 'Anomaly Detected' : 'Normal'}
                </div>
              </div>
              <div>
                <div style={{ color: '#718096', fontSize: '0.875rem' }}>Type</div>
                <div style={{ fontWeight: 600 }}>{detectionResult.anomaly_type}</div>
              </div>
              <div>
                <div style={{ color: '#718096', fontSize: '0.875rem' }}>Severity</div>
                <div style={{ fontWeight: 600 }}>{(detectionResult.severity * 100).toFixed(0)}%</div>
              </div>
              <div>
                <div style={{ color: '#718096', fontSize: '0.875rem' }}>Score</div>
                <div style={{ fontWeight: 600 }}>{detectionResult.anomaly_score.toFixed(3)}</div>
              </div>
            </div>

            {detectionResult.details?.anomalies_detected?.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Detected Issues:
                </h4>
                <ul style={{ paddingLeft: '1.5rem' }}>
                  {detectionResult.details.anomalies_detected.map((detail, index) => (
                    <li key={index} style={{ marginBottom: '0.5rem' }}>
                      <strong>{detail.indicator}</strong>: {detail.value.toFixed(2)} (threshold: {detail.threshold})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Anomaly History */}
      <div className="card">
        <h2 className="card-title">Anomaly History</h2>
        {anomalies.length === 0 ? (
          <p style={{ color: '#718096' }}>No anomalies recorded</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Detected At</th>
                <th>Equipment</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map((anomaly, index) => (
                <tr key={index}>
                  <td>{new Date(anomaly.detectedAt).toLocaleString()}</td>
                  <td>
                    <strong>{anomaly.equipmentId}</strong>
                    {anomaly.equipmentName && (
                      <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                        {anomaly.equipmentName}
                      </div>
                    )}
                  </td>
                  <td>{anomaly.anomalyType?.split('#').pop() || 'Unknown'}</td>
                  <td>
                    <span
                      className={`badge badge-${getSeverityClass(anomaly.severity) === 'high' ? 'critical' :
                        getSeverityClass(anomaly.severity) === 'medium' ? 'warning' : 'normal'}`}
                    >
                      {getSeverityLabel(anomaly.severity)}
                    </span>
                  </td>
                  <td>{(anomaly.anomalyScore * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AnomalyMonitor;
