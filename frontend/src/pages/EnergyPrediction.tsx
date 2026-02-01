import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell, AreaChart, Area, Legend,
} from 'recharts';
import { energyApi } from '../services/api';
import type {
  EnergyPrediction as EnergyPredictionType,
  EnergyTimeseriesSummary,
} from '../types';

const EQUIPMENT_LIST = [
  { id: 'RO-001-PM', name: 'RO Unit 1', nameKo: '역삼투 1호기', color: '#3182ce' },
  { id: 'RO-002-PM', name: 'RO Unit 2', nameKo: '역삼투 2호기', color: '#2b6cb0' },
  { id: 'EDI-001-PM', name: 'EDI Unit 1', nameKo: 'EDI 1호기', color: '#38a169' },
  { id: 'EDI-002-PM', name: 'EDI Unit 2', nameKo: 'EDI 2호기', color: '#2f855a' },
  { id: 'UV-001-PM', name: 'UV Sterilizer 1', nameKo: 'UV 살균기 1', color: '#d69e2e' },
  { id: 'UV-002-PM', name: 'UV Sterilizer 2', nameKo: 'UV 살균기 2', color: '#b7791f' },
  { id: 'PUMP-001-PM', name: 'Circulation Pump 1', nameKo: '순환펌프 1', color: '#805ad5' },
  { id: 'PUMP-003-PM', name: 'Distribution Pump', nameKo: '공급펌프', color: '#6b46c1' },
  { id: 'HP-001-PM', name: 'High Pressure Pump', nameKo: '고압펌프', color: '#e53e3e' },
];

const RANGE_OPTIONS = [
  { value: '1h', label: '1H' },
  { value: '6h', label: '6H' },
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
];

const BAR_COLORS = ['#e53e3e', '#dd6b20', '#d69e2e', '#38a169', '#3182ce', '#805ad5', '#d53f8c', '#2b6cb0', '#2f855a'];

