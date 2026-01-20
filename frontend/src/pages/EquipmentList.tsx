import React, { useEffect, useState } from 'react';
import { equipmentApi, sensorApi } from '../services/api';
import type { Equipment, Sensor, Observation } from '../types';

const EquipmentList: React.FC = () => {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [observations, setObservations] = useState<Record<string, Observation[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleSelectEquipment = async (eq: Equipment) => {
    setSelectedEquipment(eq);
    try {
      const sensorsRes = await equipmentApi.getSensors(eq.equipmentId);
      if (sensorsRes.status === 'success' && sensorsRes.data) {
        setSensors(sensorsRes.data);

        // Fetch recent observations for each sensor
        const obsPromises = sensorsRes.data.map(async (sensor) => {
          const obsRes = await sensorApi.getObservations(sensor.sensorId, undefined, undefined, 10);
          return { sensorId: sensor.sensorId, observations: obsRes.data || [] };
        });

        const obsResults = await Promise.all(obsPromises);
        const obsMap: Record<string, Observation[]> = {};
        obsResults.forEach((result) => {
          obsMap[result.sensorId] = result.observations;
        });
        setObservations(obsMap);
      }
    } catch (err) {
      console.error('Failed to load sensors:', err);
    }
  };

  const getHealthClass = (score: number) => {
    if (score >= 85) return 'normal';
    if (score >= 70) return 'warning';
    return 'critical';
  };

  const getHealthBadgeClass = (status: string) => {
    if (status?.includes('Normal')) return 'badge-normal';
    if (status?.includes('Warning')) return 'badge-warning';
    return 'badge-critical';
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="equipment-page">
      <h1 className="page-title">Equipment Management</h1>

      <div className="grid-2">
        {/* Equipment List */}
        <div className="card">
          <h2 className="card-title">Equipment List</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {equipment.map((eq) => (
              <div
                key={eq.equipmentId}
                className="equipment-card"
                onClick={() => handleSelectEquipment(eq)}
                style={{
                  cursor: 'pointer',
                  border: selectedEquipment?.equipmentId === eq.equipmentId ? '2px solid #2c5282' : 'none',
                }}
              >
                <div className="equipment-header">
                  <div>
                    <div className="equipment-name">
                      {typeof eq.name === 'string' ? eq.name : (eq.name as string[])?.[0] || eq.equipmentId}
                    </div>
                    <div className="equipment-id">{eq.equipmentId}</div>
                  </div>
                  <span className={`badge ${getHealthBadgeClass(eq.healthStatus || '')}`}>
                    {eq.healthStatus?.split('#').pop() || 'Unknown'}
                  </span>
                </div>
                <div className="health-score" style={{ marginTop: '0.5rem' }}>
                  <span style={{ minWidth: '50px', fontWeight: 600 }}>
                    {eq.healthScore?.toFixed(1) || '-'}
                  </span>
                  <div className="health-bar">
                    <div
                      className={`health-bar-fill ${getHealthClass(eq.healthScore || 0)}`}
                      style={{ width: `${eq.healthScore || 0}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Equipment Details */}
        <div className="card">
          <h2 className="card-title">Equipment Details</h2>
          {selectedEquipment ? (
            <div>
              <div className="equipment-info" style={{ marginBottom: '1.5rem' }}>
                <div className="equipment-info-item">
                  <span>Manufacturer: </span>
                  {selectedEquipment.manufacturer || '-'}
                </div>
                <div className="equipment-info-item">
                  <span>Model: </span>
                  {selectedEquipment.modelNumber || '-'}
                </div>
                <div className="equipment-info-item">
                  <span>Install Date: </span>
                  {selectedEquipment.installDate || '-'}
                </div>
                <div className="equipment-info-item">
                  <span>Rated Power: </span>
                  {selectedEquipment.ratedPower ? `${selectedEquipment.ratedPower} kW` : '-'}
                </div>
                <div className="equipment-info-item">
                  <span>Operating Hours: </span>
                  {selectedEquipment.operatingHours?.toLocaleString() || '-'} hrs
                </div>
              </div>

              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                Sensors ({sensors.length})
              </h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Sensor ID</th>
                    <th>Name</th>
                    <th>Latest Value</th>
                    <th>Normal Range</th>
                  </tr>
                </thead>
                <tbody>
                  {sensors.map((sensor) => {
                    const latestObs = observations[sensor.sensorId]?.[0];
                    const isOutOfRange = latestObs && (
                      (sensor.normalRangeMin !== undefined && latestObs.value < sensor.normalRangeMin) ||
                      (sensor.normalRangeMax !== undefined && latestObs.value > sensor.normalRangeMax)
                    );
                    return (
                      <tr key={sensor.sensorId}>
                        <td><strong>{sensor.sensorId}</strong></td>
                        <td>{typeof sensor.name === 'string' ? sensor.name : (sensor.name as string[])?.[0] || '-'}</td>
                        <td style={{ color: isOutOfRange ? '#e53e3e' : 'inherit', fontWeight: isOutOfRange ? 600 : 400 }}>
                          {latestObs ? latestObs.value.toFixed(2) : '-'}
                        </td>
                        <td>
                          {sensor.normalRangeMin !== undefined && sensor.normalRangeMax !== undefined
                            ? `${sensor.normalRangeMin} - ${sensor.normalRangeMax}`
                            : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#718096' }}>Select an equipment to view details</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default EquipmentList;
