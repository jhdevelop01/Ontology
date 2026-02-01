import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import { equipmentApi, anomalyApi } from '../services/api';
import type { Equipment, SensorDashboardData, SensorWithObservations } from '../types';

// ─── Helper Functions ────────────────────────────────────────────
const getHealthClass = (score: number) => {
  if (score >= 85) return 'normal';
  if (score >= 70) return 'warning';
  return 'critical';
};

const getHealthLabel = (score: number) => {
  if (score >= 85) return 'Normal';
  if (score >= 70) return 'Warning';
  return 'Critical';
};

const isUpperThreshold = (sensor: SensorWithObservations): boolean => {
  if (sensor.warningThreshold != null && sensor.normalMax != null) {
    return sensor.warningThreshold > sensor.normalMax;
  }
  return true;
};

const getSensorStatus = (value: number, sensor: SensorWithObservations): string => {
  const upper = isUpperThreshold(sensor);
  if (upper) {
    if (sensor.criticalThreshold != null && value >= sensor.criticalThreshold) return 'critical';
    if (sensor.warningThreshold != null && value >= sensor.warningThreshold) return 'warning';
    if (sensor.normalMax != null && value > sensor.normalMax) return 'warning';
    if (sensor.normalMin != null && value < sensor.normalMin) return 'warning';
  } else {
    if (sensor.criticalThreshold != null && value <= sensor.criticalThreshold) return 'critical';
    if (sensor.warningThreshold != null && value <= sensor.warningThreshold) return 'warning';
    if (sensor.normalMin != null && value < sensor.normalMin) return 'warning';
    if (sensor.normalMax != null && value > sensor.normalMax) return 'warning';
  }
  return 'normal';
};

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

