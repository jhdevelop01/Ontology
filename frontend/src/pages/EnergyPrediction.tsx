import React, { useState } from 'react';
import { energyApi } from '../services/api';
import type { EnergyPrediction as EnergyPredictionType } from '../types';

const EnergyPrediction: React.FC = () => {
  const [predictions, setPredictions] = useState<EnergyPredictionType[]>([]);
  const [targetDate, setTargetDate] = useState<string>(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    totalPredicted: number;
    avgConfidence: number;
    peakHour: string;
    peakValue: number;
  } | null>(null);

  const handleGeneratePrediction = async () => {
    setGenerating(true);
    setError(null);
    try {
      const response = await energyApi.predict(targetDate);
      if (response.status === 'success' && response.data) {
        setPredictions(response.data.predictions);

        // Calculate summary
        const total = response.data.predictions.reduce((sum, p) => sum + p.value, 0);
        const avgConf = response.data.predictions.reduce((sum, p) => sum + p.confidence, 0) / response.data.predictions.length;
        const peak = response.data.predictions.reduce((max, p) => p.value > max.value ? p : max);
        const peakTime = new Date(peak.time);

        setSummary({
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

  // Generate simple bar chart visualization
  const renderChart = () => {
    if (predictions.length === 0) return null;

    const maxValue = Math.max(...predictions.map(p => p.value));
    const chartHeight = 200;

    // Group by hour (4 intervals per hour)
    const hourlyData: { hour: number; value: number }[] = [];
    for (let i = 0; i < 24; i++) {
      const hourPredictions = predictions.slice(i * 4, (i + 1) * 4);
      const avgValue = hourPredictions.reduce((sum, p) => sum + p.value, 0) / hourPredictions.length;
      hourlyData.push({ hour: i, value: avgValue });
    }

    return (
      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', height: chartHeight, gap: '4px' }}>
          {hourlyData.map((data, index) => {
            const height = (data.value / maxValue) * chartHeight;
            const isPeak = data.value === Math.max(...hourlyData.map(d => d.value));
            return (
              <div
                key={index}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${height}px`,
                    background: isPeak
                      ? 'linear-gradient(180deg, #e53e3e, #c53030)'
                      : 'linear-gradient(180deg, #4299e1, #2b6cb0)',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s ease',
                  }}
                  title={`${data.hour}:00 - ${data.value.toFixed(1)} kWh`}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: '#718096' }}>
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>
    );
  };

  return (
    <div className="energy-page">
      <h1 className="page-title">Energy Consumption Prediction</h1>

      {error && <div className="error-message">{error}</div>}

      {/* Prediction Controls */}
      <div className="card">
        <h2 className="card-title">Generate Prediction</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              Target Date
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              style={{
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
              }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleGeneratePrediction}
            disabled={generating}
          >
            {generating ? 'Generating...' : 'Generate 24h Prediction'}
          </button>
        </div>

        <p style={{ marginTop: '1rem', color: '#718096', fontSize: '0.875rem' }}>
          Prediction uses past 10 days of sensor data to forecast the next 24 hours in 15-minute intervals.
        </p>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid-4">
          <div className="stat-card">
            <div className="stat-value">{summary.totalPredicted.toFixed(0)}</div>
            <div className="stat-label">Total Predicted (kWh)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{(summary.avgConfidence * 100).toFixed(0)}%</div>
            <div className="stat-label">Avg. Confidence</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.peakHour}</div>
            <div className="stat-label">Peak Hour</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.peakValue.toFixed(1)}</div>
            <div className="stat-label">Peak Value (kWh)</div>
          </div>
        </div>
      )}

      {/* Prediction Chart */}
      {predictions.length > 0 && (
        <div className="card">
          <h2 className="card-title">Hourly Energy Consumption Forecast</h2>
          {renderChart()}
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
                    <td>
                      <strong>{pred.value.toFixed(2)}</strong> {pred.unit}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div className="health-bar" style={{ width: '100px' }}>
                          <div
                            className="health-bar-fill normal"
                            style={{ width: `${pred.confidence * 100}%` }}
                          ></div>
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