const EnergyPrediction: React.FC = () => {
  // Time-series state
  const [selectedEquipment, setSelectedEquipment] = useState<string>('RO-001-PM');
  const [timeRange, setTimeRange] = useState<string>('24h');
  const [tsData, setTsData] = useState<Array<{ timestamp: string; powerKw: number }>>([]);
  const [allTsData, setAllTsData] = useState<Record<string, Array<{ timestamp: string; powerKw: number }>>>({});
  const [summaryData, setSummaryData] = useState<EnergyTimeseriesSummary[]>([]);
  const [loadingTs, setLoadingTs] = useState(false);

  // Prediction state (kept from original)
  const [predictions, setPredictions] = useState<EnergyPredictionType[]>([]);
  const [targetDate, setTargetDate] = useState<string>(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [predSummary, setPredSummary] = useState<{
    totalPredicted: number;
    avgConfidence: number;
    peakHour: string;
    peakValue: number;
  } | null>(null);

  // Fetch single equipment timeseries
  const fetchTimeseries = useCallback(async () => {
    setLoadingTs(true);
    try {
      const res = await energyApi.getTimeseries(selectedEquipment, timeRange);
      if (res.status === 'success' && res.data) {
        setTsData(res.data as any);
      }
    } catch (err) {
      console.error('Failed to fetch timeseries', err);
    } finally {
      setLoadingTs(false);
    }
  }, [selectedEquipment, timeRange]);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    try {
      const res = await energyApi.getTimeseriesSummary(timeRange);
      if (res.status === 'success' && res.data) {
        setSummaryData(res.data as any);
      }
    } catch (err) {
      console.error('Failed to fetch summary', err);
    }
  }, [timeRange]);

  // Fetch all equipment for comparison
  const fetchAllTimeseries = useCallback(async () => {
    try {
      const res = await energyApi.getAllTimeseries(timeRange);
      if (res.status === 'success' && res.data) {
        setAllTsData(res.data as any);
      }
    } catch (err) {
      console.error('Failed to fetch all timeseries', err);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchTimeseries();
    fetchSummary();
    fetchAllTimeseries();
  }, [fetchTimeseries, fetchSummary, fetchAllTimeseries]);

  // Derived summary stats
  const totalEnergy = useMemo(() =>
    summaryData.reduce((sum, d) => sum + (d.totalKwh || 0), 0), [summaryData]);
  const avgLoad = useMemo(() => {
    if (summaryData.length === 0) return 0;
    return summaryData.reduce((sum, d) => sum + (d.avgKw || 0), 0) / summaryData.length;
  }, [summaryData]);
  const peakEquipment = useMemo(() => {
    if (summaryData.length === 0) return null;
    return summaryData.reduce((max, d) => (d.maxKw || 0) > (max.maxKw || 0) ? d : max);
  }, [summaryData]);

  // Format timestamp for chart
  const formatTime = useCallback((ts: string) => {
    const d = new Date(ts);
    if (timeRange === '1h' || timeRange === '6h') {
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }
    if (timeRange === '24h') {
      return `${d.getHours().toString().padStart(2, '0')}:00`;
    }
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
  }, [timeRange]);

  // Chart data with downsampling for large datasets
  const chartData = useMemo(() => {
    if (tsData.length === 0) return [];
    const maxPoints = 200;
    const step = Math.max(1, Math.floor(tsData.length / maxPoints));
    return tsData
      .filter((_, i) => i % step === 0)
      .map(d => ({
        time: formatTime(d.timestamp),
        power: Math.round(d.powerKw * 100) / 100,
        fullTime: d.timestamp,
      }));
  }, [tsData, formatTime]);

  // Multi-equipment overlay chart data
  const multiChartData = useMemo(() => {
    const allKeys = Object.keys(allTsData);
    if (allKeys.length === 0) return [];

    // Use one equipment's timestamps as reference
    const refKey = allKeys[0];
    const refData = allTsData[refKey];
    if (!refData || refData.length === 0) return [];

    const maxPoints = 150;
    const step = Math.max(1, Math.floor(refData.length / maxPoints));

    return refData
      .filter((_, i) => i % step === 0)
      .map((ref, idx) => {
        const entry: Record<string, any> = { time: formatTime(ref.timestamp) };
        allKeys.forEach(key => {
          const d = allTsData[key];
          const realIdx = idx * step;
          if (d && d[realIdx]) {
            entry[key] = Math.round(d[realIdx].powerKw * 100) / 100;
          }
        });
        return entry;
      });
  }, [allTsData, formatTime]);

  // Bar chart data for comparison
  const comparisonData = useMemo(() => {
    return summaryData.map((d, i) => ({
      name: d.equipmentName || d.equipmentId,
      avgKw: d.avgKw || 0,
      maxKw: d.maxKw || 0,
      totalKwh: d.totalKwh || 0,
      fill: BAR_COLORS[i % BAR_COLORS.length],
    }));
  }, [summaryData]);

  // Prediction handler
  const handleGeneratePrediction = async () => {
    setGenerating(true);
    setError(null);
    try {
      const response = await energyApi.predict(targetDate);
      if (response.status === 'success' && response.data) {
        setPredictions(response.data.predictions);
        const total = response.data.predictions.reduce((sum, p) => sum + p.value, 0);
        const avgConf = response.data.predictions.reduce((sum, p) => sum + p.confidence, 0) / response.data.predictions.length;
        const peak = response.data.predictions.reduce((max, p) => p.value > max.value ? p : max);
        const peakTime = new Date(peak.time);
        setPredSummary({
          totalPredicted: total,
          avgConfidence: avgConf,
          peakHour: `${peakTime.getHours().toString().padStart(2, '0')}:${peakTime.getMinutes().toString().padStart(2, '0')}`,
          peakValue: peak.value,
        });
      }
    } catch (err) {
      setError('Failed to generate prediction');
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const selectedEqInfo = EQUIPMENT_LIST.find(e => e.id === selectedEquipment);

  return (
    <div className="energy-page">
      <h1 className="page-title">Energy Monitoring & Prediction</h1>
      {error && <div className="error-message">{error}</div>}

      {/* ── KPI Summary Cards ── */}
      <div className="grid-3">
        <div className="stat-card energy-kpi">
          <div className="energy-kpi-icon" style={{ background: '#ebf8ff', color: '#3182ce' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <div>
            <div className="stat-value">{totalEnergy.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div className="stat-label">Total Energy (kWh)</div>
          </div>
        </div>
        <div className="stat-card energy-kpi">
          <div className="energy-kpi-icon" style={{ background: '#f0fff4', color: '#38a169' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div>
            <div className="stat-value">{avgLoad.toFixed(1)} <span style={{ fontSize: '0.75em', color: '#718096' }}>kW</span></div>
            <div className="stat-label">Avg. Power Load</div>
          </div>
        </div>
        <div className="stat-card energy-kpi">
          <div className="energy-kpi-icon" style={{ background: '#fff5f5', color: '#e53e3e' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12l4-4 4 4M14 8l4-4 4 4"/></svg>
          </div>
          <div>
            <div className="stat-value">{peakEquipment ? `${peakEquipment.maxKw?.toFixed(1)}` : '—'} <span style={{ fontSize: '0.75em', color: '#718096' }}>kW</span></div>
            <div className="stat-label">Peak: {peakEquipment?.equipmentName || '—'}</div>
          </div>
        </div>
      </div>

      {/* ── Equipment Selector + Time Range ── */}
      <div className="card">
        <div className="energy-controls">
          <div className="energy-eq-selector">
            <label className="energy-label">Equipment</label>
            <div className="energy-eq-chips">
              {EQUIPMENT_LIST.map(eq => (
                <button
                  key={eq.id}
                  className={`energy-chip ${selectedEquipment === eq.id ? 'active' : ''}`}
                  style={selectedEquipment === eq.id ? { background: eq.color, borderColor: eq.color, color: '#fff' } : {}}
                  onClick={() => setSelectedEquipment(eq.id)}
                >
                  <span className="energy-chip-dot" style={{ background: eq.color }} />
                  {eq.nameKo}
                </button>
              ))}
            </div>
          </div>
          <div className="energy-range-selector">
            <label className="energy-label">Time Range</label>
            <div className="energy-range-btns">
              {RANGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`energy-range-btn ${timeRange === opt.value ? 'active' : ''}`}
                  onClick={() => setTimeRange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Selected Equipment Line Chart ── */}
      <div className="card">
        <div className="widget-header">
          <h2 className="card-title" style={{ margin: 0 }}>
            <span className="energy-chip-dot" style={{ background: selectedEqInfo?.color, display: 'inline-block', marginRight: '0.5rem' }} />
            {selectedEqInfo?.nameKo} ({selectedEqInfo?.name}) — Power Consumption
          </h2>
          {loadingTs && <span className="energy-loading">Loading...</span>}
        </div>
        <div style={{ height: 320 }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={selectedEqInfo?.color || '#3182ce'} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={selectedEqInfo?.color || '#3182ce'} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#718096' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#718096' }} unit=" kW" width={65} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                  formatter={(value: number) => [`${value} kW`, 'Power']}
                />
                <Area
                  type="monotone"
                  dataKey="power"
                  stroke={selectedEqInfo?.color || '#3182ce'}
                  strokeWidth={2}
                  fill="url(#powerGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: selectedEqInfo?.color }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data">No data available for selected range</div>
          )}
        </div>
      </div>

      {/* ── All Equipment Comparison ── */}
      <div className="grid-2">
        {/* Bar Chart - Average Power */}
        <div className="card">
          <h2 className="card-title">Equipment Power Comparison (Avg kW)</h2>
          <div style={{ height: 300 }}>
            {comparisonData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#718096' }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: '#718096' }} unit=" kW" width={55} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                    formatter={(value: number) => [`${value.toFixed(1)} kW`, 'Avg Power']}
                  />
                  <Bar dataKey="avgKw" radius={[4, 4, 0, 0]}>
                    {comparisonData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="no-data">Loading...</div>
            )}
          </div>
        </div>

        {/* Energy Summary Table */}
        <div className="card">
          <h2 className="card-title">Equipment Energy Summary</h2>
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            <table className="table energy-summary-table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th style={{ textAlign: 'right' }}>Total kWh</th>
                  <th style={{ textAlign: 'right' }}>Avg kW</th>
                  <th style={{ textAlign: 'right' }}>Max kW</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.map((d, i) => (
                  <tr
                    key={d.equipmentId}
                    className={selectedEquipment === d.equipmentId ? 'energy-row-selected' : ''}
                    onClick={() => setSelectedEquipment(d.equipmentId)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="energy-chip-dot" style={{ background: BAR_COLORS[i % BAR_COLORS.length] }} />
                        {d.equipmentName || d.equipmentId}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{(d.totalKwh || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td style={{ textAlign: 'right' }}>{(d.avgKw || 0).toFixed(1)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ color: (d.maxKw || 0) > 40 ? '#e53e3e' : '#2d3748' }}>
                        {(d.maxKw || 0).toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Multi-Equipment Overlay Chart ── */}
      <div className="card">
        <h2 className="card-title">All Equipment Power Trend (Overlay)</h2>
        <div style={{ height: 350 }}>
          {multiChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={multiChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#718096' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#718096' }} unit=" kW" width={65} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {EQUIPMENT_LIST.map(eq => (
                  <Line
                    key={eq.id}
                    type="monotone"
                    dataKey={eq.id}
                    name={eq.nameKo}
                    stroke={eq.color}
                    strokeWidth={selectedEquipment === eq.id ? 3 : 1.2}
                    strokeOpacity={selectedEquipment === eq.id ? 1 : 0.5}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data">Loading multi-equipment data...</div>
          )}
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="section-title">24-Hour Energy Consumption Prediction</div>

      {/* ── Original Prediction Controls ── */}
      <div className="card">
        <h2 className="card-title">Generate Prediction</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Target Date</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="energy-date-input"
            />
          </div>
          <button className="btn btn-primary" onClick={handleGeneratePrediction} disabled={generating}>
            {generating ? 'Generating...' : 'Generate 24h Prediction'}
          </button>
        </div>
        <p style={{ marginTop: '1rem', color: '#718096', fontSize: '0.875rem' }}>
          Prediction uses past 10 days of sensor data to forecast the next 24 hours in 15-minute intervals.
        </p>
      </div>

      {/* Prediction Summary Stats */}
      {predSummary && (
        <div className="grid-4">
          <div className="stat-card">
            <div className="stat-value">{predSummary.totalPredicted.toFixed(0)}</div>
            <div className="stat-label">Total Predicted (kWh)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{(predSummary.avgConfidence * 100).toFixed(0)}%</div>
            <div className="stat-label">Avg. Confidence</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{predSummary.peakHour}</div>
            <div className="stat-label">Peak Hour</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{predSummary.peakValue.toFixed(1)}</div>
            <div className="stat-label">Peak Value (kWh)</div>
          </div>
        </div>
      )}

      {/* Prediction Area Chart */}
      {predictions.length > 0 && (
        <div className="card">
          <h2 className="card-title">Hourly Energy Consumption Forecast</h2>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={predictions.map(p => ({
                  time: new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  value: Math.round(p.value * 100) / 100,
                  confidence: Math.round(p.confidence * 100),
                }))}
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="predGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4299e1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4299e1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#718096' }} interval={11} />
                <YAxis tick={{ fontSize: 11, fill: '#718096' }} unit=" kWh" width={60} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                  formatter={(value: number, name: string) => {
                    if (name === 'value') return [`${value} kWh`, 'Predicted'];
                    return [`${value}%`, 'Confidence'];
                  }}
                />
                <Area type="monotone" dataKey="value" stroke="#4299e1" strokeWidth={2} fill="url(#predGradient)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Detailed Predictions Table */}
      {predictions.length > 0 && (
        <div className="card">
          <h2 className="card-title">Detailed Predictions (15-min intervals)</h2>
          <div style={{ maxHeight: '400px', overflow: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Predicted Value</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((pred, index) => (
                  <tr key={index}>
                    <td>{new Date(pred.time).toLocaleTimeString()}</td>
                    <td><strong>{pred.value.toFixed(2)}</strong> {pred.unit}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div className="health-bar" style={{ width: '100px' }}>
                          <div className="health-bar-fill normal" style={{ width: `${pred.confidence * 100}%` }} />
                        </div>
                        <span>{(pred.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {predictions.length === 0 && !generating && (
        <div className="card">
          <p style={{ color: '#718096', textAlign: 'center' }}>
            Click "Generate 24h Prediction" to forecast energy consumption
          </p>
        </div>
      )}
    </div>
  );
};

export default EnergyPrediction;