// ─── Main Component ──────────────────────────────────────────────
const EquipmentList: React.FC = () => {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [equipmentDetail, setEquipmentDetail] = useState<any>(null);
  const [sensorDashboard, setSensorDashboard] = useState<SensorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSensors, setLoadingSensors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const navigate = useNavigate();

  // Fetch all equipment
  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        const response = await equipmentApi.getAll();
        if (response.status === 'success' && response.data) {
          setEquipment(response.data);
        }
      } catch (err) {
        setError('Failed to load equipment');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchEquipment();
  }, []);

  // Select equipment handler
  const handleSelectEquipment = useCallback(async (eq: Equipment) => {
    setSelectedEquipment(eq);
    setLoadingSensors(true);
    setSensorDashboard(null);
    setEquipmentDetail(null);
    try {
      const [detailRes, dashboardRes] = await Promise.all([
        equipmentApi.getById(eq.equipmentId),
        anomalyApi.getSensorDashboard(eq.equipmentId, 48),
      ]);
      if (detailRes.status === 'success' && detailRes.data) {
        setEquipmentDetail(detailRes.data);
      }
      if (dashboardRes.status === 'success' && dashboardRes.data) {
        setSensorDashboard(dashboardRes.data);
      }
    } catch (err) {
      console.error('Failed to load equipment details:', err);
    } finally {
      setLoadingSensors(false);
    }
  }, []);

  // ─── Computed Values ─────────────────────────────────────────
  const areas = useMemo(() => {
    const areaSet = new Set<string>();
    equipment.forEach(eq => { if (eq.areaName) areaSet.add(eq.areaName); });
    return Array.from(areaSet).sort();
  }, [equipment]);

  const filteredEquipment = useMemo(() => {
    return equipment.filter(eq => {
      const name = typeof eq.name === 'string' ? eq.name : '';
      const matchesSearch = !searchQuery ||
        eq.equipmentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (eq.nameEn || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesArea = areaFilter === 'all' || eq.areaName === areaFilter;
      return matchesSearch && matchesArea;
    });
  }, [equipment, searchQuery, areaFilter]);

  const totalSensors = useMemo(() =>
    equipment.reduce((sum, eq) => sum + (eq.sensorCount || 0), 0),
  [equipment]);

  const avgHealth = useMemo(() => {
    const scored = equipment.filter(eq => eq.healthScore != null);
    if (scored.length === 0) return 0;
    return scored.reduce((sum, eq) => sum + (eq.healthScore || 0), 0) / scored.length;
  }, [equipment]);

  const healthDist = useMemo(() => {
    let normal = 0, warning = 0, critical = 0;
    equipment.forEach(eq => {
      const s = eq.healthScore || 0;
      if (s >= 85) normal++;
      else if (s >= 70) warning++;
      else critical++;
    });
    return { normal, warning, critical };
  }, [equipment]);

  const criticalEquipment = useMemo(() =>
    equipment.filter(eq => (eq.healthScore || 0) < 70),
  [equipment]);

  const sensorTypes = useMemo(() => {
    const types = new Set<string>();
    equipment.forEach(eq => {
      if (eq.type) types.add(eq.type);
    });
    return types.size;
  }, [equipment]);

  // ─── Sensor Sparkline Helpers ────────────────────────────────
  const getSensorChartData = useCallback((sensor: SensorWithObservations) => {
    return sensor.observations.map((obs, i) => ({
      idx: i,
      value: obs.value,
    }));
  }, []);

  const getCurrentValue = useCallback((sensor: SensorWithObservations) => {
    if (sensor.observations.length === 0) return null;
    return sensor.observations[sensor.observations.length - 1].value;
  }, []);

  const getTrend = useCallback((sensor: SensorWithObservations) => {
    const obs = sensor.observations;
    if (obs.length < 6) return { direction: 'stable' as const, pct: 0 };
    const recent = obs.slice(-6);
    const earlier = obs.slice(-12, -6);
    if (earlier.length === 0) return { direction: 'stable' as const, pct: 0 };
    const avgRecent = recent.reduce((s, o) => s + o.value, 0) / recent.length;
    const avgEarlier = earlier.reduce((s, o) => s + o.value, 0) / earlier.length;
    const pct = avgEarlier !== 0 ? ((avgRecent - avgEarlier) / Math.abs(avgEarlier)) * 100 : 0;
    if (pct > 1) return { direction: 'rising' as const, pct: Math.abs(pct) };
    if (pct < -1) return { direction: 'falling' as const, pct: Math.abs(pct) };
    return { direction: 'stable' as const, pct: Math.abs(pct) };
  }, []);

  const getRangeBarStyle = useCallback((sensor: SensorWithObservations, currentVal: number | null) => {
    const min = sensor.minValue ?? 0;
    const max = sensor.maxValue ?? 100;
    const range = max - min || 1;
    const normalLeft = sensor.normalMin != null ? ((sensor.normalMin - min) / range) * 100 : 0;
    const normalWidth = (sensor.normalMin != null && sensor.normalMax != null)
      ? ((sensor.normalMax - sensor.normalMin) / range) * 100 : 100;
    const indicatorLeft = currentVal != null
      ? Math.min(100, Math.max(0, ((currentVal - min) / range) * 100)) : 50;
    return { normalLeft, normalWidth, indicatorLeft };
  }, []);

  // ─── Render ──────────────────────────────────────────────────
  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }
  if (error) {
    return <div className="error-message">{error}</div>;
  }

  const eqName = (eq: Equipment) =>
    typeof eq.name === 'string' ? eq.name : (eq.name as any)?.[0] || eq.equipmentId;

  return (
    <div className="equipment-page">
      <h1 className="page-title">Equipment Management</h1>

      {/* ── Section 1: KPI Summary ── */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card-enhanced" style={{ borderLeftColor: '#2c5282' }}>
          <div className="stat-value">{equipment.length}</div>
          <div className="stat-label">Total Equipment</div>
          <div className="stat-sub-info">{areas.length} process areas</div>
        </div>
        <div className="stat-card-enhanced" style={{ borderLeftColor: '#38a169' }}>
          <div className="stat-value">{totalSensors}</div>
          <div className="stat-label">Active Sensors</div>
          <div className="stat-sub-info">{sensorTypes || '-'} sensor types</div>
        </div>
        <div className="stat-card-enhanced" style={{ borderLeftColor: '#dd6b20' }}>
          <div className="stat-value">{avgHealth.toFixed(1)}</div>
          <div className="stat-label">Average Health Score</div>
          <div className="stat-sub-info">
            <span style={{ color: '#38a169' }}>{healthDist.normal}N</span>
            {' / '}
            <span style={{ color: '#dd6b20' }}>{healthDist.warning}W</span>
            {' / '}
            <span style={{ color: '#e53e3e' }}>{healthDist.critical}C</span>
          </div>
        </div>
        <div className="stat-card-enhanced" style={{ borderLeftColor: '#e53e3e' }}>
          <div className="stat-value" style={{ color: criticalEquipment.length > 0 ? '#e53e3e' : '#38a169' }}>
            {criticalEquipment.length}
          </div>
          <div className="stat-label">Critical Alerts</div>
          <div className="stat-sub-info">
            {criticalEquipment.length > 0
              ? criticalEquipment.slice(0, 2).map(eq => eq.equipmentId).join(', ')
              : 'All systems normal'}
          </div>
        </div>
      </div>

      {/* ── Section 2 & 3: Sidebar + Detail ── */}
      <div className="equipment-page-layout">

        {/* ── Left: Equipment Sidebar ── */}
        <div className="card" style={{ padding: '1rem' }}>
          <h2 className="card-title" style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>
            Equipment List ({filteredEquipment.length})
          </h2>
          <div className="equipment-search-bar">
            <input
              className="equipment-search-input"
              placeholder="Search equipment..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <select
              className="equipment-filter-select"
              value={areaFilter}
              onChange={e => setAreaFilter(e.target.value)}
            >
              <option value="all">All Areas</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="equipment-sidebar">
            {filteredEquipment.map(eq => {
              const score = eq.healthScore || 0;
              const hClass = getHealthClass(score);
              const isSelected = selectedEquipment?.equipmentId === eq.equipmentId;
              return (
                <div
                  key={eq.equipmentId}
                  className={`equipment-card-enhanced ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectEquipment(eq)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#2d3748' }}>
                        {eqName(eq)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#718096' }}>{eq.equipmentId}</div>
                    </div>
                    <span className={`badge badge-${hClass}`}>{getHealthLabel(score)}</span>
                  </div>
                  <div className="equipment-card-meta">
                    {eq.areaName && (
                      <span className="equipment-card-tag" style={{ background: '#e6fffa', color: '#234e52' }}>
                        {eq.areaName}
                      </span>
                    )}
                    <span className="equipment-card-tag" style={{ background: '#ebf8ff', color: '#2a4365' }}>
                      {eq.sensorCount || 0} sensors
                    </span>
                  </div>
                  <div className="health-score" style={{ marginTop: '0.4rem' }}>
                    <span style={{ minWidth: '38px', fontWeight: 600, fontSize: '0.8rem' }}>
                      {score.toFixed(1)}
                    </span>
                    <div className="health-bar">
                      <div className={`health-bar-fill ${hClass}`} style={{ width: `${score}%` }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: Equipment Detail Panel ── */}
        <div>
          {selectedEquipment ? (
            <div>
              {/* 3a: Equipment Header */}
              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="selected-eq-header">
                  <div
                    className="eq-health-gauge"
                    style={{
                      background: getHealthClass(selectedEquipment.healthScore || 0) === 'normal'
                        ? '#38a169' : getHealthClass(selectedEquipment.healthScore || 0) === 'warning'
                        ? '#dd6b20' : '#e53e3e',
                    }}
                  >
                    {(selectedEquipment.healthScore || 0).toFixed(0)}
                  </div>
                  <div className="eq-info">
                    <h2>{eqName(selectedEquipment)}</h2>
                    <div className="eq-sub">
                      {selectedEquipment.equipmentId}
                      {selectedEquipment.status && ` | ${selectedEquipment.status}`}
                      {selectedEquipment.areaName && ` | ${selectedEquipment.areaName}`}
                      {sensorDashboard && ` | ${sensorDashboard.sensors.length} sensors`}
                    </div>
                  </div>
                </div>

                {/* 3b: Equipment Spec Grid */}
                <div className="equipment-spec-grid" style={{ marginTop: '1rem' }}>
                  <div className="equipment-spec-cell">
                    <div className="equipment-spec-label">Manufacturer</div>
                    <div className="equipment-spec-value">
                      {equipmentDetail?.manufacturer || selectedEquipment.manufacturer || '-'}
                    </div>
                  </div>
                  <div className="equipment-spec-cell">
                    <div className="equipment-spec-label">Model</div>
                    <div className="equipment-spec-value">
                      {equipmentDetail?.model || selectedEquipment.modelNumber || selectedEquipment.model || '-'}
                    </div>
                  </div>
                  <div className="equipment-spec-cell">
                    <div className="equipment-spec-label">Install Date</div>
                    <div className="equipment-spec-value">{selectedEquipment.installDate || '-'}</div>
                  </div>
                  <div className="equipment-spec-cell">
                    <div className="equipment-spec-label">Rated Power</div>
                    <div className="equipment-spec-value">
                      {selectedEquipment.ratedPower ? `${selectedEquipment.ratedPower} kW` : '-'}
                    </div>
                  </div>
                  <div className="equipment-spec-cell">
                    <div className="equipment-spec-label">Operating Hours</div>
                    <div className="equipment-spec-value">
                      {selectedEquipment.operatingHours?.toLocaleString() || '-'} hrs
                    </div>
                  </div>
                  <div className="equipment-spec-cell">
                    <div className="equipment-spec-label">Process Area</div>
                    <div className="equipment-spec-value">{selectedEquipment.areaName || '-'}</div>
                  </div>
                </div>

                {/* 3d: Failure Modes */}
                {equipmentDetail?.failureModes && equipmentDetail.failureModes.length > 0 && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div className="equipment-spec-label" style={{ marginBottom: '0.35rem' }}>Failure Modes</div>
                    <div>
                      {equipmentDetail.failureModes.map((mode: string, i: number) => (
                        <span key={i} className="failure-mode-tag">{mode}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3e: Anomaly / Maintenance summary */}
                {equipmentDetail && (
                  <div className="grid-2" style={{ marginTop: '1rem' }}>
                    <div style={{ padding: '0.6rem 0.8rem', background: '#fff5f5', borderRadius: '8px' }}>
                      <div className="equipment-spec-label">Anomalies Detected</div>
                      <div className="equipment-spec-value" style={{
                        color: (equipmentDetail.anomalyCount || 0) > 0 ? '#e53e3e' : '#38a169'
                      }}>
                        {equipmentDetail.anomalyCount || 0}
                      </div>
                    </div>
                    <div style={{ padding: '0.6rem 0.8rem', background: '#f0fff4', borderRadius: '8px' }}>
                      <div className="equipment-spec-label">Maintenance Records</div>
                      <div className="equipment-spec-value">{equipmentDetail.maintenanceCount || 0}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* 3c: Sensor Cards Grid */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 className="card-title" style={{ margin: 0 }}>
                    Sensors {sensorDashboard ? `(${sensorDashboard.sensors.length})` : ''}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.65rem', color: '#718096' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ width: 14, height: 6, background: 'rgba(72,187,120,0.3)', borderRadius: 2, display: 'inline-block' }}></span>
                      Normal Range
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ width: 14, height: 2, background: '#3182ce', display: 'inline-block' }}></span>
                      Sensor Value
                    </span>
                  </div>
                </div>

                {loadingSensors ? (
                  <div className="loading" style={{ padding: '2rem' }}><div className="spinner"></div></div>
                ) : sensorDashboard ? (
                  <div className="sensor-cards-grid">
                    {sensorDashboard.sensors
                      .filter(s => !s.sensorId.endsWith('-PM'))
                      .map(sensor => {
                        const chartData = getSensorChartData(sensor);
                        const currentVal = getCurrentValue(sensor);
                        const status = currentVal != null ? getSensorStatus(currentVal, sensor) : 'normal';
                        const trend = getTrend(sensor);
                        const rangeStyle = getRangeBarStyle(sensor, currentVal);
                        const values = chartData.map(d => d.value);
                        const yMin = Math.min(
                          sensor.minValue ?? Infinity,
                          sensor.normalMin ?? Infinity,
                          values.length > 0 ? Math.min(...values) : Infinity
                        );
                        const yMax = Math.max(
                          sensor.maxValue ?? -Infinity,
                          sensor.normalMax ?? -Infinity,
                          values.length > 0 ? Math.max(...values) : -Infinity
                        );
                        const yPad = (yMax - yMin) * 0.05 || 1;

                        return (
                          <div
                            key={sensor.sensorId}
                            className="sensor-card"
                            onClick={() => navigate(`/equipment/${selectedEquipment.equipmentId}/sensor/${sensor.sensorId}`)}
                          >
                            <div className="sensor-card-header">
                              <div>
                                <div className="sensor-card-name">
                                  {getSensorTypeIcon(sensor.type)} {sensor.name}
                                </div>
                                <div className="sensor-card-type">{sensor.type} | {sensor.unit}</div>
                              </div>
                              <span className={`badge badge-${status}`}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                              </span>
                            </div>

                            {/* Mini Sparkline */}
                            <div style={{ height: 80, marginBottom: '0.3rem' }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                                  {sensor.normalMin != null && sensor.normalMax != null && (
                                    <ReferenceArea
                                      y1={sensor.normalMin}
                                      y2={sensor.normalMax}
                                      fill="#48bb78"
                                      fillOpacity={0.12}
                                    />
                                  )}
                                  <YAxis domain={[yMin - yPad, yMax + yPad]} hide />
                                  <XAxis dataKey="idx" hide />
                                  <Tooltip
                                    contentStyle={{ borderRadius: 6, fontSize: '0.72rem', padding: '0.3rem 0.5rem' }}
                                    formatter={(v: number) => [`${v.toFixed(2)} ${sensor.unit}`, 'Value']}
                                    labelFormatter={() => ''}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#3182ce"
                                    strokeWidth={1.5}
                                    dot={false}
                                    activeDot={{ r: 3 }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>

                            {/* Current Value + Trend */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span className="sensor-card-value">
                                {currentVal != null ? currentVal.toFixed(2) : '-'}
                                <span className="sensor-card-unit">{sensor.unit}</span>
                              </span>
                              <span className={`trend-indicator ${trend.direction}`}>
                                {trend.direction === 'rising' ? '\u2191' : trend.direction === 'falling' ? '\u2193' : '\u2192'}
                                {trend.pct.toFixed(1)}%
                              </span>
                            </div>

                            {/* Range Bar */}
                            <div className="range-bar">
                              <div className="range-bar-normal" style={{
                                left: `${rangeStyle.normalLeft}%`,
                                width: `${rangeStyle.normalWidth}%`,
                              }} />
                              <div className="range-bar-indicator" style={{
                                left: `${rangeStyle.indicatorLeft}%`,
                                background: status === 'critical' ? '#e53e3e' : status === 'warning' ? '#dd6b20' : '#2c5282',
                              }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: '#a0aec0' }}>
                              <span>{sensor.minValue ?? '-'}</span>
                              <span style={{ color: '#718096', fontWeight: 500 }}>
                                Normal: {sensor.normalMin ?? '?'} - {sensor.normalMax ?? '?'}
                              </span>
                              <span>{sensor.maxValue ?? '-'}</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="equipment-empty-state">
                    <div className="equipment-empty-state-icon">{'\u{1F4E1}'}</div>
                    <p>No sensor data available</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="equipment-empty-state">
                <div className="equipment-empty-state-icon">{'\u{1F3ED}'}</div>
                <h3 style={{ color: '#4a5568', marginBottom: '0.5rem' }}>Select Equipment</h3>
                <p>Choose equipment from the list to view details, sensor data, and sparkline charts.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EquipmentList;
