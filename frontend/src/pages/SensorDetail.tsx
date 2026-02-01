import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, ReferenceArea, Brush,
  PieChart, Pie, Cell,
} from 'recharts';
import { sensorApi, equipmentApi } from '../services/api';
import type { Sensor, Observation, Equipment } from '../types';

// ─── Helper Functions ────────────────────────────────────────────
const getSensorTypeIcon = (type: string): string => {
  const icons: Record<string, string> = {
    PressureSensor: '\u{1F4CA}', FlowSensor: '\u{1F30A}',
    ConductivitySensor: '\u{26A1}', TemperatureSensor: '\u{1F321}',
    PowerMeter: '\u{1F50B}', VibrationSensor: '\u{1F4F3}',
    VoltageSensor: '\u{26A1}', CurrentSensor: '\u{1F50C}',
    UVIntensitySensor: '\u{2600}', LevelSensor: '\u{1F4CF}',
    TurbiditySensor: '\u{1F4A7}', DifferentialPressureSensor: '\u{2195}',
  };
  return icons[type] || '\u{1F4E1}';
};

const getSensorTypeColor = (type: string): string => {
  const colors: Record<string, string> = {
    PressureSensor: '#3182ce', FlowSensor: '#00b5d8',
    ConductivitySensor: '#805ad5', TemperatureSensor: '#dd6b20',
    PowerMeter: '#38a169', VibrationSensor: '#e53e3e',
    VoltageSensor: '#d69e2e', CurrentSensor: '#2c5282',
    UVIntensitySensor: '#ed8936', LevelSensor: '#319795',
    TurbiditySensor: '#718096', DifferentialPressureSensor: '#553c9a',
  };
  return colors[type] || '#4a5568';
};

const isUpperThreshold = (sensor: Sensor): boolean => {
  const warn = sensor.warningThreshold ?? sensor.normalMax;
  const normMax = sensor.normalMax ?? sensor.normalRangeMax;
  if (warn != null && normMax != null) return warn > normMax;
  return true;
};

const getSensorStatus = (value: number, sensor: Sensor): string => {
  const normMin = sensor.normalMin ?? sensor.normalRangeMin;
  const normMax = sensor.normalMax ?? sensor.normalRangeMax;
  const upper = isUpperThreshold(sensor);
  if (upper) {
    if (sensor.criticalThreshold != null && value >= sensor.criticalThreshold) return 'critical';
    if (sensor.warningThreshold != null && value >= sensor.warningThreshold) return 'warning';
    if (normMax != null && value > normMax) return 'warning';
    if (normMin != null && value < normMin) return 'warning';
  } else {
    if (sensor.criticalThreshold != null && value <= sensor.criticalThreshold) return 'critical';
    if (sensor.warningThreshold != null && value <= sensor.warningThreshold) return 'warning';
    if (normMin != null && value < normMin) return 'warning';
    if (normMax != null && value > normMax) return 'warning';
  }
  return 'normal';
};

const ZONE_COLORS = ['#38a169', '#dd6b20', '#e53e3e'];

