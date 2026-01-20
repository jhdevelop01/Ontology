import React, { useEffect, useState, useCallback } from 'react';
import { ontologyApi, anomalyApi, equipmentApi } from '../services/api';
import type { OntologyStats, Anomaly, Equipment, ProcessFlowData, ProcessFlowNode } from '../types';

// Process area colors
const AREA_COLORS: Record<string, string> = {
  'AREA-PRE': '#3498db',      // Blue - Pretreatment
  'AREA-PRIMARY': '#2ecc71',   // Green - Primary Treatment
  'AREA-POLISH': '#9b59b6',    // Purple - Polishing
  'AREA-DIST': '#e67e22',      // Orange - Distribution
  'AREA-RECYCLE': '#1abc9c',   // Teal - Recycle
};

const AREA_NAMES: Record<string, string> = {
  'AREA-PRE': '전처리',
  'AREA-PRIMARY': '1차처리',
  'AREA-POLISH': '폴리싱',
  'AREA-DIST': '배관',
  'AREA-RECYCLE': '재생',
};

// Get status color
const getStatusColor = (status?: string, healthScore?: number) => {
  if (status === 'Critical' || (healthScore && healthScore < 70)) return '#e74c3c';
  if (status === 'Warning' || (healthScore && healthScore < 85)) return '#f39c12';
  return '#2ecc71';
};

