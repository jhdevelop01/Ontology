import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, ReferenceArea,
} from 'recharts';
import { ontologyApi, anomalyApi, equipmentApi, maintenanceApi, energyApi } from '../services/api';
import type {
  OntologyStats, Anomaly, Equipment, ProcessFlowData, ProcessFlowNode,
  MaintenanceRecommendation, EnergyTimeseriesSummary, Sensor,
  SensorWithObservations,
} from '../types';

// Process area colors (matched to DB area IDs)
const AREA_COLORS: Record<string, string> = {
  'AREA-PRE': '#3498db',
  'AREA-RO': '#2ecc71',
  'AREA-EDI': '#e74c3c',
  'AREA-POLISH': '#9b59b6',
  'AREA-STORAGE': '#e67e22',
};

const AREA_NAMES: Record<string, string> = {
  'AREA-PRE': '전처리',
  'AREA-RO': '역삼투(RO)',
  'AREA-EDI': '전기탈이온(EDI)',
  'AREA-POLISH': '폴리싱',
  'AREA-STORAGE': '저장/배관',
};

const AREA_ORDER = ['AREA-PRE', 'AREA-RO', 'AREA-EDI', 'AREA-POLISH', 'AREA-STORAGE'] as const;

// Water quality specs per area
const WATER_QUALITY: Record<string, {
  input: string;
  output: string;
  process: string;
  keyMetric: string;
}> = {
  'AREA-PRE': {
    input: 'TDS ~200ppm, 탁도 >5 NTU',
    output: 'Cl₂ 제거, 탁도 <1 NTU',
    process: '여과 + 흡착 + 보안필터',
    keyMetric: 'SS >5μm 제거',
  },
  'AREA-RO': {
    input: 'TDS ~200ppm',
    output: 'TDS <5ppm, 전도도 <10 μS/cm',
    process: '역삼투막 2단 처리',
    keyMetric: '제거율 99.5%',
  },
  'AREA-EDI': {
    input: '전도도 <10 μS/cm',
    output: '비저항 >17 MΩ·cm',
    process: '이온교환 + 전기투석',
    keyMetric: 'TOC <10ppb',
  },
  'AREA-POLISH': {
    input: '비저항 >17 MΩ·cm',
    output: '18.2 MΩ·cm, 무균',
    process: 'UV살균 + 수지 + UF',
    keyMetric: 'TOC <1ppb',
  },
  'AREA-STORAGE': {
    input: '초순수 18.2 MΩ·cm',
    output: '18.2 MΩ·cm 유지',
    process: 'N₂ 저장 + 순환배관',
    keyMetric: 'POU 공급',
  },
};

// Water quality milestones between areas
const WATER_MILESTONES = [
  { label: '원수', metric: 'TDS 200ppm', pos: 0 },
  { label: '여과수', metric: '탁도 <1 NTU', pos: 1 },
  { label: 'RO 투과수', metric: 'TDS <5ppm', pos: 2 },
  { label: 'EDI 처리수', metric: '17 MΩ·cm', pos: 3 },
  { label: '초순수', metric: '18.2 MΩ·cm', pos: 4 },
  { label: 'POU 공급', metric: '18.2 MΩ 유지', pos: 5 },
];

const getStatusColor = (status?: string, healthScore?: number) => {
  if (status === 'Critical' || (healthScore && healthScore < 70)) return '#e74c3c';
  if (status === 'Warning' || (healthScore && healthScore < 85)) return '#f39c12';
  return '#2ecc71';
};