// ─── Main Component ──────────────────────────────────────────────
const SensorDetail: React.FC = () => {
  const { equipmentId, sensorId } = useParams<{ equipmentId: string; sensorId: string }>();
  const [sensor, setSensor] = useState<Sensor | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<string>('All');

  // Fetch data
  useEffect(() => {
    if (!sensorId || !equipmentId) return;
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [sensorRes, eqRes, obsRes] = await Promise.all([
          sensorApi.getById(sensorId),
          equipmentApi.getById(equipmentId),
          sensorApi.getObservations(sensorId, undefined, undefined, 500),
        ]);
        if (sensorRes.status === 'success' && sensorRes.data) setSensor(sensorRes.data);
        if (eqRes.status === 'success' && eqRes.data) setEquipment(eqRes.data);
        if (obsRes.status === 'success' && obsRes.data) setObservations(obsRes.data);
      } catch (err) {
        setError('Failed to load sensor data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [sensorId, equipmentId]);

  // Time-filtered observations
  const filteredObs = useMemo(() => {
    if (observations.length === 0) return [];
    // Observations come DESC from API, reverse for chronological order
    const sorted = [...observations].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    if (timeRange === 'All') return sorted;

    const latest = new Date(sorted[sorted.length - 1].timestamp).getTime();
    const rangeMs: Record<string, number> = {
      '1H': 3600000, '6H': 21600000, '24H': 86400000, '7D': 604800000,
    };
    const cutoff = latest - (rangeMs[timeRange] || Infinity);
    return sorted.filter(o => new Date(o.timestamp).getTime() >= cutoff);
  }, [observations, timeRange]);

  // Format timestamp for chart
  const formatTime = useCallback((ts: string) => {
    const d = new Date(ts);
    if (timeRange === '1H' || timeRange === '6H') {
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }
    if (timeRange === '24H') {
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:00`;
  }, [timeRange]);

  // Chart data
  const chartData = useMemo(() => {
    return filteredObs.map(o => ({
      time: formatTime(o.timestamp),
      value: o.value,
      fullTime: o.timestamp,
    }));
  }, [filteredObs, formatTime]);

  // Statistics
  const stats = useMemo(() => {
    if (filteredObs.length === 0 || !sensor) return null;
    const values = filteredObs.map(o => o.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    let normalCount = 0, warningCount = 0, criticalCount = 0;
    values.forEach(v => {
      const st = getSensorStatus(v, sensor);
      if (st === 'critical') criticalCount++;
      else if (st === 'warning') warningCount++;
      else normalCount++;
    });
    const total = values.length;

    return {
      current: values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
      average: avg,
      stdDev,
      normalPct: (normalCount / total) * 100,
      warningPct: (warningCount / total) * 100,
      criticalPct: (criticalCount / total) * 100,
      count: total,
    };
  }, [filteredObs, sensor]);

  // Trend
  const trend = useMemo(() => {
    if (filteredObs.length < 6) return { direction: 'stable', pct: 0 };
    const recent = filteredObs.slice(-6);
    const earlier = filteredObs.slice(-12, -6);
    if (earlier.length === 0) return { direction: 'stable', pct: 0 };
    const avgR = recent.reduce((s, o) => s + o.value, 0) / recent.length;
    const avgE = earlier.reduce((s, o) => s + o.value, 0) / earlier.length;
    const pct = avgE !== 0 ? ((avgR - avgE) / Math.abs(avgE)) * 100 : 0;
    if (pct > 1) return { direction: 'rising', pct: Math.abs(pct) };
    if (pct < -1) return { direction: 'falling', pct: Math.abs(pct) };
    return { direction: 'stable', pct: Math.abs(pct) };
  }, [filteredObs]);

  // Zone distribution for pie chart
  const zoneData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Normal', value: Math.round(stats.normalPct) },
      { name: 'Warning', value: Math.round(stats.warningPct) },
      { name: 'Critical', value: Math.round(stats.criticalPct) },
    ].filter(d => d.value > 0);
  }, [stats]);

  // Threshold analysis
  const thresholdAnalysis = useMemo(() => {
    if (!sensor || !stats) return null;
    const normMin = sensor.normalMin ?? sensor.normalRangeMin;
    const normMax = sensor.normalMax ?? sensor.normalRangeMax;
    const minVal = sensor.minValue ?? 0;
    const maxVal = sensor.maxValue ?? 100;
    const range = maxVal - minVal || 1;

    const currentPct = ((stats.current - minVal) / range) * 100;
    const upper = isUpperThreshold(sensor);

    let distToWarning = 0;
    let distToCritical = 0;
    if (upper) {
      distToWarning = (sensor.warningThreshold ?? Infinity) - stats.current;
      distToCritical = (sensor.criticalThreshold ?? Infinity) - stats.current;
    } else {
      distToWarning = stats.current - (sensor.warningThreshold ?? -Infinity);
      distToCritical = stats.current - (sensor.criticalThreshold ?? -Infinity);
    }

    let warningViolations = 0, criticalViolations = 0;
    filteredObs.forEach(o => {
      const st = getSensorStatus(o.value, sensor);
      if (st === 'warning') warningViolations++;
      if (st === 'critical') criticalViolations++;
    });

    return {
      currentPct: Math.min(100, Math.max(0, currentPct)),
      distToWarning,
      distToCritical,
      warningViolations,
      criticalViolations,
      normMin, normMax, minVal, maxVal,
    };
  }, [sensor, stats, filteredObs]);

  // Y-axis domain
  const yDomain = useMemo(() => {
    if (!sensor || chartData.length === 0) return [0, 100];
    const values = chartData.map(d => d.value);
    const allValues = [
      ...values,
      sensor.minValue, sensor.maxValue,
      sensor.normalMin ?? sensor.normalRangeMin,
      sensor.normalMax ?? sensor.normalRangeMax,
      sensor.warningThreshold, sensor.criticalThreshold,
    ].filter((v): v is number => v != null);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const pad = (max - min) * 0.08 || 1;
    return [min - pad, max + pad];
  }, [sensor, chartData]);

  // ─── Render ──────────────────────────────────────────────────
  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }
  if (error || !sensor) {
    return <div className="error-message">{error || 'Sensor not found'}</div>;
  }

  const sensorUnit = sensor.unit || '';
  const normMin = sensor.normalMin ?? sensor.normalRangeMin;
  const normMax = sensor.normalMax ?? sensor.normalRangeMax;
  const currentStatus = stats ? getSensorStatus(stats.current, sensor) : 'normal';
  const eqName = equipment
    ? (typeof equipment.name === 'string' ? equipment.name : (equipment.name as any)?.[0] || equipmentId)
    : equipmentId;

  return (
    <div className="equipment-page">
      {/* Section 1: Breadcrumb */}
      <div className="breadcrumb">
        <Link to="/equipment">Equipment Management</Link>
        <span className="breadcrumb-separator">/</span>
        <Link to="/equipment">{eqName}</Link>
        <span className="breadcrumb-separator">/</span>
        <span style={{ color: '#2d3748', fontWeight: 500 }}>{sensor.name || sensorId}</span>
      </div>

      {/* Section 2: Sensor Info Header */}
      <div className="sensor-detail-header">
        <div className="sensor-detail-icon" style={{ background: `${getSensorTypeColor(sensor.type || '')}15`, color: getSensorTypeColor(sensor.type || '') }}>
          {getSensorTypeIcon(sensor.type || '')}
        </div>
        <div className="sensor-detail-title" style={{ flex: 1 }}>
          <h1>{sensor.name || sensorId}</h1>
          <div className="sensor-detail-subtitle">
            {sensor.type} | {sensorUnit} | Equipment: {eqName} ({equipmentId})
          </div>
        </div>
        <span className={`badge badge-${currentStatus}`} style={{ fontSize: '0.85rem', padding: '0.35rem 1rem' }}>
          {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
        </span>
      </div>

      {/* Section 3: Main Time-Series Chart */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 className="card-title" style={{ margin: 0 }}>Observation History ({filteredObs.length} points)</h2>
          <div className="time-range-selector">
            {['1H', '6H', '24H', '7D', 'All'].map(range => (
              <button
                key={range}
                className={`time-range-btn ${timeRange === range ? 'active' : ''}`}
                onClick={() => setTimeRange(range)}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', fontSize: '0.68rem', color: '#718096' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 14, height: 6, background: 'rgba(72,187,120,0.25)', borderRadius: 2, display: 'inline-block' }}></span>
            Normal Range
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 14, height: 2, background: '#dd6b20', borderStyle: 'dashed', display: 'inline-block' }}></span>
            Warning
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 14, height: 2, background: '#e53e3e', borderStyle: 'dashed', display: 'inline-block' }}></span>
            Critical
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 14, height: 2, background: '#3182ce', display: 'inline-block' }}></span>
            Sensor Value
          </span>
        </div>

        <div style={{ height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#a0aec0' }} interval="preserveStartEnd" />
              <YAxis domain={yDomain} tick={{ fontSize: 11, fill: '#718096' }} width={55} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem' }}
                formatter={(v: number) => [`${v.toFixed(3)} ${sensorUnit}`, sensor.name || 'Value']}
                labelFormatter={(label: string) => `Time: ${label}`}
              />

              {normMin != null && normMax != null && (
                <ReferenceArea y1={normMin} y2={normMax} fill="#48bb78" fillOpacity={0.12} />
              )}

              {sensor.warningThreshold != null && (
                <ReferenceLine
                  y={sensor.warningThreshold}
                  stroke="#dd6b20"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{ value: `Warning (${sensor.warningThreshold})`, position: 'right', fill: '#dd6b20', fontSize: 10 }}
                />
              )}

              {sensor.criticalThreshold != null && (
                <ReferenceLine
                  y={sensor.criticalThreshold}
                  stroke="#e53e3e"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{ value: `Critical (${sensor.criticalThreshold})`, position: 'right', fill: '#e53e3e', fontSize: 10 }}
                />
              )}

              {sensor.minValue != null && (
                <ReferenceLine y={sensor.minValue} stroke="#a0aec0" strokeDasharray="3 3" strokeWidth={1} />
              )}
              {sensor.maxValue != null && (
                <ReferenceLine y={sensor.maxValue} stroke="#a0aec0" strokeDasharray="3 3" strokeWidth={1} />
              )}

              <Line
                type="monotone"
                dataKey="value"
                stroke="#3182ce"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#3182ce' }}
              />

              {chartData.length > 30 && (
                <Brush dataKey="time" height={28} stroke="#2c5282" travellerWidth={8} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 4: Statistics Cards */}
      {stats && (
        <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card-enhanced" style={{ borderLeftColor: '#3182ce' }}>
            <div className="stat-value">{stats.current.toFixed(2)}</div>
            <div className="stat-label">Current ({sensorUnit})</div>
            <div className="stat-sub-info">
              <span className={`trend-indicator ${trend.direction}`}>
                {trend.direction === 'rising' ? '\u2191' : trend.direction === 'falling' ? '\u2193' : '\u2192'}
                {' '}{trend.pct.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="stat-card-enhanced" style={{ borderLeftColor: '#38a169' }}>
            <div className="stat-value">{stats.min.toFixed(2)} - {stats.max.toFixed(2)}</div>
            <div className="stat-label">Min / Max Observed</div>
            <div className="stat-sub-info">Range: {(stats.max - stats.min).toFixed(3)}</div>
          </div>
          <div className="stat-card-enhanced" style={{ borderLeftColor: '#dd6b20' }}>
            <div className="stat-value">{stats.average.toFixed(2)}</div>
            <div className="stat-label">Average</div>
            <div className="stat-sub-info">Std Dev: {stats.stdDev.toFixed(3)}</div>
          </div>
          <div className="stat-card-enhanced" style={{ borderLeftColor: '#805ad5' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: 60, height: 60 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={zoneData} innerRadius={18} outerRadius={28} dataKey="value" paddingAngle={2}>
                      {zoneData.map((_, i) => {
                        const colorIdx = _.name === 'Normal' ? 0 : _.name === 'Warning' ? 1 : 2;
                        return <Cell key={i} fill={ZONE_COLORS[colorIdx]} />;
                      })}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div>
                <span className="zone-label"><span className="zone-dot" style={{ background: '#38a169' }}></span>{stats.normalPct.toFixed(0)}%N</span>
                <span className="zone-label"><span className="zone-dot" style={{ background: '#dd6b20' }}></span>{stats.warningPct.toFixed(0)}%W</span>
                <span className="zone-label"><span className="zone-dot" style={{ background: '#e53e3e' }}></span>{stats.criticalPct.toFixed(0)}%C</span>
              </div>
            </div>
            <div className="stat-label">Zone Distribution</div>
          </div>
        </div>
      )}

      {/* Section 5: Threshold Analysis */}
      {thresholdAnalysis && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="card-title">Threshold Analysis</h2>
          <div className="grid-2">
            {/* Left: Gauge */}
            <div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#a0aec0', marginBottom: '0.25rem' }}>
                  <span>{thresholdAnalysis.minVal}</span>
                  <span>{thresholdAnalysis.maxVal}</span>
                </div>
                <div className="threshold-gauge">
                  <div className="threshold-gauge-indicator" style={{ left: `${thresholdAnalysis.currentPct}%` }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: '#718096', marginTop: '0.25rem' }}>
                  <span>Min</span>
                  {normMin != null && <span style={{ color: '#38a169' }}>Normal: {normMin}</span>}
                  {normMax != null && <span style={{ color: '#38a169' }}>{normMax}</span>}
                  <span>Max</span>
                </div>
              </div>

              <div className="grid-2">
                <div style={{ padding: '0.65rem', background: '#fffff0', borderRadius: '8px', border: '1px solid #fef3c7' }}>
                  <div className="equipment-spec-label" style={{ color: '#92400e' }}>Distance to Warning</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: thresholdAnalysis.distToWarning > 0 ? '#38a169' : '#dd6b20' }}>
                    {thresholdAnalysis.distToWarning.toFixed(2)} {sensorUnit}
                  </div>
                </div>
                <div style={{ padding: '0.65rem', background: '#fff5f5', borderRadius: '8px', border: '1px solid #fed7d7' }}>
                  <div className="equipment-spec-label" style={{ color: '#c53030' }}>Distance to Critical</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: thresholdAnalysis.distToCritical > 0 ? '#38a169' : '#e53e3e' }}>
                    {thresholdAnalysis.distToCritical.toFixed(2)} {sensorUnit}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Violations */}
            <div>
              <div style={{ padding: '0.75rem', background: '#fffff0', borderRadius: '8px', marginBottom: '0.6rem', border: '1px solid #fef3c7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: '#744210' }}>Warning Threshold Violations</span>
                  <strong style={{ fontSize: '1.1rem', color: '#dd6b20' }}>{thresholdAnalysis.warningViolations}</strong>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#a0aec0', marginTop: '0.2rem' }}>
                  {stats ? ((thresholdAnalysis.warningViolations / stats.count) * 100).toFixed(1) : 0}% of observations
                </div>
              </div>
              <div style={{ padding: '0.75rem', background: '#fff5f5', borderRadius: '8px', border: '1px solid #fed7d7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: '#742a2a' }}>Critical Threshold Violations</span>
                  <strong style={{ fontSize: '1.1rem', color: '#e53e3e' }}>{thresholdAnalysis.criticalViolations}</strong>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#a0aec0', marginTop: '0.2rem' }}>
                  {stats ? ((thresholdAnalysis.criticalViolations / stats.count) * 100).toFixed(1) : 0}% of observations
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 6: Recent Observations Table */}
      <div className="card">
        <h2 className="card-title">Recent Observations ({Math.min(filteredObs.length, 100)})</h2>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          <table className="observations-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Status</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {filteredObs.slice().reverse().slice(0, 100).map((obs, i, arr) => {
                const status = getSensorStatus(obs.value, sensor);
                const prev = arr[i + 1];
                const delta = prev ? obs.value - prev.value : 0;
                const ts = new Date(obs.timestamp);
                const timeStr = `${ts.getFullYear()}-${(ts.getMonth()+1).toString().padStart(2,'0')}-${ts.getDate().toString().padStart(2,'0')} ${ts.getHours().toString().padStart(2,'0')}:${ts.getMinutes().toString().padStart(2,'0')}:${ts.getSeconds().toString().padStart(2,'0')}`;
                return (
                  <tr key={i} className={status === 'critical' ? 'obs-critical' : status === 'warning' ? 'obs-warning' : ''}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{timeStr}</td>
                    <td><strong>{obs.value.toFixed(3)}</strong></td>
                    <td>{obs.unit || sensorUnit}</td>
                    <td>
                      <span className={`badge badge-${status}`} style={{ fontSize: '0.65rem' }}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </td>
                    <td>
                      <span className={`trend-indicator ${delta > 0 ? 'rising' : delta < 0 ? 'falling' : 'stable'}`}
                        style={{ fontSize: '0.75rem' }}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(4)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SensorDetail;
