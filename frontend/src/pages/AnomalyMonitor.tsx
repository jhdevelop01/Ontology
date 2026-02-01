import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, ReferenceArea,
  BarChart, Bar, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { anomalyApi, equipmentApi } from '../services/api';
import type { Anomaly, Equipment, AnomalyResult, SensorDashboardData, SensorWithObservations } from '../types';

// ── Helpers ──────────────────────────────────────────

const getHealthColor = (score: number) => {
  if (score >= 90) return '#38a169';
  if (score >= 80) return '#d69e2e';
  if (score >= 70) return '#dd6b20';
  return '#e53e3e';
};

const getSeverityLabel = (s: number) => s >= 0.7 ? 'High' : s >= 0.4 ? 'Medium' : 'Low';
const getSeverityBadge = (s: number) => s >= 0.7 ? 'badge-critical' : s >= 0.4 ? 'badge-warning' : 'badge-normal';

const isUpperThreshold = (sensor: SensorWithObservations) => {
  if (sensor.warningThreshold == null || sensor.normalMax == null || sensor.normalMin == null) return true;
  return sensor.warningThreshold > sensor.normalMax;
};

const getSensorStatus = (value: number, sensor: SensorWithObservations): 'normal' | 'warning' | 'critical' => {
  const upper = isUpperThreshold(sensor);
  if (upper) {
    if (sensor.criticalThreshold != null && value >= sensor.criticalThreshold) return 'critical';
    if (sensor.warningThreshold != null && value >= sensor.warningThreshold) return 'warning';
  } else {
    if (sensor.criticalThreshold != null && value <= sensor.criticalThreshold) return 'critical';
    if (sensor.warningThreshold != null && value <= sensor.warningThreshold) return 'warning';
  }
  return 'normal';
};

const getProximity = (value: number, sensor: SensorWithObservations): number => {
  const upper = isUpperThreshold(sensor);
  if (sensor.warningThreshold == null || sensor.normalMax == null || sensor.normalMin == null) return 0;
  if (upper) {
    const range = sensor.warningThreshold - sensor.normalMax;
    if (range <= 0) return 0;
    const dist = value - sensor.normalMax;
    return Math.min(100, Math.max(0, (dist / range) * 100));
  } else {
    const range = sensor.normalMin - sensor.warningThreshold;
    if (range <= 0) return 0;
    const dist = sensor.normalMin - value;
    return Math.min(100, Math.max(0, (dist / range) * 100));
  }
};

const getActionText = (status: string, trend: string, sensorType: string): { text: string; cls: string } => {
  if (status === 'critical') {
    if (sensorType.includes('Pressure')) return { text: 'Inspect membrane immediately', cls: 'urgent' };
    if (sensorType.includes('UV')) return { text: 'Replace UV lamp', cls: 'urgent' };
    if (sensorType.includes('Vibration')) return { text: 'Check bearing condition', cls: 'urgent' };
    return { text: 'Immediate inspection required', cls: 'urgent' };
  }
  if (status === 'warning') return { text: 'Schedule maintenance', cls: 'monitor' };
  if (trend === 'rising' || trend === 'falling') return { text: 'Monitor trend', cls: 'monitor' };
  return { text: 'Normal operation', cls: 'normal' };
};

const PIE_COLORS = ['#e53e3e', '#dd6b20', '#38a169'];

// ── Component ────────────────────────────────────────