// ============================================================
// Process Flow Graph — draggable nodes + edge-on-top + sensors
// ============================================================
const ProcessFlowGraph: React.FC<{
  data: ProcessFlowData;
  onNodeClick: (node: ProcessFlowNode) => void;
  selectedNodeId?: string;
  equipmentList?: Equipment[];
}> = ({ data, onNodeClick, selectedNodeId, equipmentList = [] }) => {
  const nodeW = 140;
  const nodeH = 74;
  const headerH = 40;
  const areaGap = 72;
  const topY = 52;
  const nodeStartY = topY + headerH + 12;

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragOffsets, setDragOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const dragRef = useRef<{
    nodeId: string; startX: number; startY: number;
    origX: number; origY: number; hasMoved: boolean;
  } | null>(null);

  // Equipment sensor count map
  const equipMap = useMemo(() => {
    const m: Record<string, { sensorCount: number; sensors: string[] }> = {};
    equipmentList.forEach(eq => {
      m[eq.equipmentId] = { sensorCount: eq.sensorCount || 0, sensors: eq.sensors || [] };
    });
    return m;
  }, [equipmentList]);

  // Layout calculation — multi-column topology per area (serial + parallel)
  const { areaLayouts, initPos, svgW, allAreaH, progressY, svgH } = useMemo(() => {
    const nba: Record<string, ProcessFlowNode[]> = {};
    data.nodes.forEach(n => {
      const a = n.areaId || 'AREA-OTHER';
      if (!nba[a]) nba[a] = [];
      nba[a].push(n);
    });

    // Build within-area edge maps for topology
    const naMap: Record<string, string> = {};
    data.nodes.forEach(n => { naMap[n.id] = n.areaId || ''; });
    const withinEdges: Record<string, Array<{ source: string; target: string }>> = {};
    data.edges.forEach(e => {
      const sa = naMap[e.source];
      if (sa && sa === naMap[e.target]) {
        if (!withinEdges[sa]) withinEdges[sa] = [];
        withinEdges[sa].push(e);
      }
    });

    // Topological depth per node & column grouping per area
    const areaColumns: Record<string, Record<number, ProcessFlowNode[]>> = {};
    let globalMaxRows = 1;

    AREA_ORDER.forEach(areaId => {
      const nodes = nba[areaId] || [];
      if (nodes.length === 0) return;

      const edges = withinEdges[areaId] || [];
      const inDeg: Record<string, number> = {};
      const adj: Record<string, string[]> = {};
      nodes.forEach(n => { inDeg[n.id] = 0; adj[n.id] = []; });
      edges.forEach(e => { inDeg[e.target]++; adj[e.source].push(e.target); });

      // BFS longest-path depth assignment
      const depth: Record<string, number> = {};
      const queue: string[] = [];
      const remaining = new Map(nodes.map(n => [n.id, inDeg[n.id]]));
      remaining.forEach((deg, id) => {
        if (deg === 0) { depth[id] = 0; queue.push(id); }
      });
      while (queue.length > 0) {
        const curr = queue.shift()!;
        for (const next of adj[curr]) {
          const nd = (depth[curr] || 0) + 1;
          if (depth[next] === undefined || nd > depth[next]) depth[next] = nd;
          remaining.set(next, (remaining.get(next) || 1) - 1);
          if (remaining.get(next) === 0) queue.push(next);
        }
      }
      // Fallback for unreached nodes
      nodes.forEach(n => { if (depth[n.id] === undefined) depth[n.id] = 0; });

      // Group by depth → columns
      const cols: Record<number, ProcessFlowNode[]> = {};
      nodes.forEach(n => {
        const d = depth[n.id] || 0;
        if (!cols[d]) cols[d] = [];
        cols[d].push(n);
      });
      areaColumns[areaId] = cols;

      Object.values(cols).forEach(cn => {
        if (cn.length > globalMaxRows) globalMaxRows = cn.length;
      });
    });

    // Position calculation
    const colGap = 24;
    const rowGap = 16;
    const al: Record<string, { x: number; width: number; nodeCount: number; avgHealth: number }> = {};
    const ip: Record<string, { x: number; y: number }> = {};
    let xOff = 26;

    AREA_ORDER.forEach(areaId => {
      const nodes = nba[areaId] || [];
      if (nodes.length === 0) return;

      const cols = areaColumns[areaId] || {};
      const numCols = Math.max(...Object.keys(cols).map(Number), 0) + 1;
      const areaW = numCols * nodeW + (numCols - 1) * colGap + 32;

      const avg = nodes.reduce((s, n) => s + (n.healthScore || 0), 0) / nodes.length;
      al[areaId] = { x: xOff, width: areaW, nodeCount: nodes.length, avgHealth: avg };

      Object.entries(cols).forEach(([colStr, colNodes]) => {
        const col = Number(colStr);
        // Center column vertically if it has fewer rows than max
        const colOffset = 0;
        colNodes.forEach((node, row) => {
          ip[node.id] = {
            x: xOff + 16 + col * (nodeW + colGap),
            y: nodeStartY + colOffset + row * (nodeH + rowGap),
          };
        });
      });

      xOff += areaW + areaGap;
    });

    const w = Math.max(xOff - areaGap + 26, 600);
    const ah = headerH + 12 + globalMaxRows * (nodeH + rowGap) + 8;
    const py = topY + ah + 22;
    const sh = py + 58;

    return { areaLayouts: al, initPos: ip, svgW: w, allAreaH: ah, progressY: py, svgH: sh };
  }, [data.nodes, data.edges, nodeW, nodeH, headerH, areaGap, topY, nodeStartY]);

  // Effective positions = initial + drag offsets
  const nodePos = useMemo(() => {
    const r: Record<string, { x: number; y: number }> = {};
    for (const [id, p] of Object.entries(initPos)) {
      const off = dragOffsets[id];
      r[id] = off ? { x: p.x + off.x, y: p.y + off.y } : p;
    }
    return r;
  }, [initPos, dragOffsets]);

  // Track edge connections — all edges use LEFT/RIGHT ports now
  const hasOutgoing = new Set<string>();
  const hasIncoming = new Set<string>();
  data.edges.forEach(e => {
    hasOutgoing.add(e.source);
    hasIncoming.add(e.target);
  });

  // SVG coordinate conversion
  const toSVG = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const svgPt = toSVG(e.clientX, e.clientY);
    const pos = nodePos[nodeId];
    if (!pos) return;
    dragRef.current = {
      nodeId,
      startX: svgPt.x,
      startY: svgPt.y,
      origX: pos.x,
      origY: pos.y,
      hasMoved: false,
    };
  }, [toSVG, nodePos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const svgPt = toSVG(e.clientX, e.clientY);
    const dx = svgPt.x - d.startX;
    const dy = svgPt.y - d.startY;
    if (!d.hasMoved && Math.abs(dx) + Math.abs(dy) < 4) return;
    d.hasMoved = true;
    const base = initPos[d.nodeId];
    if (!base) return;
    setDragOffsets(prev => ({
      ...prev,
      [d.nodeId]: { x: d.origX + dx - base.x, y: d.origY + dy - base.y },
    }));
  }, [toSVG, initPos]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (!d.hasMoved) {
      const node = data.nodes.find(n => n.id === d.nodeId);
      if (node) onNodeClick(node);
    }
    dragRef.current = null;
  }, [data.nodes, onNodeClick]);

  // ─── SVG Definitions ──────────────────────────────────
  const renderDefs = () => (
    <defs>
      {/* Dot grid pattern for tech background */}
      <pattern id="dot-grid" width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="8" cy="8" r="0.6" fill="rgba(148,163,184,0.2)" />
      </pattern>
      <marker id="flow-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill="#38bdf8" />
      </marker>
      <marker id="flow-arrow-step" markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto">
        <polygon points="0 0.5, 5 2.5, 0 4.5" fill="#38bdf8" opacity="0.7" />
      </marker>
      <filter id="node-shadow" x="-8%" y="-8%" width="116%" height="124%">
        <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.4" />
      </filter>
      <filter id="node-shadow-selected" x="-12%" y="-12%" width="124%" height="128%">
        <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#38bdf8" floodOpacity="0.5" />
      </filter>
      <filter id="node-glow-warn" x="-16%" y="-16%" width="132%" height="136%">
        <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#f59e0b" floodOpacity="0.5" />
      </filter>
      <filter id="node-glow-crit" x="-16%" y="-16%" width="132%" height="136%">
        <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#ef4444" floodOpacity="0.6" />
      </filter>
      {/* Neon glow filter for pipes */}
      <filter id="pipe-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="pipe-glow-strong" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      {AREA_ORDER.map(areaId => {
        const c = AREA_COLORS[areaId] || '#95a5a6';
        return (
          <linearGradient key={`g-${areaId}`} id={`area-grad-${areaId}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={c} stopOpacity="0.85" />
            <stop offset="100%" stopColor={c} stopOpacity="0.55" />
          </linearGradient>
        );
      })}
      <linearGradient id="node-bg-normal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1e293b" />
        <stop offset="100%" stopColor="#0f172a" />
      </linearGradient>
      <linearGradient id="node-bg-warning" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#292218" />
        <stop offset="100%" stopColor="#1a1508" />
      </linearGradient>
      <linearGradient id="node-bg-critical" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2a1215" />
        <stop offset="100%" stopColor="#1a0a0c" />
      </linearGradient>
      <linearGradient id="edge-gradient" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.5" />
        <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.5" />
      </linearGradient>
      <linearGradient id="water-progress-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
        <stop offset="25%" stopColor="#0ea5e9" stopOpacity="0.6" />
        <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.8" />
        <stop offset="75%" stopColor="#3b82f6" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#6366f1" stopOpacity="0.9" />
      </linearGradient>
    </defs>
  );

  // ─── Title bar with LIVE indicator + animated flowing dots ──
  const renderTitleBar = () => (
    <g>
      {/* LIVE pulse indicator */}
      <circle cx={16} cy={16} r={3.5} fill="#22c55e">
        <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
        <animate attributeName="r" values="3.5;5;3.5" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={16} cy={16} r={6} fill="none" stroke="#22c55e" strokeWidth={0.8} opacity={0}>
        <animate attributeName="opacity" values="0;0.4;0" dur="2s" repeatCount="indefinite" />
        <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x={26} y={20} fontSize={8} fill="#22c55e" fontWeight="700" letterSpacing="1.5">LIVE</text>
      <text x={60} y={20} fontSize={10} fill="#94a3b8" fontWeight="500">UPW PROCESS MONITORING</text>
      <line x1={220} y1={17} x2={svgW - 160} y2={17} stroke="rgba(56,189,248,0.15)" strokeWidth={1} />
      {/* Flowing particles along top line */}
      <circle r={2.5} fill="#38bdf8" opacity={0} filter="url(#pipe-glow)">
        <animateMotion dur="5s" repeatCount="indefinite" path={`M 220 17 L ${svgW - 160} 17`} />
        <animate attributeName="opacity" values="0;0.8;0.8;0" dur="5s" repeatCount="indefinite" />
      </circle>
      <circle r={2} fill="#0ea5e9" opacity={0}>
        <animateMotion dur="5.5s" repeatCount="indefinite" path={`M 220 17 L ${svgW - 160} 17`} begin="2s" />
        <animate attributeName="opacity" values="0;0.6;0.6;0" dur="5.5s" repeatCount="indefinite" begin="2s" />
      </circle>
      <circle r={1.5} fill="#06b6d4" opacity={0}>
        <animateMotion dur="6s" repeatCount="indefinite" path={`M 220 17 L ${svgW - 160} 17`} begin="3.5s" />
        <animate attributeName="opacity" values="0;0.5;0.5;0" dur="6s" repeatCount="indefinite" begin="3.5s" />
      </circle>
      <text x={svgW - 20} y={20} textAnchor="end" fontSize={10} fill="#94a3b8" fontWeight="500">초순수 공급 &#9679;</text>
      <line x1={26} y1={38} x2={svgW - 26} y2={38} stroke="rgba(148,163,184,0.12)" strokeWidth={0.5} />
      <text x={svgW / 2} y={47} textAnchor="middle" fontSize={8} fill="#64748b">
        Water Flow Direction &#8594;
      </text>
    </g>
  );

  // ─── Nodes — dark industrial cards with neon accents ──
  const renderNodes = () => data.nodes.map((node, idx) => {
    const pos = nodePos[node.id];
    if (!pos) return null;

    const statusColor = getStatusColor(node.status, node.healthScore);
    const areaColor = AREA_COLORS[node.areaId || ''] || '#95a5a6';
    const isWarn = node.status === 'Warning' || (node.healthScore !== undefined && node.healthScore < 85 && node.healthScore >= 70);
    const isCrit = node.status === 'Critical' || (node.healthScore !== undefined && node.healthScore < 70);
    const isSel = selectedNodeId === node.id;
    const hp = node.healthScore || 0;

    const bg = isCrit ? 'url(#node-bg-critical)' : isWarn ? 'url(#node-bg-warning)' : 'url(#node-bg-normal)';
    const flt = isSel ? 'url(#node-shadow-selected)' : isCrit ? 'url(#node-glow-crit)' : isWarn ? 'url(#node-glow-warn)' : 'url(#node-shadow)';
    const barColor = isCrit ? '#ef4444' : isWarn ? '#f59e0b' : '#22c55e';
    const label = isCrit ? 'CRITICAL' : isWarn ? 'WARNING' : 'NORMAL';
    const hpBarW = Math.max(0, (nodeW - 48) * hp / 100);
    const delay = idx * 0.07;

    // Sensor count for this equipment
    const eqInfo = equipMap[node.id];
    const sCnt = eqInfo?.sensorCount || 0;

    return (
      <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}
        onPointerDown={(e) => handlePointerDown(e, node.id)}
        className={`flow-node-group ${isCrit ? 'node-glow-critical' : isWarn ? 'node-glow-warning' : ''}`}
        style={{ cursor: dragRef.current?.nodeId === node.id ? 'grabbing' : 'grab', touchAction: 'none' }}
        opacity={0}>
        {/* Entrance animation — fade in */}
        <animate attributeName="opacity" from="0" to="1" dur="0.5s" begin={`${delay}s`} fill="freeze" />

        {/* Card body — dark */}
        <rect width={nodeW} height={nodeH} rx={10} fill={bg}
          stroke={isSel ? '#38bdf8' : `${areaColor}60`}
          strokeWidth={isSel ? 2 : 1} filter={flt} />
        {/* Hover overlay */}
        <rect className="node-hover-overlay" width={nodeW} height={nodeH} rx={10}
          fill="white" opacity={0} style={{ pointerEvents: 'none' }} />
        {/* Top color strip — neon glow */}
        <rect x={0} y={0} width={nodeW} height={3} fill={areaColor} opacity={0.9}
          clipPath="inset(0 0 0 0 round 10px 10px 0 0)" />
        {/* Status badge — neon */}
        <rect x={nodeW - 52} y={8} width={46} height={14} rx={7} fill={statusColor} opacity={0.2} />
        <text x={nodeW - 29} y={18} textAnchor="middle" fontSize={7} fontWeight="700"
          fill={statusColor} letterSpacing="0.3">{label}</text>
        {/* Equipment ID */}
        <text x={8} y={20} fontSize={9} fill="#64748b" fontWeight="500">{node.id}</text>
        {/* Names — light on dark */}
        <text x={nodeW / 2} y={36} textAnchor="middle" fontSize={11.5} fontWeight="bold" fill="#e2e8f0">
          {node.nameKo && node.nameKo.length > 9 ? node.nameKo.substring(0, 8) + '..' : (node.nameKo || '')}
        </text>
        <text x={nodeW / 2} y={47} textAnchor="middle" fontSize={7.5} fill="#64748b">
          {node.name && node.name.length > 18 ? node.name.substring(0, 16) + '..' : (node.name || '')}
        </text>
        {/* Health bar — thicker with glow */}
        <rect x={8} y={54} width={nodeW - 48} height={7} rx={3.5} fill="#1e293b" />
        <rect x={8} y={54} width={0} height={7} rx={3.5} fill={barColor}>
          <animate attributeName="width" from="0" to={hpBarW} dur="0.7s" begin={`${delay + 0.3}s`} fill="freeze" />
        </rect>
        <text x={nodeW - 6} y={61} textAnchor="end" fontSize={10} fontWeight="700" fill={statusColor}>
          {hp.toFixed(0)}%
        </text>
        {/* Sensor count badge — dark */}
        {sCnt > 0 && (
          <g>
            <rect x={6} y={64} width={40} height={11} rx={5.5} fill="rgba(56,189,248,0.1)" stroke="rgba(56,189,248,0.3)" strokeWidth={0.5} />
            <text x={26} y={72} textAnchor="middle" fontSize={7} fill="#38bdf8" fontWeight="600">
              S:{sCnt}
            </text>
          </g>
        )}
        {/* Animated selection ring — neon cyan */}
        {isSel && (
          <rect x={-2} y={-2} width={nodeW + 4} height={nodeH + 4} rx={12}
            fill="none" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.7}>
            <animate attributeName="stroke-dashoffset" values="0;14" dur="1s" repeatCount="indefinite" />
          </rect>
        )}
        {/* Connection ports — LEFT (incoming) / RIGHT (outgoing) */}
        {hasIncoming.has(node.id) && (
          <circle cx={0} cy={nodeH / 2} r={3.5} fill={areaColor} stroke="#0f172a" strokeWidth={1.5} />
        )}
        {hasOutgoing.has(node.id) && (
          <circle cx={nodeW} cy={nodeH / 2} r={3.5} fill={areaColor} stroke="#0f172a" strokeWidth={1.5} />
        )}
      </g>
    );
  });

  // ─── Edges — pipeline visualization with fluid flow ──────
  const renderEdges = () => {
    // Build node→area lookup
    const nodeArea: Record<string, string> = {};
    data.nodes.forEach(n => { nodeArea[n.id] = n.areaId || ''; });

    return (
      <g style={{ pointerEvents: 'none' }}>
        {data.edges.map((edge, i) => {
          const s = nodePos[edge.source];
          const t = nodePos[edge.target];
          if (!s || !t) return null;

          const sameArea = nodeArea[edge.source] === nodeArea[edge.target];
          let d: string;

          // All edges: RIGHT port → LEFT port (horizontal left-to-right)
          const sx = s.x + nodeW + 5;
          const sy = s.y + nodeH / 2;
          const ex = t.x - 5;
          const ey = t.y + nodeH / 2;

          if (ex - sx < 10) {
            // Same column fallback — short vertical connector
            const cx = (s.x + t.x) / 2 + nodeW / 2;
            d = `M ${cx} ${Math.min(s.y, t.y) + nodeH + 3} L ${cx} ${Math.max(s.y, t.y) - 3}`;
          } else if (Math.abs(sy - ey) < 2) {
            d = `M ${sx} ${sy} L ${ex} ${ey}`;
          } else {
            // Route cross-area edges through inter-area gap
            const sAreaId = nodeArea[edge.source];
            const tAreaId = nodeArea[edge.target];
            const sL = areaLayouts[sAreaId];
            const tL = areaLayouts[tAreaId];
            const midX = (!sameArea && sL && tL)
              ? (sL.x + sL.width + tL.x) / 2    // gap center for cross-area
              : (sx + ex) / 2;                     // column gap center for within-area
            const r = Math.min(10, Math.abs(ey - sy) / 2, Math.abs(midX - sx) / 2);
            const dir = ey > sy ? 1 : -1;
            d = `M ${sx} ${sy} H ${midX - r} Q ${midX} ${sy}, ${midX} ${sy + dir * r} V ${ey - dir * r} Q ${midX} ${ey}, ${midX + r} ${ey} H ${ex}`;
          }

          if (sameArea) {
            // Within-area: thinner pipe (secondary visual)
            const dur = 1.2 + (i % 3) * 0.2;
            return (
              <g key={`e-${i}`}>
                {/* Pipe outer wall */}
                <path d={d} fill="none" stroke="rgba(56,189,248,0.08)" strokeWidth={6} strokeLinecap="round" />
                {/* Pipe inner wall */}
                <path d={d} fill="none" stroke="rgba(15,23,42,0.6)" strokeWidth={3.5} strokeLinecap="round" />
                {/* Fluid core */}
                <path d={d} fill="none" stroke="#0ea5e9" strokeWidth={2} strokeOpacity={0.6}
                  strokeLinecap="round" markerEnd="url(#flow-arrow-step)" />
                {/* Flowing dash animation */}
                <path d={d} fill="none" stroke="#38bdf8" strokeWidth={1.2}
                  strokeLinecap="round" strokeDasharray="4,8" className="flow-edge-animated" opacity={0.3} />
                {/* Single small particle */}
                <circle r={2} fill="#38bdf8" opacity={0} filter="url(#pipe-glow)">
                  <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={d} />
                  <animate attributeName="opacity" values="0;0.7;0.7;0" dur={`${dur}s`} repeatCount="indefinite" />
                </circle>
              </g>
            );
          }

          // Cross-area: bold pipeline (primary visual)
          const dur = 2.2 + (i % 5) * 0.35;
          return (
            <g key={`e-${i}`}>
              {/* Pipe outer wall — semi-transparent glow */}
              <path d={d} fill="none" stroke="rgba(56,189,248,0.12)" strokeWidth={10} strokeLinecap="round" />
              {/* Pipe inner wall — dark */}
              <path d={d} fill="none" stroke="rgba(15,23,42,0.7)" strokeWidth={6} strokeLinecap="round" />
              {/* Fluid core with gradient */}
              <path d={d} fill="none" stroke="url(#edge-gradient)" strokeWidth={3}
                strokeLinecap="round" markerEnd="url(#flow-arrow)" filter="url(#pipe-glow)" />
              {/* Flowing dash animation */}
              <path d={d} fill="none" stroke="#38bdf8" strokeWidth={2}
                strokeLinecap="round" strokeDasharray="6,10" className="flow-edge-animated" opacity={0.25} />
              {/* Particle 1 — large, glowing */}
              <circle r={3} fill="#38bdf8" opacity={0} filter="url(#pipe-glow-strong)">
                <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={d} />
                <animate attributeName="opacity" values="0;0.9;0.9;0" dur={`${dur}s`} repeatCount="indefinite" />
                <animate attributeName="r" values="2;3.5;2" dur={`${dur}s`} repeatCount="indefinite" />
              </circle>
              {/* Particle 2 — medium, offset timing */}
              <circle r={2} fill="#0ea5e9" opacity={0} filter="url(#pipe-glow)">
                <animateMotion dur={`${dur + 0.6}s`} repeatCount="indefinite" path={d} begin={`${dur * 0.35}s`} />
                <animate attributeName="opacity" values="0;0.7;0.7;0" dur={`${dur + 0.6}s`} repeatCount="indefinite" begin={`${dur * 0.35}s`} />
              </circle>
              {/* Particle 3 — small, different speed */}
              <circle r={1.5} fill="#06b6d4" opacity={0}>
                <animateMotion dur={`${dur + 1.2}s`} repeatCount="indefinite" path={d} begin={`${dur * 0.7}s`} />
                <animate attributeName="opacity" values="0;0.5;0.5;0" dur={`${dur + 1.2}s`} repeatCount="indefinite" begin={`${dur * 0.7}s`} />
              </circle>
            </g>
          );
        })}
      </g>
    );
  };

  // ─── Area backgrounds — dark glassmorphism ────────────
  const renderAreaBackgrounds = () => AREA_ORDER.map(areaId => {
    const layout = areaLayouts[areaId];
    if (!layout) return null;
    const color = AREA_COLORS[areaId] || '#95a5a6';
    const hc = layout.avgHealth < 70 ? '#ef4444' : layout.avgHealth < 85 ? '#f59e0b' : '#22c55e';
    const wq = WATER_QUALITY[areaId];

    return (
      <g key={`a-${areaId}`}>
        {/* Glass panel background */}
        <rect x={layout.x - 4} y={topY} width={layout.width + 8} height={allAreaH}
          rx={12} fill="rgba(15,23,42,0.6)" stroke={`${color}30`} strokeWidth={1} />
        {/* Subtle inner border glow */}
        <rect x={layout.x - 3} y={topY + 1} width={layout.width + 6} height={allAreaH - 2}
          rx={11} fill="none" stroke={`${color}15`} strokeWidth={0.5} />
        {/* Header gradient */}
        <rect x={layout.x - 4} y={topY} width={layout.width + 8} height={headerH}
          rx={12} fill={`url(#area-grad-${areaId})`} />
        <rect x={layout.x - 4} y={topY + headerH - 14} width={layout.width + 8} height={14}
          fill={`url(#area-grad-${areaId})`} />
        {/* Area name */}
        <text x={layout.x + 8} y={topY + 17} fontSize={11} fontWeight="700" fill="white">
          {AREA_NAMES[areaId] || areaId}
        </text>
        {wq && (
          <text x={layout.x + 8} y={topY + 32} fontSize={7.5} fill="rgba(255,255,255,0.7)">
            {wq.process}
          </text>
        )}
        {/* Health indicator */}
        <circle cx={layout.x + layout.width - 32} cy={topY + 15} r={3} fill={hc}>
          {layout.avgHealth < 85 && (
            <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
          )}
        </circle>
        <text x={layout.x + layout.width - 38} y={topY + 19} textAnchor="end"
          fontSize={9} fontWeight="600" fill="rgba(255,255,255,0.9)">
          {layout.avgHealth.toFixed(0)}%
        </text>
        <text x={layout.x + layout.width - 4} y={topY + 19} textAnchor="end"
          fontSize={9} fill="rgba(255,255,255,0.7)">
          {layout.nodeCount}대
        </text>
        {/* Bottom key metric bar */}
        {wq && (
          <g>
            <rect x={layout.x} y={topY + allAreaH - 20} width={layout.width} height={20}
              rx={0} fill="rgba(15,23,42,0.5)" />
            <text x={layout.x + layout.width / 2} y={topY + allAreaH - 6} textAnchor="middle"
              fontSize={8} fill={color} fontWeight="600" opacity={0.85}>{wq.keyMetric}</text>
          </g>
        )}
      </g>
    );
  });

  // ─── Water quality transition — neon glow connectors ──
  const renderWaterTransitions = () => {
    const els: JSX.Element[] = [];
    for (let i = 0; i < AREA_ORDER.length - 1; i++) {
      const fromId = AREA_ORDER[i];
      const toId = AREA_ORDER[i + 1];
      const fl = areaLayouts[fromId];
      const tl = areaLayouts[toId];
      if (!fl || !tl) continue;

      const gapL = fl.x + fl.width + 4;
      const gapR = tl.x - 4;
      const midX = (gapL + gapR) / 2;
      const midY = topY + allAreaH * 0.42;
      const wq = WATER_QUALITY[fromId];
      if (!wq) continue;
      const outputTag = wq.output.split(',')[0];

      els.push(
        <g key={`wt-${i}`}>
          {/* Glow connector line */}
          <line x1={gapL + 2} y1={midY} x2={gapR - 2} y2={midY}
            stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3,3"
            markerEnd="url(#flow-arrow)" opacity={0.4} filter="url(#pipe-glow)" />
          {/* Glass label */}
          <rect x={midX - 34} y={midY - 22} width={68} height={16} rx={8}
            fill="rgba(15,23,42,0.85)" stroke="rgba(56,189,248,0.3)" strokeWidth={0.5} />
          <text x={midX} y={midY - 11} textAnchor="middle" fontSize={6.5} fill="#94a3b8" fontWeight="600">
            {outputTag}
          </text>
          {/* Glowing particle */}
          <circle r={2.5} fill="#38bdf8" opacity={0} filter="url(#pipe-glow)">
            <animateMotion dur="1.6s" repeatCount="indefinite"
              path={`M ${gapL + 2} ${midY} L ${gapR - 2} ${midY}`} />
            <animate attributeName="opacity" values="0;0.8;0.8;0" dur="1.6s" repeatCount="indefinite" />
          </circle>
        </g>
      );
    }
    return els;
  };

  // ─── Water quality progress bar — neon style ────────────
  const renderWaterProgressBar = () => {
    const barX = 26;
    const barW = svgW - 52;
    const barH = 8;

    return (
      <g>
        <text x={barX} y={progressY - 10} fontSize={9} fill="#94a3b8" fontWeight="600">수질 진행도</text>
        <text x={barX + barW} y={progressY - 10} textAnchor="end" fontSize={8} fill="#64748b">
          원수 &#8594; 초순수
        </text>
        <rect x={barX} y={progressY} width={barW} height={barH} rx={4} fill="#1e293b" />
        <rect x={barX} y={progressY} width={barW} height={barH} rx={4} fill="url(#water-progress-grad)" filter="url(#pipe-glow)" />
        <rect x={barX} y={progressY} width={barW} height={barH} rx={4} fill="rgba(56,189,248,0.1)" opacity={0}>
          <animate attributeName="opacity" values="0;0.3;0" dur="3s" repeatCount="indefinite" />
        </rect>
        {WATER_MILESTONES.map((ms, i) => {
          const px = barX + (barW * ms.pos) / (WATER_MILESTONES.length - 1);
          return (
            <g key={`ms-${i}`}>
              <circle cx={px} cy={progressY + barH / 2} r={5} fill="#0f172a" stroke="#38bdf8" strokeWidth={1.5} />
              <circle cx={px} cy={progressY + barH / 2} r={2} fill="#38bdf8" />
              <text x={px} y={progressY + barH + 14} textAnchor="middle"
                fontSize={7.5} fill="#e2e8f0" fontWeight="600">{ms.label}</text>
              <text x={px} y={progressY + barH + 24} textAnchor="middle"
                fontSize={6.5} fill="#64748b">{ms.metric}</text>
            </g>
          );
        })}
        <circle r={3} fill="#38bdf8" opacity={0} filter="url(#pipe-glow)">
          <animateMotion dur="8s" repeatCount="indefinite"
            path={`M ${barX} ${progressY + barH / 2} L ${barX + barW} ${progressY + barH / 2}`} />
          <animate attributeName="opacity" values="0;0.8;0.8;0" dur="8s" repeatCount="indefinite" />
          <animate attributeName="r" values="2;4;2" dur="8s" repeatCount="indefinite" />
        </circle>
      </g>
    );
  };

  return (
    <svg ref={svgRef} width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ background: '#0f172a', borderRadius: '8px', touchAction: 'none' }}>
      {renderDefs()}
      {/* Dark tech background with dot grid */}
      <rect width={svgW} height={svgH} fill="url(#dot-grid)" />
      {renderTitleBar()}
      {renderAreaBackgrounds()}
      {renderWaterTransitions()}
      {renderNodes()}
      {renderEdges()}
      {renderWaterProgressBar()}
    </svg>
  );
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<OntologyStats | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [processFlow, setProcessFlow] = useState<ProcessFlowData | null>(null);
  const [selectedNode, setSelectedNode] = useState<ProcessFlowNode | null>(null);
  const [maintenanceRecs, setMaintenanceRecs] = useState<MaintenanceRecommendation[]>([]);
  const [maintSummary, setMaintSummary] = useState<{
    total: number; high_priority: number; medium_priority: number; low_priority: number;
  } | null>(null);
  const [energySummary, setEnergySummary] = useState<EnergyTimeseriesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodeSensors, setNodeSensors] = useState<Sensor[]>([]);
  const [loadingSensors, setLoadingSensors] = useState(false);
  const [sensorDashboard, setSensorDashboard] = useState<SensorWithObservations[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, anomaliesRes, equipmentRes, processFlowRes, energyRes, maintRes] = await Promise.all([
          ontologyApi.getStats(),
          anomalyApi.getHistory(undefined, undefined, 10),
          equipmentApi.getAll(),
          ontologyApi.getProcessFlow(),
          energyApi.getTimeseriesSummary('24h'),
          maintenanceApi.recommendAll(),
        ]);

        if (statsRes.status === 'success' && statsRes.data) setStats(statsRes.data);
        if (anomaliesRes.status === 'success' && anomaliesRes.data) setAnomalies(anomaliesRes.data);
        if (equipmentRes.status === 'success' && equipmentRes.data) setEquipment(equipmentRes.data);
        if (processFlowRes.status === 'success' && processFlowRes.data) setProcessFlow(processFlowRes.data);
        if (energyRes.status === 'success' && energyRes.data) setEnergySummary(energyRes.data);
        if (maintRes.status === 'success' && maintRes.data) {
          setMaintenanceRecs(maintRes.data.recommendations);
          setMaintSummary(maintRes.data.summary);
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

  const handleNodeClick = useCallback(async (node: ProcessFlowNode) => {
    setSelectedNode(node);
    setNodeSensors([]);
    setSensorDashboard([]);
    setLoadingSensors(true);
    try {
      const [sensorsRes, dashRes] = await Promise.all([
        equipmentApi.getSensors(node.id),
        anomalyApi.getSensorDashboard(node.id, 30),
      ]);
      if (sensorsRes.status === 'success' && sensorsRes.data) {
        setNodeSensors(sensorsRes.data);
      }
      if (dashRes.status === 'success' && dashRes.data) {
        setSensorDashboard(dashRes.data.sensors || []);
      }
    } catch {
      // ignore — sensor info is supplementary
    } finally {
      setLoadingSensors(false);
    }
  }, []);

  // --- Derived data ---
  const healthCounts = useMemo(() => {
    const counts = { normal: 0, warning: 0, critical: 0 };
    equipment.forEach(eq => {
      const hs = eq.healthScore;
      if (hs === undefined) return;
      if (hs < 70) counts.critical++;
      else if (hs < 85) counts.warning++;
      else counts.normal++;
    });
    return counts;
  }, [equipment]);

  const areaHealthSummary = useMemo(() => {
    if (!processFlow) return [];
    const areaMap: Record<string, { scores: number[]; count: number; warnings: number }> = {};
    processFlow.nodes.forEach(node => {
      const areaId = node.areaId || 'AREA-OTHER';
      if (!areaMap[areaId]) areaMap[areaId] = { scores: [], count: 0, warnings: 0 };
      areaMap[areaId].count++;
      if (node.healthScore !== undefined) {
        areaMap[areaId].scores.push(node.healthScore);
        if (node.healthScore < 85) areaMap[areaId].warnings++;
      }
    });
    return Object.entries(areaMap).map(([areaId, data]) => ({
      areaId,
      name: AREA_NAMES[areaId] || areaId,
      color: AREA_COLORS[areaId] || '#95a5a6',
      avgHealth: data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0,
      equipCount: data.count,
      warningCount: data.warnings,
    }));
  }, [processFlow]);

  const energyTotals = useMemo(() => {
    if (energySummary.length === 0) return { totalKw: 0, peakEquipment: '-', peakKw: 0 };
    const totalKw = energySummary.reduce((s, e) => s + e.avgKw, 0);
    const peak = energySummary.reduce((max, e) => e.maxKw > max.maxKw ? e : max, energySummary[0]);
    return { totalKw, peakEquipment: peak.equipmentName || peak.equipmentId, peakKw: peak.maxKw };
  }, [energySummary]);

  const activityFeed = useMemo(() => {
    const items: Array<{
      id: string; type: 'anomaly' | 'health';
      severity: 'high' | 'medium' | 'low' | 'info';
      title: string; subtitle: string; time: string; link: string;
    }> = [];

    anomalies.forEach((a, i) => {
      const sevLevel = a.severity >= 0.7 ? 'high' : a.severity >= 0.4 ? 'medium' : 'low';
      items.push({
        id: `anomaly-${i}`, type: 'anomaly', severity: sevLevel,
        title: `${a.equipmentId} 이상 감지`,
        subtitle: a.anomalyType?.split('#').pop()?.split(/(?=[A-Z])/).join(' ') || '알 수 없는 유형',
        time: a.detectedAt, link: '/anomaly',
      });
    });

    equipment.filter(eq => eq.healthScore !== undefined && eq.healthScore < 85).forEach(eq => {
      const isCrit = (eq.healthScore || 0) < 70;
      items.push({
        id: `health-${eq.equipmentId}`, type: 'health',
        severity: isCrit ? 'high' : 'medium',
        title: `${eq.equipmentId} 건강도 ${isCrit ? '위험' : '경고'}`,
        subtitle: `건강도 ${eq.healthScore?.toFixed(1)}% — ${typeof eq.name === 'string' ? eq.name : ''}`,
        time: '', link: '/equipment',
      });
    });

    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
    items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    return items.slice(0, 12);
  }, [anomalies, equipment]);

  const areaHealthData = useMemo(() => {
    if (!processFlow) return [];
    const areaScores: Record<string, number[]> = {};
    processFlow.nodes.forEach(node => {
      const areaId = node.areaId || 'AREA-OTHER';
      if (!areaScores[areaId]) areaScores[areaId] = [];
      if (node.healthScore !== undefined) areaScores[areaId].push(node.healthScore);
    });
    return Object.entries(areaScores).map(([areaId, scores]) => ({
      area: AREA_NAMES[areaId] || areaId,
      healthScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      fullMark: 100,
    }));
  }, [processFlow]);

  const formatTime = (timestamp: string) => {
    if (!timestamp) return '';
    try {
      const d = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 60) return `${diffMin}분 전`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour}시간 전`;
      return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    } catch {
      return timestamp;
    }
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

  const totalEquip = equipment.length;
  const statusBarTotal = healthCounts.normal + healthCounts.warning + healthCounts.critical;

  return (
    <div className="dashboard">
      <h1 className="page-title">UPW 예지보전 대시보드</h1>

      {/* ===== SECTION 1: KPI Cards ===== */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card-enhanced border-green">
          <div className="stat-label">시스템 건강도</div>
          <div className="stat-header">
            <div className="stat-value" style={{ color: getStatusColor(undefined, stats?.averageHealthScore) }}>
              {stats?.averageHealthScore?.toFixed(1) || '-'}%
            </div>
            <div className="stat-icon" style={{ background: '#f0fff4', color: '#38a169' }}>&#9829;</div>
          </div>
          <div className="stat-sub-info">
            <span className="sub-item"><span className="sub-dot" style={{ background: '#38a169' }}></span>정상 {healthCounts.normal}</span>
            <span className="sub-item"><span className="sub-dot" style={{ background: '#dd6b20' }}></span>경고 {healthCounts.warning}</span>
            <span className="sub-item"><span className="sub-dot" style={{ background: '#e53e3e' }}></span>위험 {healthCounts.critical}</span>
          </div>
        </div>

        <div className="stat-card-enhanced border-red">
          <div className="stat-label">경보 현황</div>
          <div className="stat-header">
            <div className="stat-value" style={{
              color: (healthCounts.warning + healthCounts.critical) > 0 ? '#e53e3e' : '#38a169'
            }}>
              {healthCounts.warning + healthCounts.critical}
            </div>
            <div className="stat-icon" style={{ background: '#fff5f5', color: '#e53e3e' }}>&#9888;</div>
          </div>
          <div className="stat-sub-info">
            {anomalies.length > 0 ? (
              <span>최근 이상: {formatTime(anomalies[0]?.detectedAt)}</span>
            ) : <span>탐지된 이상 없음</span>}
          </div>
        </div>

        <div className="stat-card-enhanced border-orange">
          <div className="stat-label">유지보수 현황</div>
          <div className="stat-header">
            <div className="stat-value" style={{ color: maintSummary ? '#dd6b20' : '#a0aec0' }}>
              {maintSummary ? maintSummary.total : '-'}
            </div>
            <div className="stat-icon" style={{ background: '#fffaf0', color: '#dd6b20' }}>&#128295;</div>
          </div>
          <div className="stat-sub-info">
            {maintSummary ? (
              <>
                {maintSummary.high_priority > 0 && <span className="sub-item"><span className="sub-dot" style={{ background: '#e53e3e' }}></span>긴급 {maintSummary.high_priority}</span>}
                {maintSummary.medium_priority > 0 && <span className="sub-item"><span className="sub-dot" style={{ background: '#dd6b20' }}></span>주의 {maintSummary.medium_priority}</span>}
                {maintSummary.low_priority > 0 && <span className="sub-item"><span className="sub-dot" style={{ background: '#38a169' }}></span>일반 {maintSummary.low_priority}</span>}
              </>
            ) : <span>분석 중...</span>}
          </div>
        </div>

        <div className="stat-card-enhanced border-blue">
          <div className="stat-label">전력 소비</div>
          <div className="stat-header">
            <div className="stat-value">
              {energyTotals.totalKw > 0 ? energyTotals.totalKw.toFixed(1) : '-'}
              <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#718096' }}> kW</span>
            </div>
            <div className="stat-icon" style={{ background: '#ebf8ff', color: '#2c5282' }}>&#9889;</div>
          </div>
          <div className="stat-sub-info">
            {energyTotals.peakKw > 0 ? (
              <span>피크: {energyTotals.peakEquipment} ({energyTotals.peakKw.toFixed(1)} kW)</span>
            ) : <span>전력 데이터 수집 중</span>}
          </div>
        </div>
      </div>

      {/* ===== SECTION 2: Process Flow Graph ===== */}
      <div className="card">
        <div className="widget-header">
          <h2 className="card-title">UPW 공정 프로세스 플로우</h2>
          <div style={{ fontSize: '0.75rem', color: '#a0aec0' }}>
            설비를 드래그하여 이동 | 클릭하여 상세 정보 확인 | 원수 &#8594; 초순수 (18.2 MΩ·cm)
          </div>
        </div>

        {/* Area Summary Chips */}
        {processFlow && (
          <div className="area-summary-bar">
            {AREA_ORDER.map(areaId => {
              const areaNodes = processFlow.nodes.filter(n => n.areaId === areaId);
              if (areaNodes.length === 0) return null;
              const avgHealth = areaNodes.reduce((s, n) => s + (n.healthScore || 0), 0) / areaNodes.length;
              const color = AREA_COLORS[areaId];
              const healthColor = avgHealth < 70 ? '#ef4444' : avgHealth < 85 ? '#f59e0b' : '#22c55e';
              const wq = WATER_QUALITY[areaId];
              return (
                <span key={areaId} className="area-chip"
                  style={{ background: `${color}18`, color: color, border: `1px solid ${color}35` }}>
                  {AREA_NAMES[areaId]}
                  <span className="area-chip-score" style={{ color: healthColor }}>
                    {avgHealth.toFixed(0)}%
                  </span>
                  <span style={{ color: '#64748b', fontSize: '0.6rem' }}>
                    ({areaNodes.length}대)
                  </span>
                  {wq && (
                    <span style={{ color: '#64748b', fontSize: '0.55rem', marginLeft: '0.2rem' }}>
                      {wq.keyMetric}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* SVG Flow Graph */}
        <div className="flow-container" style={{ overflowX: 'auto' }}>
          {processFlow && (
            <ProcessFlowGraph
              data={processFlow}
              onNodeClick={handleNodeClick}
              selectedNodeId={selectedNode?.id}
              equipmentList={equipment}
            />
          )}
        </div>

        {/* Legend — dark theme */}
        <div className="flow-legend" style={{ background: '#0f172a', color: '#64748b', border: '1px solid #1e293b' }}>
          <div className="flow-legend-section">
            <span style={{ fontWeight: 600, color: '#94a3b8' }}>상태:</span>
            <span className="flow-legend-item">
              <span className="flow-legend-dot" style={{ background: '#22c55e', boxShadow: '0 0 4px #22c55e80' }}></span> 정상
            </span>
            <span className="flow-legend-item">
              <span className="flow-legend-dot" style={{ background: '#f59e0b', boxShadow: '0 0 4px #f59e0b80' }}></span> 경고
            </span>
            <span className="flow-legend-item">
              <span className="flow-legend-dot" style={{ background: '#ef4444', boxShadow: '0 0 4px #ef444480' }}></span> 위험
            </span>
          </div>
          <div className="flow-legend-section">
            <span className="flow-legend-item">
              <span className="flow-legend-line" style={{ background: 'linear-gradient(90deg, #0ea5e9, #38bdf8)', boxShadow: '0 0 4px rgba(56,189,248,0.5)' }}></span>
              물 흐름 방향
            </span>
          </div>
        </div>

        {/* Selected Node Detail Panel — Digital Twin Dark Theme */}
        {selectedNode && (() => {
          const healthPct = selectedNode.healthScore || 0;
          const isCritical = healthPct < 70;
          const isWarning = healthPct >= 70 && healthPct < 85;
          const wq = WATER_QUALITY[selectedNode.areaId || ''];
          const areaColor = AREA_COLORS[selectedNode.areaId || ''] || '#4a5568';

          // Arc gauge calculation: semi-circle r=45, circumference = π × 45 ≈ 141.37
          const arcR = 45;
          const arcCircumference = Math.PI * arcR;
          const arcOffset = arcCircumference * (1 - healthPct / 100);
          const arcColor = isCritical ? '#ef4444' : isWarning ? '#f59e0b' : '#22c55e';

          // Sparkline helper: find dashboard sensor data for a given sensorId
          const getDashSensor = (sensorId: string): SensorWithObservations | undefined =>
            sensorDashboard.find(s => s.sensorId === sensorId);

          const getSparklineData = (sensor: SensorWithObservations) =>
            sensor.observations.map((obs, i) => ({ idx: i, value: obs.value }));

          const getTrend = (sensor: SensorWithObservations) => {
            const obs = sensor.observations;
            if (obs.length < 6) return { dir: 'stable' as const, pct: 0 };
            const recent = obs.slice(-6);
            const earlier = obs.slice(-12, -6);
            if (earlier.length === 0) return { dir: 'stable' as const, pct: 0 };
            const avgR = recent.reduce((s, o) => s + o.value, 0) / recent.length;
            const avgE = earlier.reduce((s, o) => s + o.value, 0) / earlier.length;
            const pct = avgE !== 0 ? ((avgR - avgE) / Math.abs(avgE)) * 100 : 0;
            if (pct > 1) return { dir: 'rising' as const, pct: Math.abs(pct) };
            if (pct < -1) return { dir: 'falling' as const, pct: Math.abs(pct) };
            return { dir: 'stable' as const, pct: Math.abs(pct) };
          };

          return (
            <div className="flow-detail-panel dt-panel">
              <div className="flow-detail-header" style={{
                background: `linear-gradient(90deg, ${areaColor}cc, #0f172a)`,
              }}>
                <h3>{selectedNode.nameKo || selectedNode.name} ({selectedNode.id})</h3>
                <span className={`badge ${
                  selectedNode.status?.includes('Normal') ? 'badge-normal' :
                  selectedNode.status?.includes('Warning') ? 'badge-warning' : 'badge-critical'
                }`}>
                  {selectedNode.status || 'Unknown'}
                </span>
              </div>

              {/* Top section: Arc gauge + Info grid */}
              <div style={{ display: 'flex', gap: '1rem', padding: '1rem', alignItems: 'flex-start' }}>
                {/* SVG Arc Gauge */}
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                  <svg width={120} height={80} viewBox="0 0 120 80">
                    {/* Background arc */}
                    <path d="M 15,70 A 45,45 0 0,1 105,70" fill="none"
                      stroke="#1e293b" strokeWidth={10} strokeLinecap="round" />
                    {/* Foreground arc — health */}
                    <path d="M 15,70 A 45,45 0 0,1 105,70" fill="none"
                      stroke={arcColor} strokeWidth={10} strokeLinecap="round"
                      strokeDasharray={arcCircumference}
                      strokeDashoffset={arcOffset}
                      style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.3s ease',
                        filter: `drop-shadow(0 0 6px ${arcColor}80)` }} />
                    {/* Center text */}
                    <text x={60} y={58} textAnchor="middle" fontSize={22} fontWeight="700"
                      fill={arcColor}>{healthPct.toFixed(0)}</text>
                    <text x={60} y={72} textAnchor="middle" fontSize={9} fill="#64748b">%</text>
                  </svg>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '-0.2rem' }}>건강도 점수</div>
                </div>

                {/* Info cells */}
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div className="dt-info-cell">
                    <div className="dt-info-label">공정 영역</div>
                    <div className="dt-info-value" style={{ color: areaColor }}>
                      {AREA_NAMES[selectedNode.areaId || ''] || '-'}
                    </div>
                  </div>
                  <div className="dt-info-cell">
                    <div className="dt-info-label">장비 상세</div>
                    <div className="dt-info-value">
                      <Link to="/equipment" style={{
                        color: '#38bdf8', textDecoration: 'none', fontSize: '0.8rem',
                      }}>
                        장비 관리 &#8594;
                      </Link>
                    </div>
                  </div>
                  {wq && (
                    <>
                      <div className="dt-info-cell">
                        <div className="dt-info-label">입수 수질</div>
                        <div className="dt-info-value" style={{ fontSize: '0.78rem' }}>{wq.input}</div>
                      </div>
                      <div className="dt-info-cell">
                        <div className="dt-info-label">출수 수질</div>
                        <div className="dt-info-value" style={{ fontSize: '0.78rem', color: '#38bdf8' }}>{wq.output}</div>
                      </div>
                      <div className="dt-info-cell" style={{ gridColumn: '1 / -1' }}>
                        <div className="dt-info-label">처리 공정</div>
                        <div className="dt-info-value" style={{ fontSize: '0.78rem' }}>{wq.process}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Sensor section with sparklines */}
              <div style={{ borderTop: '1px solid #1e293b', padding: '0.75rem 1rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem',
                  display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8',
                    display: 'inline-block', animation: loadingSensors ? 'none' : undefined }}></span>
                  센서 정보 ({loadingSensors ? '로딩...' : `${nodeSensors.length}개`})
                </div>
                {loadingSensors ? (
                  <div style={{ fontSize: '0.75rem', color: '#64748b', padding: '0.5rem 0' }}>센서 데이터 로딩 중...</div>
                ) : nodeSensors.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
                    {nodeSensors.map(sensor => {
                      const val = sensor.latestValue;
                      const isNormal = val !== undefined && val !== null
                        && (sensor.normalMin === undefined || sensor.normalMin === null || val >= sensor.normalMin)
                        && (sensor.normalMax === undefined || sensor.normalMax === null || val <= sensor.normalMax);
                      const isWarningS = val !== undefined && val !== null && sensor.warningThreshold !== undefined
                        && sensor.warningThreshold !== null && val >= sensor.warningThreshold;
                      const dotColor = isWarningS ? '#ef4444' : isNormal ? '#22c55e' : '#f59e0b';
                      const dashSensor = getDashSensor(sensor.sensorId);
                      const sparkData = dashSensor ? getSparklineData(dashSensor) : [];
                      const trend = dashSensor ? getTrend(dashSensor) : { dir: 'stable' as const, pct: 0 };
                      const trendArrow = trend.dir === 'rising' ? '\u2191' : trend.dir === 'falling' ? '\u2193' : '\u2192';
                      const trendColor = trend.dir === 'rising' ? '#ef4444' : trend.dir === 'falling' ? '#22c55e' : '#64748b';

                      return (
                        <div key={sensor.sensorId} className="dt-sensor-card">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 0 }}>
                              <span style={{
                                width: 7, height: 7, borderRadius: '50%',
                                background: dotColor, flexShrink: 0,
                                boxShadow: `0 0 6px ${dotColor}80`,
                              }}></span>
                              <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.78rem',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {sensor.name || sensor.sensorId}
                              </span>
                            </div>
                            <span style={{ color: trendColor, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }}>
                              {trendArrow} {trend.pct.toFixed(1)}%
                            </span>
                          </div>
                          <div style={{ color: '#64748b', fontSize: '0.62rem', marginBottom: '0.3rem' }}>
                            {sensor.type || '-'} | {sensor.unit || '-'}
                          </div>
                          {/* Mini Sparkline */}
                          {sparkData.length > 2 ? (
                            <div style={{ height: 40, marginBottom: '0.2rem' }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                                  {dashSensor && dashSensor.normalMin != null && dashSensor.normalMax != null && (
                                    <ReferenceArea
                                      y1={dashSensor.normalMin}
                                      y2={dashSensor.normalMax}
                                      fill="#22c55e"
                                      fillOpacity={0.08}
                                    />
                                  )}
                                  <YAxis domain={['dataMin', 'dataMax']} hide />
                                  <XAxis dataKey="idx" hide />
                                  <Tooltip
                                    contentStyle={{ background: '#1e293b', border: '1px solid #334155',
                                      borderRadius: 6, fontSize: '0.68rem', padding: '0.2rem 0.4rem', color: '#e2e8f0' }}
                                    formatter={(v: number) => [`${v.toFixed(2)} ${sensor.unit || ''}`, '']}
                                    labelFormatter={() => ''}
                                  />
                                  <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={1.5}
                                    dot={false} activeDot={{ r: 2, fill: '#38bdf8' }} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div style={{ height: 40, display: 'flex', alignItems: 'center',
                              justifyContent: 'center', color: '#334155', fontSize: '0.62rem' }}>
                              관측 데이터 부족
                            </div>
                          )}
                          {/* Current value */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0' }}>
                              {val !== undefined && val !== null ? val.toFixed(2) : '-'}
                              <span style={{ fontSize: '0.65rem', color: '#64748b', marginLeft: '0.2rem' }}>{sensor.unit || ''}</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.72rem', color: '#334155' }}>센서 데이터 없음</div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ===== SECTION 3: System Status ===== */}
      <div className="section-title">시스템 현황</div>
      <div className="dashboard-status-grid">
        <div className="card">
          <h2 className="card-title">최근 활동 타임라인</h2>
          {activityFeed.length > 0 ? (
            <div className="activity-feed">
              {activityFeed.map(item => (
                <div key={item.id} className="activity-item" onClick={() => navigate(item.link)}>
                  <div className={`activity-indicator ${item.severity}`}></div>
                  <div className="activity-content">
                    <div className="activity-title">{item.title}</div>
                    <div className="activity-subtitle">{item.subtitle}</div>
                  </div>
                  <div className="activity-time">{formatTime(item.time)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-data" style={{ height: '200px' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>&#10003;</div>
              모든 시스템 정상 운영 중
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="card-title">공정 영역 건강도</h2>
          <div className="area-health-list">
            {areaHealthSummary.map(area => {
              const healthColor = area.avgHealth < 70 ? '#e53e3e' : area.avgHealth < 85 ? '#dd6b20' : '#38a169';
              const wq = WATER_QUALITY[area.areaId];
              return (
                <div key={area.areaId} className="area-health-item"
                  style={{ borderLeft: `4px solid ${area.color}` }}>
                  <div className="area-health-header">
                    <div className="area-health-name">
                      <span style={{ color: area.color }}>{area.name}</span>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: healthColor }}>
                      {area.avgHealth.toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ marginBottom: '0.3rem' }}>
                    <div className="health-bar" style={{ height: '6px' }}>
                      <div className={`health-bar-fill ${
                        area.avgHealth >= 85 ? 'normal' : area.avgHealth >= 70 ? 'warning' : 'critical'
                      }`} style={{ width: `${area.avgHealth}%` }}></div>
                    </div>
                  </div>
                  <div className="area-health-meta">
                    <span>설비 {area.equipCount}대</span>
                    {area.warningCount > 0 && (
                      <span style={{ color: '#e53e3e' }}>&#9888; 주의 {area.warningCount}대</span>
                    )}
                    {wq && (
                      <span style={{ color: '#718096', fontSize: '0.65rem' }}>{wq.keyMetric}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== SECTION 4: Quick Insights ===== */}
      <div className="section-title">빠른 인사이트</div>
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <h2 className="card-title">공정 영역별 건강도 비교</h2>
          <div className="chart-wrapper">
            {areaHealthData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={areaHealthData} outerRadius="70%">
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="area" tick={{ fontSize: 11, fill: '#4a5568' }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar name="건강도" dataKey="healthScore" stroke="#2c5282" fill="#2c5282" fillOpacity={0.3} />
                  <Tooltip formatter={(value: number) => [`${value.toFixed(1)}%`, '평균 건강도']} />
                </RadarChart>
              </ResponsiveContainer>
            ) : <div className="no-data">데이터 없음</div>}
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">설비 상태 분포</h2>
          {statusBarTotal > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div className="status-bar-stacked">
                {healthCounts.normal > 0 && (
                  <div className="status-bar-segment" style={{
                    width: `${(healthCounts.normal / statusBarTotal) * 100}%`, background: '#38a169',
                  }}>{healthCounts.normal}</div>
                )}
                {healthCounts.warning > 0 && (
                  <div className="status-bar-segment" style={{
                    width: `${(healthCounts.warning / statusBarTotal) * 100}%`, background: '#dd6b20',
                  }}>{healthCounts.warning}</div>
                )}
                {healthCounts.critical > 0 && (
                  <div className="status-bar-segment" style={{
                    width: `${(healthCounts.critical / statusBarTotal) * 100}%`, background: '#e53e3e',
                  }}>{healthCounts.critical}</div>
                )}
              </div>
              <div className="status-legend">
                <span className="status-legend-item">
                  <span className="status-legend-dot" style={{ background: '#38a169' }}></span>
                  정상 {healthCounts.normal}대 ({(healthCounts.normal / statusBarTotal * 100).toFixed(0)}%)
                </span>
                <span className="status-legend-item">
                  <span className="status-legend-dot" style={{ background: '#dd6b20' }}></span>
                  경고 {healthCounts.warning}대 ({(healthCounts.warning / statusBarTotal * 100).toFixed(0)}%)
                </span>
                <span className="status-legend-item">
                  <span className="status-legend-dot" style={{ background: '#e53e3e' }}></span>
                  위험 {healthCounts.critical}대 ({(healthCounts.critical / statusBarTotal * 100).toFixed(0)}%)
                </span>
              </div>
            </div>
          )}

          {maintenanceRecs.length > 0 && (
            <div style={{ marginTop: '1rem', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#718096', marginBottom: '0.4rem' }}>
                유지보수 권고 요약
              </div>
              <div style={{ fontSize: '0.82rem', color: '#4a5568' }}>
                전체 {totalEquip}대 중 <strong style={{ color: '#e53e3e' }}>
                  {maintSummary?.high_priority || 0}대 긴급</strong>,{' '}
                <strong style={{ color: '#dd6b20' }}>
                  {maintSummary?.medium_priority || 0}대 주의</strong> 필요
              </div>
            </div>
          )}

          <div className="quick-nav">
            <Link to="/anomaly" className="quick-nav-btn">&#9888; Anomaly Monitor</Link>
            <Link to="/energy" className="quick-nav-btn">&#9889; Energy Monitor</Link>
            <Link to="/equipment" className="quick-nav-btn">&#9881; Equipment</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