// Process Flow Graph Component
const ProcessFlowGraph: React.FC<{ data: ProcessFlowData; onNodeClick: (node: ProcessFlowNode) => void }> = ({ data, onNodeClick }) => {
  const width = 1000;
  const height = 400;
  const nodeWidth = 120;
  const nodeHeight = 60;

  // Group nodes by area
  const nodesByArea: Record<string, ProcessFlowNode[]> = {};
  data.nodes.forEach(node => {
    const areaId = node.areaId || 'AREA-OTHER';
    if (!nodesByArea[areaId]) nodesByArea[areaId] = [];
    nodesByArea[areaId].push(node);
  });

  // Area order for layout
  const areaOrder = ['AREA-PRE', 'AREA-PRIMARY', 'AREA-POLISH', 'AREA-DIST', 'AREA-RECYCLE'];

  // Calculate node positions
  const nodePositions: Record<string, { x: number; y: number }> = {};
  let xOffset = 50;

  areaOrder.forEach((areaId, areaIndex) => {
    const areaNodes = nodesByArea[areaId] || [];
    const areaWidth = Math.max(nodeWidth + 30, areaNodes.length * (nodeWidth + 20));

    areaNodes.forEach((node, nodeIndex) => {
      const row = Math.floor(nodeIndex / 2);
      const col = nodeIndex % 2;
      nodePositions[node.id] = {
        x: xOffset + col * (nodeWidth + 15) + 15,
        y: 80 + row * (nodeHeight + 20),
      };
    });

    xOffset += areaWidth + 20;
  });

  // Draw edges
  const renderEdges = () => {
    return data.edges.map((edge, index) => {
      const source = nodePositions[edge.source];
      const target = nodePositions[edge.target];
      if (!source || !target) return null;

      const startX = source.x + nodeWidth;
      const startY = source.y + nodeHeight / 2;
      const endX = target.x;
      const endY = target.y + nodeHeight / 2;

      // Create curved path
      const midX = (startX + endX) / 2;
      const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

      return (
        <g key={`edge-${index}`}>
          <path
            d={path}
            fill="none"
            stroke="#bdc3c7"
            strokeWidth={2}
            markerEnd="url(#arrowhead)"
          />
        </g>
      );
    });
  };

  // Draw nodes
  const renderNodes = () => {
    return data.nodes.map((node) => {
      const pos = nodePositions[node.id];
      if (!pos) return null;

      const statusColor = getStatusColor(node.status, node.healthScore);
      const areaColor = AREA_COLORS[node.areaId || ''] || '#95a5a6';

      return (
        <g
          key={node.id}
          transform={`translate(${pos.x}, ${pos.y})`}
          onClick={() => onNodeClick(node)}
          style={{ cursor: 'pointer' }}
        >
          {/* Node background */}
          <rect
            width={nodeWidth}
            height={nodeHeight}
            rx={8}
            fill="white"
            stroke={areaColor}
            strokeWidth={2}
          />
          {/* Status indicator */}
          <circle
            cx={nodeWidth - 10}
            cy={10}
            r={6}
            fill={statusColor}
          />
          {/* Node name */}
          <text
            x={nodeWidth / 2}
            y={22}
            textAnchor="middle"
            fontSize={11}
            fontWeight="bold"
            fill="#2c3e50"
          >
            {node.name?.length > 14 ? node.name.substring(0, 12) + '..' : node.name}
          </text>
          {/* Korean name */}
          <text
            x={nodeWidth / 2}
            y={38}
            textAnchor="middle"
            fontSize={10}
            fill="#7f8c8d"
          >
            {node.nameKo || ''}
          </text>
          {/* Health score */}
          {node.healthScore !== undefined && (
            <text
              x={nodeWidth / 2}
              y={52}
              textAnchor="middle"
              fontSize={10}
              fill={statusColor}
              fontWeight="bold"
            >
              {node.healthScore.toFixed(1)}%
            </text>
          )}
        </g>
      );
    });
  };

  // Draw area backgrounds
  const renderAreaBackgrounds = () => {
    let xOffset = 40;
    return areaOrder.map((areaId) => {
      const areaNodes = nodesByArea[areaId] || [];
      if (areaNodes.length === 0) return null;

      const areaWidth = Math.max(nodeWidth + 50, areaNodes.length * (nodeWidth + 20) + 10);
      const areaHeight = Math.ceil(areaNodes.length / 2) * (nodeHeight + 20) + 60;
      const areaColor = AREA_COLORS[areaId] || '#95a5a6';

      const result = (
        <g key={`area-${areaId}`}>
          <rect
            x={xOffset}
            y={30}
            width={areaWidth}
            height={areaHeight}
            rx={10}
            fill={`${areaColor}15`}
            stroke={areaColor}
            strokeWidth={1}
            strokeDasharray="5,5"
          />
          <text
            x={xOffset + areaWidth / 2}
            y={50}
            textAnchor="middle"
            fontSize={12}
            fontWeight="bold"
            fill={areaColor}
          >
            {AREA_NAMES[areaId] || areaId}
          </text>
        </g>
      );

      xOffset += areaWidth + 20;
      return result;
    });
  };

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#bdc3c7" />
        </marker>
      </defs>
      {renderAreaBackgrounds()}
      {renderEdges()}
      {renderNodes()}
    </svg>
  );
};

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<OntologyStats | null>(null);
  const [recentAnomalies, setRecentAnomalies] = useState<Anomaly[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [processFlow, setProcessFlow] = useState<ProcessFlowData | null>(null);
  const [selectedNode, setSelectedNode] = useState<ProcessFlowNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, anomaliesRes, equipmentRes, processFlowRes] = await Promise.all([
          ontologyApi.getStats(),
          anomalyApi.getHistory(undefined, undefined, 5),
          equipmentApi.getAll(),
          ontologyApi.getProcessFlow(),
        ]);

        if (statsRes.status === 'success' && statsRes.data) {
          setStats(statsRes.data);
        }
        if (anomaliesRes.status === 'success' && anomaliesRes.data) {
          setRecentAnomalies(anomaliesRes.data);
        }
        if (equipmentRes.status === 'success' && equipmentRes.data) {
          setEquipment(equipmentRes.data);
        }
        if (processFlowRes.status === 'success' && processFlowRes.data) {
          setProcessFlow(processFlowRes.data);
        }
      } catch (err) {
        setError('Failed to load dashboard data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleNodeClick = useCallback((node: ProcessFlowNode) => {
    setSelectedNode(node);
  }, []);

  const getHealthBadgeClass = (status: string) => {
    if (status?.includes('Normal')) return 'badge-normal';
    if (status?.includes('Warning')) return 'badge-warning';
    return 'badge-critical';
  };

  const getSeverityClass = (severity: number) => {
    if (severity >= 0.7) return 'high';
    if (severity >= 0.4) return 'medium';
    return 'low';
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
    <div className="dashboard">
      <h1 className="page-title">UPW 예지보전 대시보드</h1>

      {/* Stats Overview */}
      <div className="grid-4">
        <div className="stat-card">
          <div className="stat-value">{stats?.totalEquipment || 0}</div>
          <div className="stat-label">설비 수</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.totalSensors || 0}</div>
          <div className="stat-label">센서 수</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: (stats?.totalAnomalies || 0) > 0 ? '#e74c3c' : '#2ecc71' }}>
            {stats?.totalAnomalies || 0}
          </div>
          <div className="stat-label">이상탐지</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: getStatusColor(undefined, stats?.averageHealthScore) }}>
            {stats?.averageHealthScore?.toFixed(1) || '-'}%
          </div>
          <div className="stat-label">평균 건강도</div>
        </div>
      </div>

      {/* Process Flow Graph */}
      <div className="card">
        <h2 className="card-title">UPW 공정 프로세스 플로우</h2>
        <div style={{ overflowX: 'auto' }}>
          {processFlow && (
            <ProcessFlowGraph data={processFlow} onNodeClick={handleNodeClick} />
          )}
        </div>
        {selectedNode && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>
              {selectedNode.name} ({selectedNode.nameKo})
            </h3>
            <div style={{ display: 'flex', gap: '2rem', fontSize: '0.9rem' }}>
              <div>
                <strong>설비 ID:</strong> {selectedNode.id}
              </div>
              <div>
                <strong>건강도:</strong>{' '}
                <span style={{ color: getStatusColor(selectedNode.status, selectedNode.healthScore) }}>
                  {selectedNode.healthScore?.toFixed(1) || '-'}%
                </span>
              </div>
              <div>
                <strong>상태:</strong>{' '}
                <span className={`badge ${getHealthBadgeClass(selectedNode.status || '')}`}>
                  {selectedNode.status || 'Unknown'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid-2">
        {/* Health Distribution */}
        <div className="card">
          <h2 className="card-title">설비 건강 상태 분포</h2>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>정상 (Normal)</span>
                  <span className="badge badge-normal">{stats?.healthDistribution?.Normal || 0}</span>
                </div>
                <div className="health-bar">
                  <div
                    className="health-bar-fill normal"
                    style={{ width: `${((stats?.healthDistribution?.Normal || 0) / (stats?.totalEquipment || 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>경고 (Warning)</span>
                  <span className="badge badge-warning">{stats?.healthDistribution?.Warning || 0}</span>
                </div>
                <div className="health-bar">
                  <div
                    className="health-bar-fill warning"
                    style={{ width: `${((stats?.healthDistribution?.Warning || 0) / (stats?.totalEquipment || 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>위험 (Critical)</span>
                  <span className="badge badge-critical">{stats?.healthDistribution?.Critical || 0}</span>
                </div>
                <div className="health-bar">
                  <div
                    className="health-bar-fill critical"
                    style={{ width: `${((stats?.healthDistribution?.Critical || 0) / (stats?.totalEquipment || 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Anomalies */}
        <div className="card">
          <h2 className="card-title">최근 이상탐지</h2>
          {recentAnomalies.length === 0 ? (
            <p style={{ color: '#718096' }}>탐지된 이상이 없습니다</p>
          ) : (
            <div>
              {recentAnomalies.map((anomaly, index) => (
                <div key={index} className="anomaly-item">
                  <div className={`anomaly-severity ${getSeverityClass(anomaly.severity)}`}></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{anomaly.equipmentId}</div>
                    <div style={{ fontSize: '0.875rem', color: '#718096' }}>
                      {anomaly.anomalyType?.split('#').pop() || 'Unknown'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 500 }}>{(anomaly.severity * 100).toFixed(0)}%</div>
                    <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                      {new Date(anomaly.detectedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Equipment Overview */}
      <div className="card">
        <h2 className="card-title">설비 현황</h2>
        <table className="table">
          <thead>
            <tr>
              <th>설비 ID</th>
              <th>설비명</th>
              <th>제조사</th>
              <th>건강도</th>
              <th>상태</th>
              <th>가동시간</th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((eq) => (
              <tr key={eq.equipmentId}>
                <td><strong>{eq.equipmentId}</strong></td>
                <td>{typeof eq.name === 'string' ? eq.name : (eq.name as string[])?.[0] || '-'}</td>
                <td>{eq.manufacturer || '-'}</td>
                <td>
                  <div className="health-score">
                    <span style={{ minWidth: '40px' }}>{eq.healthScore?.toFixed(1) || '-'}</span>
                    <div className="health-bar">
                      <div
                        className={`health-bar-fill ${
                          (eq.healthScore || 0) >= 85 ? 'normal' :
                          (eq.healthScore || 0) >= 70 ? 'warning' : 'critical'
                        }`}
                        style={{ width: `${eq.healthScore || 0}%` }}
                      ></div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`badge ${getHealthBadgeClass(eq.healthStatus || '')}`}>
                    {eq.healthStatus?.split('#').pop() || 'Unknown'}
                  </span>
                </td>
                <td>{eq.operatingHours?.toLocaleString() || '-'} hrs</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;