const AnomalyMonitor: React.FC = () => {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [detectionResult, setDetectionResult] = useState<AnomalyResult | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sensorDashboard, setSensorDashboard] = useState<SensorDashboardData | null>(null);
  const [loadingSensors, setLoadingSensors] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [anomaliesRes, equipmentRes] = await Promise.all([
          anomalyApi.getHistory(undefined, undefined, 50),
          equipmentApi.getAll(),
        ]);
        if (anomaliesRes.status === 'success' && anomaliesRes.data) setAnomalies(anomaliesRes.data);
        if (equipmentRes.status === 'success' && equipmentRes.data) setEquipment(equipmentRes.data);
      } catch (err) {
        setError('Failed to load data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const fetchSensorDashboard = useCallback(async (eqId: string) => {
    if (!eqId) { setSensorDashboard(null); return; }
    setLoadingSensors(true);
    try {
      const res = await anomalyApi.getSensorDashboard(eqId);
      if (res.status === 'success' && res.data) setSensorDashboard(res.data);
    } catch (err) {
      console.error('Failed to fetch sensor dashboard', err);
    } finally {
      setLoadingSensors(false);
    }
  }, []);

  const handleSelectEquipment = useCallback((eqId: string) => {
    setSelectedEquipment(eqId);
    setDetectionResult(null);
    fetchSensorDashboard(eqId);
  }, [fetchSensorDashboard]);

  const handleDetect = async () => {
    if (!selectedEquipment) return;
    setDetecting(true);
    setDetectionResult(null);
    try {
      const response = await anomalyApi.detect(selectedEquipment);
      if (response.status === 'success' && response.data) {
        setDetectionResult(response.data);
        const historyRes = await anomalyApi.getHistory(undefined, undefined, 50);
        if (historyRes.status === 'success' && historyRes.data) setAnomalies(historyRes.data);
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
        const historyRes = await anomalyApi.getHistory(undefined, undefined, 50);
        if (historyRes.status === 'success' && historyRes.data) setAnomalies(historyRes.data);
      }
    } catch (err) {
      setError('Failed to run anomaly detection');
      console.error(err);
    } finally {
      setDetecting(false);
    }
  };

  // ── Derived data ──

  const totalSensors = useMemo(() =>
    equipment.reduce((sum, eq) => sum + (eq.sensors?.length || 0), 0), [equipment]);

  const atRiskEquipment = useMemo(() =>
    equipment.filter(eq => (eq.healthScore || 100) < 85), [equipment]);

  const avgHealth = useMemo(() => {
    if (equipment.length === 0) return 0;
    return equipment.reduce((sum, eq) => sum + (eq.healthScore || 100), 0) / equipment.length;
  }, [equipment]);

  const anomalySeverityCounts = useMemo(() => {
    let high = 0, medium = 0, low = 0;
    anomalies.forEach(a => {
      if (a.severity >= 0.7) high++;
      else if (a.severity >= 0.4) medium++;
      else low++;
    });
    return { high, medium, low };
  }, [anomalies]);

  const anomalyByEquipment = useMemo(() => {
    const counts: Record<string, { count: number; maxSeverity: number; name: string }> = {};
    anomalies.forEach(a => {
      if (!counts[a.equipmentId]) counts[a.equipmentId] = { count: 0, maxSeverity: 0, name: a.equipmentName || a.equipmentId };
      counts[a.equipmentId].count++;
      counts[a.equipmentId].maxSeverity = Math.max(counts[a.equipmentId].maxSeverity, a.severity);
    });
    return Object.entries(counts)
      .map(([id, data]) => ({ equipmentId: id, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [anomalies]);

  const equipmentAnomalySet = useMemo(() => {
    const s = new Set<string>();
    anomalies.forEach(a => s.add(a.equipmentId));
    return s;
  }, [anomalies]);

  const sensorAnalyses = useMemo(() => {
    if (!sensorDashboard) return [];
    return sensorDashboard.sensors.map(sensor => {
      const obs = sensor.observations;
      if (obs.length === 0) return { sensor, currentValue: 0, trend: 'stable' as const, trendPct: 0, status: 'normal' as const, proximity: 0 };
      const current = obs[obs.length - 1].value;
      const sixHoursAgo = obs.length >= 24 ? obs[obs.length - 24].value : obs[0].value;
      const trendPct = sixHoursAgo !== 0 ? ((current - sixHoursAgo) / Math.abs(sixHoursAgo)) * 100 : 0;
      const trend = Math.abs(trendPct) < 1 ? 'stable' as const : trendPct > 0 ? 'rising' as const : 'falling' as const;
      const status = getSensorStatus(current, sensor);
      const proximity = getProximity(current, sensor);
      return { sensor, currentValue: current, trend, trendPct, status, proximity };
    });
  }, [sensorDashboard]);

  const formatSensorTime = useCallback((ts: string) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }, []);

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div className="anomaly-page">
      <h1 className="page-title">Anomaly Detection Monitor</h1>
      {error && <div className="error-message">{error}</div>}

      {/* ── Section 1: KPI Summary ── */}
      <div className="grid-4">
        <div className="stat-card-enhanced" style={{ borderLeftColor: '#e53e3e' }}>
          <div className="stat-value">{anomalies.length}</div>
          <div className="stat-label">Total Anomalies</div>
          <div className="stat-sub-info">
            <span className="sub-item"><span className="sub-dot" style={{ background: '#e53e3e' }} />{anomalySeverityCounts.high} high</span>
            <span className="sub-item"><span className="sub-dot" style={{ background: '#dd6b20' }} />{anomalySeverityCounts.medium} medium</span>
            <span className="sub-item"><span className="sub-dot" style={{ background: '#38a169' }} />{anomalySeverityCounts.low} low</span>
          </div>
        </div>
        <div className="stat-card-enhanced" style={{ borderLeftColor: '#dd6b20' }}>
          <div className="stat-value">{atRiskEquipment.length}</div>
          <div className="stat-label">At-Risk Equipment</div>
          <div className="stat-sub-info">
            {atRiskEquipment.slice(0, 2).map(eq => (
              <span key={eq.equipmentId} className="sub-item" style={{ fontSize: '0.72rem' }}>
                {eq.equipmentId}: {eq.healthScore?.toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
        <div className="stat-card-enhanced" style={{ borderLeftColor: '#38a169' }}>
          <div className="stat-value">{avgHealth.toFixed(1)}%</div>
          <div className="stat-label">Avg Health Score</div>
          <div className="stat-sub-info">
            <span className="sub-item">{equipment.filter(e => (e.healthScore || 100) >= 90).length} normal</span>
            <span className="sub-item">{equipment.filter(e => (e.healthScore || 100) < 90 && (e.healthScore || 100) >= 80).length} caution</span>
          </div>
        </div>
        <div className="stat-card-enhanced" style={{ borderLeftColor: '#3182ce' }}>
          <div className="stat-value">{totalSensors}</div>
          <div className="stat-label">Sensors Monitored</div>
          <div className="stat-sub-info">
            <span className="sub-item">{equipment.length} equipment</span>
          </div>
        </div>
      </div>

      {/* ── Section 2: Equipment Health Grid ── */}
      <div className="card">
        <div className="widget-header">
          <h2 className="card-title" style={{ margin: 0 }}>Equipment Health Overview</h2>
          <span style={{ fontSize: '0.75rem', color: '#718096' }}>Click to select equipment</span>
        </div>
        <div className="equipment-health-grid" style={{ marginTop: '0.75rem' }}>
          {equipment.map(eq => {
            const score = eq.healthScore || 100;
            const isSelected = selectedEquipment === eq.equipmentId;
            const hasAnomaly = equipmentAnomalySet.has(eq.equipmentId);
            const healthCls = score < 70 ? 'health-critical' : score < 85 ? 'health-warning' : '';
            return (
              <div
                key={eq.equipmentId}
                className={`equipment-health-chip ${isSelected ? 'selected' : ''} ${healthCls}`}
                onClick={() => handleSelectEquipment(eq.equipmentId)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span className="chip-name">
                    {typeof eq.name === 'string' ? eq.name : (eq.name as string[])?.[0]}
                  </span>
                  {hasAnomaly && <span className="chip-anomaly-dot" />}
                </div>
                <span className="chip-id">{eq.equipmentId}</span>
                <div className="chip-health-row">
                  <div className="chip-health-bar">
                    <div className="chip-health-fill" style={{ width: `${score}%`, background: getHealthColor(score) }} />
                  </div>
                  <span className="chip-health-score" style={{ color: getHealthColor(score) }}>{score.toFixed(0)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 3: Sensor Charts ── */}
      {selectedEquipment && (
        <div className="card">
          {sensorDashboard && (
            <div className="selected-eq-header">
              <div className="eq-health-gauge" style={{ background: getHealthColor(sensorDashboard.healthScore || 0) }}>
                {(sensorDashboard.healthScore || 0).toFixed(0)}
              </div>
              <div className="eq-info">
                <h2>{sensorDashboard.equipmentName || sensorDashboard.equipmentId}</h2>
                <div className="eq-sub">{sensorDashboard.equipmentId} | {sensorDashboard.status} | {sensorDashboard.sensors.length} sensors</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={handleDetect} disabled={detecting}>
                  {detecting ? 'Detecting...' : 'Run Detection'}
                </button>
                <button className="btn btn-secondary" onClick={handleDetectAll} disabled={detecting}>
                  Detect All
                </button>
              </div>
            </div>
          )}

          {loadingSensors ? (
            <div className="sensor-empty-state">
              <div className="spinner" />
              <p>Loading sensor data...</p>
            </div>
          ) : sensorDashboard && sensorDashboard.sensors.length > 0 ? (
            <>
              {detectionResult && (
                <div style={{ padding: '0.75rem 1rem', background: detectionResult.is_anomaly ? '#fff5f5' : '#f0fff4', borderRadius: '8px', marginBottom: '1rem', border: `1px solid ${detectionResult.is_anomaly ? '#feb2b2' : '#9ae6b4'}` }}>
                  <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <strong style={{ color: detectionResult.is_anomaly ? '#c53030' : '#276749' }}>
                      {detectionResult.is_anomaly ? 'Anomaly Detected' : 'Normal'}
                    </strong>
                    {detectionResult.is_anomaly && (
                      <>
                        <span>Type: <strong>{detectionResult.anomaly_type}</strong></span>
                        <span>Severity: <strong>{(detectionResult.severity * 100).toFixed(0)}%</strong></span>
                      </>
                    )}
                  </div>
                  {detectionResult.details?.anomalies_detected?.length > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: '#4a5568' }}>
                      {detectionResult.details.anomalies_detected.map((d, i) => (
                        <span key={i} style={{ marginRight: '1.5rem' }}>{d.indicator}: <strong>{d.value.toFixed(2)}</strong> (threshold: {d.threshold})</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="chart-legend-bar" style={{ marginBottom: '0.75rem' }}>
                <span className="chart-legend-item"><span className="chart-legend-area" style={{ background: 'rgba(72,187,120,0.2)', border: '1px solid #48bb78' }} />Normal Range</span>
                <span className="chart-legend-item"><span className="chart-legend-line" style={{ background: '#dd6b20', borderTop: '2px dashed #dd6b20' }} />Warning</span>
                <span className="chart-legend-item"><span className="chart-legend-line" style={{ background: '#e53e3e', borderTop: '2px dashed #e53e3e' }} />Critical</span>
                <span className="chart-legend-item"><span className="chart-legend-line" style={{ background: '#3182ce' }} />Sensor Value</span>
              </div>

              <div className="grid-sensor-charts">
                {sensorDashboard.sensors.filter(s => !s.sensorId.endsWith('-PM')).map(sensor => {
                  const obs = sensor.observations;
                  if (obs.length === 0) return null;
                  const chartData = obs.map(o => ({ time: formatSensorTime(o.timestamp), value: o.value }));
                  const current = obs[obs.length - 1].value;
                  const status = getSensorStatus(current, sensor);
                  const analysis = sensorAnalyses.find(a => a.sensor.sensorId === sensor.sensorId);

                  return (
                    <div key={sensor.sensorId} className="sensor-chart-card">
                      <div className="sensor-chart-header">
                        <h3>{sensor.name} ({sensor.unit})</h3>
                        <span className={`badge badge-${status === 'critical' ? 'critical' : status === 'warning' ? 'warning' : 'normal'}`}>
                          {status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ height: 180 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                            <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#a0aec0' }} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 10, fill: '#718096' }} width={45} domain={['auto', 'auto']} />
                            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v: number) => [`${v.toFixed(2)} ${sensor.unit}`, sensor.name]} />
                            {sensor.normalMin != null && sensor.normalMax != null && (
                              <ReferenceArea y1={sensor.normalMin} y2={sensor.normalMax} fill="#48bb78" fillOpacity={0.12} />
                            )}
                            {sensor.warningThreshold != null && (
                              <ReferenceLine y={sensor.warningThreshold} stroke="#dd6b20" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: 'W', position: 'right', fill: '#dd6b20', fontSize: 10 }} />
                            )}
                            {sensor.criticalThreshold != null && (
                              <ReferenceLine y={sensor.criticalThreshold} stroke="#e53e3e" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: 'C', position: 'right', fill: '#e53e3e', fontSize: 10 }} />
                            )}
                            <Line type="monotone" dataKey="value" stroke="#3182ce" strokeWidth={1.8} dot={false} activeDot={{ r: 3, fill: '#3182ce' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="sensor-status-row">
                        <span className="status-item">Current: <strong style={{ marginLeft: 3 }}>{current.toFixed(2)} {sensor.unit}</strong></span>
                        {analysis && (
                          <>
                            <span className="status-item">
                              Trend:
                              <span className={`trend-indicator ${analysis.trend}`} style={{ marginLeft: 3 }}>
                                {analysis.trend === 'rising' ? '↑' : analysis.trend === 'falling' ? '↓' : '→'}
                                {Math.abs(analysis.trendPct).toFixed(1)}%
                              </span>
                            </span>
                            <span className="status-item">Range: {sensor.normalMin ?? '—'} ~ {sensor.normalMax ?? '—'} {sensor.unit}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="sensor-empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 8v4M12 16h.01"/></svg>
              <p>No sensor data found for this equipment</p>
            </div>
          )}
        </div>
      )}

      {/* ── Section 4: Sensor Insights Table ── */}
      {sensorDashboard && sensorAnalyses.length > 0 && (
        <div className="card">
          <h2 className="card-title">Sensor Health Insights</h2>
          <div style={{ overflow: 'auto' }}>
            <table className="sensor-insights-table">
              <thead>
                <tr>
                  <th>Sensor</th>
                  <th>Current Value</th>
                  <th>Normal Range</th>
                  <th>Status</th>
                  <th>6h Trend</th>
                  <th>Threshold Proximity</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sensorAnalyses.filter(a => !a.sensor.sensorId.endsWith('-PM')).map(({ sensor, currentValue, trend, trendPct, status, proximity }) => {
                  const action = getActionText(status, trend, sensor.type);
                  return (
                    <tr key={sensor.sensorId} className={status === 'critical' ? 'sensor-row-critical' : status === 'warning' ? 'sensor-row-warning' : ''}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{sensor.name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#a0aec0' }}>{sensor.sensorId}</div>
                      </td>
                      <td><strong>{currentValue.toFixed(2)}</strong> {sensor.unit}</td>
                      <td style={{ fontSize: '0.78rem', color: '#718096' }}>{sensor.normalMin ?? '—'} ~ {sensor.normalMax ?? '—'}</td>
                      <td>
                        <span className={`badge badge-${status === 'critical' ? 'critical' : status === 'warning' ? 'warning' : 'normal'}`}>
                          {status === 'critical' ? 'Critical' : status === 'warning' ? 'Warning' : 'Normal'}
                        </span>
                      </td>
                      <td>
                        <span className={`trend-indicator ${trend}`}>
                          {trend === 'rising' ? '↑' : trend === 'falling' ? '↓' : '→'}
                          {Math.abs(trendPct).toFixed(1)}%
                        </span>
                      </td>
                      <td>
                        <div className="proximity-bar">
                          <div className="proximity-bar-fill" style={{
                            width: `${Math.min(100, proximity)}%`,
                            background: proximity > 80 ? '#e53e3e' : proximity > 50 ? '#dd6b20' : '#38a169'
                          }} />
                        </div>
                        <span style={{ fontSize: '0.75rem' }}>{proximity.toFixed(0)}%</span>
                      </td>
                      <td><span className={`action-text ${action.cls}`}>{action.text}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Section 5: Anomaly Analytics ── */}
      {anomalies.length > 0 && (
        <>
          <div className="section-title">Anomaly Analytics</div>
          <div className="grid-2">
            <div className="card">
              <h2 className="card-title">Severity Distribution</h2>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'High', value: anomalySeverityCounts.high },
                        { name: 'Medium', value: anomalySeverityCounts.medium },
                        { name: 'Low', value: anomalySeverityCounts.low },
                      ].filter(d => d.value > 0)}
                      cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                      dataKey="value" paddingAngle={3}
                    >
                      {[anomalySeverityCounts.high, anomalySeverityCounts.medium, anomalySeverityCounts.low]
                        .map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <h2 className="card-title">Anomalies by Equipment</h2>
              <div style={{ height: 260 }}>
                {anomalyByEquipment.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={anomalyByEquipment} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#718096' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#718096' }} width={120} />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {anomalyByEquipment.map((entry, idx) => (
                          <Cell key={idx} fill={entry.maxSeverity >= 0.7 ? '#e53e3e' : entry.maxSeverity >= 0.4 ? '#dd6b20' : '#38a169'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="no-data">No anomaly data</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Section 6: Anomaly History ── */}
      <div className="card">
        <div className="widget-header">
          <h2 className="card-title" style={{ margin: 0 }}>Anomaly History</h2>
          {!selectedEquipment && (
            <button className="btn btn-secondary" onClick={handleDetectAll} disabled={detecting}>
              {detecting ? 'Detecting...' : 'Detect All Equipment'}
            </button>
          )}
        </div>
        {anomalies.length === 0 ? (
          <p style={{ color: '#718096', marginTop: '1rem' }}>No anomalies recorded. Run detection to analyze equipment.</p>
        ) : (
          <div style={{ maxHeight: '400px', overflow: 'auto', marginTop: '0.75rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Detected At</th>
                  <th>Equipment</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Score</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((anomaly, index) => {
                  const sevClass = anomaly.severity >= 0.7 ? 'risk-critical' : anomaly.severity >= 0.4 ? 'risk-warning' : '';
                  return (
                    <tr key={index} className={sevClass} style={{ cursor: 'pointer' }} onClick={() => handleSelectEquipment(anomaly.equipmentId)}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(anomaly.detectedAt).toLocaleString()}</td>
                      <td>
                        <strong>{anomaly.equipmentId}</strong>
                        {anomaly.equipmentName && <div style={{ fontSize: '0.72rem', color: '#718096' }}>{anomaly.equipmentName}</div>}
                      </td>
                      <td>{anomaly.anomalyType?.split('#').pop() || 'Unknown'}</td>
                      <td><span className={`badge ${getSeverityBadge(anomaly.severity)}`}>{getSeverityLabel(anomaly.severity)}</span></td>
                      <td>{(anomaly.anomalyScore * 100).toFixed(0)}%</td>
                      <td>
                        <span className={`action-text ${anomaly.severity >= 0.7 ? 'urgent' : anomaly.severity >= 0.4 ? 'monitor' : 'normal'}`}>
                          {anomaly.severity >= 0.7 ? 'Immediate action' : anomaly.severity >= 0.4 ? 'Schedule maintenance' : 'Monitor'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!selectedEquipment && (
        <div className="card">
          <div className="sensor-empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Select an equipment from the Health Overview above to view sensor time-series charts with threshold indicators</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnomalyMonitor;
