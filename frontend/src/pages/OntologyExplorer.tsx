import React, { useEffect, useState, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { ontologyApi, reasoningApi, testDataApi, axiomApi, constraintApi } from '../services/api';
import type { OntologyClass } from '../types';
import AxiomViewer from '../components/AxiomViewer';
import ConstraintViewer from '../components/ConstraintViewer';
import ViolationPanel from '../components/ViolationPanel';
import type { Axiom, AxiomCheckAllResult } from '../types/axiom.types';
import type { Constraint, ConstraintCheckAllResult } from '../types/constraint.types';

// Reasoning types
interface InferenceRule {
  id: string;
  name: string;
  description: string;
  category: string;
  condition?: string;
  inference?: string;
  inputData?: string[];
  outputData?: string[];
}

interface InferredFact {
  nodes: any[];
  relationships: any[];
  nodeCount: number;
  relationshipCount: number;
}

interface ReasoningStats {
  totalInferredNodes: number;
  totalInferredRelationships: number;
  nodesByType: Array<{ label: string; count: number }>;
  relationshipsByType: Array<{ type: string; count: number }>;
}

// 추론 과정 추적 타입
interface ReasoningStep {
  stepNumber: number;
  type: 'MATCH' | 'FILTER' | 'CHECK' | 'INFERENCE' | 'RESULT';
  description: string;
  descriptionDetail?: string;
  query?: string;
  resultSummary?: string;
  dataCount: number;
  data: any[];
  timestamp: string;
}

interface Evidence {
  id: string;
  type: 'NODE' | 'RELATIONSHIP' | 'PROPERTY';
  nodeId: string;
  label: string;
  propertyName: string;
  propertyValue: any;
  description: string;
}

interface ReasoningTrace {
  id: string;
  ruleId: string;
  ruleName: string;
  ruleDescription: string;
  startedAt: string;
  completedAt: string | null;
  result: 'SUCCESS' | 'NO_MATCH' | 'ERROR' | 'PENDING';
  steps: ReasoningStep[];
  evidence: Evidence[];
  inferredCount: number;
  inferredItems: any[];
  summary: string;
}

// 테스트 데이터 타입
interface TestScenario {
  id: string;
  name: string;
  description: string;
  targetRule: string;
  expectedResult: string;
  loaded?: boolean;
}

interface TestDataStatus {
  scenarios: Array<{ id: string; name: string; loaded: boolean }>;
  dataStatus: {
    lowHealthEquipment: number;
    anomalyObservations: number;
    trendingObservations: number;
    testEquipment: number;
    flowSensors: number;
    inferredNodes: number;
    inferredRelationships: number;
  };
}

// Node colors by type
const NODE_COLORS: Record<string, string> = {
  'equipment': '#3498db',
  'sensor': '#2ecc71',
  'area': '#9b59b6',
  'maintenance': '#e67e22',
  'anomaly': '#e74c3c',
  'observation': '#1abc9c',
  'processarea': '#9b59b6',
  'axiom': '#8e44ad',
  'constraint': '#c0392b',
  'prediction': '#d35400',
  'dependency': '#16a085',
  'correlation': '#27ae60',
  'other': '#95a5a6',
};

// --- Creative Visualization Constants ---

// Geometric shape per node type
const NODE_SHAPES: Record<string, string> = {
  processarea: 'hexagon',
  area: 'hexagon',
  equipment: 'roundedRect',
  sensor: 'diamond',
  observation: 'circle',
  anomaly: 'triangle',
  maintenance: 'pentagon',
  prediction: 'star',
  dependency: 'parallelogram',
  correlation: 'bowtie',
  axiom: 'shield',
  constraint: 'octagon',
  other: 'circle',
};

// Hierarchy-based node sizes (tier 1 = largest)
const NODE_HIERARCHY_SIZE: Record<string, number> = {
  processarea: 18,
  area: 16,
  equipment: 13,
  maintenance: 10,
  anomaly: 10,
  prediction: 10,
  axiom: 10,
  constraint: 10,
  dependency: 9,
  correlation: 9,
  sensor: 7,
  observation: 7,
  other: 8,
};

// Unicode symbols for instant type identification
const NODE_SYMBOLS: Record<string, string> = {
  processarea: '\u2302',  // ⌂
  area: '\u25CB',         // ○
  equipment: '\u2699',    // ⚙
  sensor: '\u25C8',       // ◈
  observation: '\u25CE',  // ◎
  anomaly: '\u26A0',      // ⚠
  maintenance: '\u2692',  // ⚒
  prediction: '\u2605',   // ★
  dependency: '\u2192',   // →
  correlation: '\u2194',  // ↔
  axiom: '\u2261',        // ≡
  constraint: '\u2716',   // ✖
  other: '\u25CF',        // ●
};

// Link category classification
const LINK_CATEGORIES: Record<string, { types: string[]; style: string; color: string; width: number }> = {
  physical: {
    types: ['FEEDS_INTO', 'LOCATED_IN', 'CONTAINS', 'CONNECTED_TO', 'PART_OF'],
    style: 'solid',
    color: '#475569',
    width: 2.5,
  },
  sensor: {
    types: ['HAS_SENSOR', 'IS_ATTACHED_TO', 'OBSERVED_BY', 'HAS_OBSERVATION', 'MEASURES'],
    style: 'dotted',
    color: '#22c55e',
    width: 1.5,
  },
  status: {
    types: ['HAS_STATUS', 'HAS_ANOMALY', 'HAS_MAINTENANCE', 'PREDICTS', 'HAS_PREDICTION'],
    style: 'pulse',
    color: '#ef4444',
    width: 2,
  },
  meta: {
    types: ['APPLIES_TO', 'VALIDATES', 'CHECKS', 'VIOLATES', 'SATISFIES', 'DEFINED_BY', 'HAS_AXIOM', 'HAS_CONSTRAINT'],
    style: 'dashdot',
    color: '#a78bfa',
    width: 1.5,
  },
  structural: {
    types: ['DEPENDS_ON', 'CORRELATES_WITH', 'CAUSES', 'AFFECTS'],
    style: 'dashed',
    color: '#2dd4bf',
    width: 2,
  },
};

// Helper: classify a link type into a category
const getLinkCategory = (linkType: string) => {
  const upper = linkType.toUpperCase();
  for (const [, cat] of Object.entries(LINK_CATEGORIES)) {
    if (cat.types.some(t => upper.includes(t))) return cat;
  }
  return { style: 'solid', color: '#cbd5e1', width: 1 };
};

// Node type groupings
const NODE_TYPE_GROUPS: Record<string, { label: string; types: string[] }> = {
  general: {
    label: '일반 데이터',
    types: ['equipment', 'sensor', 'area', 'processarea', 'maintenance', 'observation', 'anomaly', 'prediction', 'dependency', 'correlation', 'other'],
  },
  axiomConstraint: {
    label: '공리/제약조건',
    types: ['axiom', 'constraint'],
  },
};

// Relationship type patterns for grouping
const AXIOM_CONSTRAINT_REL_PATTERNS = [
  'APPLIES_TO',
  'VALIDATES',
  'CHECKS',
  'VIOLATES',
  'SATISFIES',
  'DEFINED_BY',
  'HAS_AXIOM',
  'HAS_CONSTRAINT',
];

// Extended graph types for force graph
interface ForceGraphNode {
  id: string;
  name: string;
  nodeType: string;
  labels: string[];
  properties: Record<string, any>;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  [key: string]: any;
}

interface ForceGraphLink {
  source: string | ForceGraphNode;
  target: string | ForceGraphNode;
  type: string;
}

interface ForceGraphData {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
}

interface HierarchyNode {
  name: string;
  count: number;
  children: HierarchyNode[];
}

interface NodeDetails {
  id: string;
  labels: string[];
  name: string;
  properties: Record<string, any>;
  outgoing: Array<{ type: string; target: string; targetLabels: string[]; targetName: string }>;
  incoming: Array<{ type: string; source: string; sourceLabels: string[]; sourceName: string }>;
}

type ActiveTab = 'main' | 'query' | 'hierarchy' | 'axioms';

const OntologyExplorer: React.FC = () => {
  // Core state
  const [classes, setClasses] = useState<OntologyClass[]>([]);
  const [graphData, setGraphData] = useState<ForceGraphData>({ nodes: [], links: [] });
  const [originalGraphData, setOriginalGraphData] = useState<ForceGraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection & Highlighting
  const [selectedNode, setSelectedNode] = useState<ForceGraphNode | null>(null);
  const [nodeDetails, setNodeDetails] = useState<NodeDetails | null>(null);
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set());
  const [hoverNode, setHoverNode] = useState<ForceGraphNode | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<ActiveTab>('main');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Popup state for node/edge details
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<any>(null);
  const isDraggingPopup = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const popupRef = useRef<HTMLDivElement>(null);

  // Animation tick for consistent timing across canvas draws
  const animTickRef = useRef(0);
  const initialFitDone = useRef(false);

  // Graph dimensions (responsive)
  const [graphDimensions, setGraphDimensions] = useState({ width: 0, height: 600 });

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<string>>(new Set(Object.keys(NODE_COLORS)));
  const [visibleRelTypes, setVisibleRelTypes] = useState<Set<string>>(new Set());
  const [relationshipTypes, setRelationshipTypes] = useState<Array<{ type: string; count: number }>>([]);

  // Cypher Query
  const [cypherQuery, setCypherQuery] = useState('MATCH (n) RETURN n LIMIT 25');
  const [queryResults, setQueryResults] = useState<any[] | null>(null);
  const [queryColumns, setQueryColumns] = useState<string[]>([]);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);

  // Hierarchy
  const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Path Finding
  const [pathSource, setPathSource] = useState<string>('');
  const [pathTarget, setPathTarget] = useState<string>('');
  const [pathResult, setPathResult] = useState<any>(null);
  const [isFindingPath, setIsFindingPath] = useState(false);

  // Reasoning/Inference
  const [inferenceRules, setInferenceRules] = useState<InferenceRule[]>([]);
  const [inferredFacts, setInferredFacts] = useState<InferredFact | null>(null);
  const [reasoningStats, setReasoningStats] = useState<ReasoningStats | null>(null);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [isRunningReasoning, setIsRunningReasoning] = useState(false);
  const [reasoningMessage, setReasoningMessage] = useState<string | null>(null);
  const [runAllResult, setRunAllResult] = useState<any>(null);
  const [reasoningTrace, setReasoningTrace] = useState<ReasoningTrace | null>(null);
  const [isLoadingTrace, setIsLoadingTrace] = useState(false);
  const [showTraceModal, setShowTraceModal] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  // Test Data
  const [testScenarios, setTestScenarios] = useState<TestScenario[]>([]);
  const [testDataStatus, setTestDataStatus] = useState<TestDataStatus | null>(null);
  const [isLoadingTestData, setIsLoadingTestData] = useState(false);
  const [testDataMessage, setTestDataMessage] = useState<string | null>(null);

  // Axioms & Constraints
  const [axioms, setAxioms] = useState<Axiom[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [axiomResults, setAxiomResults] = useState<AxiomCheckAllResult | null>(null);
  const [constraintResults, setConstraintResults] = useState<ConstraintCheckAllResult | null>(null);
  const [isCheckingAxioms, setIsCheckingAxioms] = useState(false);
  const [isValidatingConstraints, setIsValidatingConstraints] = useState(false);

  // Individual check results
  const [individualAxiomResults, setIndividualAxiomResults] = useState<Record<string, {
    passed: boolean;
    violationCount: number;
    violations: Array<{ nodeId: string | null; description: string; details: Record<string, any> }>;
    checkedAt: string;
  }>>({});
  const [individualConstraintResults, setIndividualConstraintResults] = useState<Record<string, {
    passed: boolean;
    violationCount: number;
    violations: Array<{ nodeId: string | null; description: string; details: Record<string, any> }>;
    checkedAt: string;
  }>>({});
  const [checkingAxiomId, setCheckingAxiomId] = useState<string | null>(null);
  const [checkingConstraintId, setCheckingConstraintId] = useState<string | null>(null);

  // Refs
  const graphRef = useRef<any>();
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [classesRes, graphRes, relTypesRes, hierarchyRes, axiomsRes, constraintsRes] = await Promise.all([
          ontologyApi.getClasses(),
          ontologyApi.getGraph(undefined, undefined, true),  // fetch all nodes and edges
          ontologyApi.getRelationshipTypes(),
          ontologyApi.getHierarchy(),
          axiomApi.getAll(),
          constraintApi.getAll(),
        ]);

        if (classesRes.status === 'success' && classesRes.data) {
          setClasses(classesRes.data);
        }

        if (graphRes.status === 'success' && graphRes.data) {
          const nodes: ForceGraphNode[] = graphRes.data.nodes.map((n: any) => ({
            id: n.id,
            name: n.displayLabel || n.properties?.name || n.properties?.equipmentId || n.id,
            nodeType: n.nodeType || 'other',
            labels: n.labels || [],
            properties: n.properties || {},
          }));

          const links: ForceGraphLink[] = graphRes.data.edges.map((e: any) => ({
            source: e.source,
            target: e.target,
            type: e.type,
          }));

          const data = { nodes, links };
          setGraphData(data);
          setOriginalGraphData(data);
        }

        if (relTypesRes.status === 'success' && relTypesRes.data) {
          setRelationshipTypes(relTypesRes.data);
          setVisibleRelTypes(new Set(relTypesRes.data.map((r: any) => r.type)));
        }

        if (hierarchyRes.status === 'success' && hierarchyRes.data?.tree) {
          setHierarchy(hierarchyRes.data.tree);
        }

        if (axiomsRes.status === 'success' && axiomsRes.data?.axioms) {
          setAxioms(axiomsRes.data.axioms as Axiom[]);
        }

        if (constraintsRes.status === 'success' && constraintsRes.data?.constraints) {
          setConstraints(constraintsRes.data.constraints as Constraint[]);
        }
      } catch (err) {
        setError('Failed to load ontology data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter graph data based on visibility settings
  useEffect(() => {
    if (originalGraphData.nodes.length === 0) return;

    const filteredNodes = originalGraphData.nodes.filter(
      (node) => visibleNodeTypes.has(node.nodeType)
    );
    const nodeIds = new Set(filteredNodes.map((n) => n.id));

    const filteredLinks = originalGraphData.links.filter((link) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      return (
        nodeIds.has(sourceId) &&
        nodeIds.has(targetId) &&
        visibleRelTypes.has(link.type)
      );
    });

    setGraphData({ nodes: filteredNodes, links: filteredLinks });
  }, [visibleNodeTypes, visibleRelTypes, originalGraphData]);

  // Search handler with debounce
  const handleSearch = useCallback(async (query: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await ontologyApi.searchNodes(query, undefined, 20);
        if (res.status === 'success' && res.data) {
          setSearchResults(res.data);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  // Execute Cypher query
  const executeQuery = async () => {
    if (!cypherQuery.trim()) return;

    setIsQuerying(true);
    setQueryError(null);
    setQueryResults(null);

    try {
      const res = await ontologyApi.executeCypher(cypherQuery);
      if (res.status === 'success' && res.data) {
        setQueryResults(res.data.data || []);
        setQueryColumns(res.data.columns || []);
      } else {
        setQueryError(res.message || 'Query execution failed');
      }
    } catch (err: any) {
      setQueryError(err.response?.data?.message || err.message || 'Query execution failed');
    } finally {
      setIsQuerying(false);
    }
  };

  // Find path between nodes
  const handleFindPath = async () => {
    if (!pathSource || !pathTarget) return;

    setIsFindingPath(true);
    setPathResult(null);

    try {
      const res = await ontologyApi.findPath(pathSource, pathTarget, 5);
      if (res.status === 'success') {
        setPathResult(res.data);
        if (res.data) {
          // Highlight path nodes and links
          const pathNodeIds = new Set(res.data.nodes.map((n: any) => n.id));
          const pathLinkIds = new Set(
            res.data.relationships.map((r: any) => `${r.source}-${r.target}`)
          );
          setHighlightNodes(pathNodeIds);
          setHighlightLinks(pathLinkIds);
        }
      }
    } catch (err) {
      console.error('Path finding error:', err);
    } finally {
      setIsFindingPath(false);
    }
  };

  // Node click handler
  const handleNodeClick = useCallback(async (node: ForceGraphNode, _event?: MouseEvent) => {
    setSelectedNode(node);
    setSelectedEdge(null);
    setPathSource(node.id);

    // Position popup next to filter panel
    const filterW = showFilters ? 312 : 0; // 300px panel + 12px left margin
    const gap = 12;
    setPopupPosition({ x: filterW + gap, y: gap });

    // Fetch detailed node info
    try {
      const res = await ontologyApi.getNodeDetails(node.id);
      if (res.status === 'success' && res.data) {
        setNodeDetails(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch node details:', err);
    }

    // Highlight connected nodes and links
    const connectedNodes = new Set<string>();
    const connectedLinks = new Set<string>();
    connectedNodes.add(node.id);

    graphData.links.forEach((link) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      if (sourceId === node.id) {
        connectedNodes.add(targetId);
        connectedLinks.add(`${sourceId}-${targetId}`);
      }
      if (targetId === node.id) {
        connectedNodes.add(sourceId);
        connectedLinks.add(`${sourceId}-${targetId}`);
      }
    });

    setHighlightNodes(connectedNodes);
    setHighlightLinks(connectedLinks);

    if (graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 500);
      graphRef.current.zoom(2, 500);
    }
  }, [graphData.links, showFilters]);

  // Handle search result click
  const handleSearchResultClick = (result: any) => {
    const node = graphData.nodes.find((n) => n.id === result.id);
    if (node) {
      handleNodeClick(node);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  // Node hover handler
  const handleNodeHover = useCallback((node: ForceGraphNode | null) => {
    setHoverNode(node);
  }, []);

  // Background click handler
  const handleBackgroundClick = useCallback(() => {
    if (isDraggingPopup.current) return;
    setSelectedNode(null);
    setNodeDetails(null);
    setPopupPosition(null);
    setSelectedEdge(null);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    setPathResult(null);
  }, []);

  // Link click handler
  const handleLinkClick = useCallback((link: any, _event: MouseEvent) => {
    setSelectedEdge(link);
    setNodeDetails(null);
    setSelectedNode(null);
    // Position popup next to filter panel
    const filterW = showFilters ? 312 : 0;
    const gap = 12;
    setPopupPosition({ x: filterW + gap, y: gap });
  }, [showFilters]);

  // Popup drag handlers
  const handlePopupDragMove = useCallback((e: MouseEvent) => {
    if (!isDraggingPopup.current || !graphContainerRef.current) return;
    const rect = graphContainerRef.current.getBoundingClientRect();
    const newX = e.clientX - rect.left - dragOffset.current.x;
    const newY = e.clientY - rect.top - dragOffset.current.y;
    const popupWidth = popupRef.current?.offsetWidth ?? 360;
    const popupHeight = popupRef.current?.offsetHeight ?? 300;
    setPopupPosition({
      x: Math.max(0, Math.min(newX, rect.width - popupWidth)),
      y: Math.max(0, Math.min(newY, rect.height - popupHeight)),
    });
  }, []);

  const handlePopupDragEnd = useCallback(() => {
    document.removeEventListener('mousemove', handlePopupDragMove);
    document.removeEventListener('mouseup', handlePopupDragEnd);
    setTimeout(() => { isDraggingPopup.current = false; }, 50);
  }, [handlePopupDragMove]);

  const handlePopupDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || !graphContainerRef.current) return;
    e.preventDefault();
    isDraggingPopup.current = true;
    const rect = graphContainerRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left - (popupPosition?.x ?? 0),
      y: e.clientY - rect.top - (popupPosition?.y ?? 0),
    };
    document.addEventListener('mousemove', handlePopupDragMove);
    document.addEventListener('mouseup', handlePopupDragEnd);
  }, [popupPosition, handlePopupDragMove, handlePopupDragEnd]);

  // Cleanup popup drag listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handlePopupDragMove);
      document.removeEventListener('mouseup', handlePopupDragEnd);
    };
  }, [handlePopupDragMove, handlePopupDragEnd]);

  // Responsive graph dimensions via ResizeObserver
  useEffect(() => {
    const container = graphContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          setGraphDimensions({
            width,
            height: isFullscreen ? window.innerHeight : 600,
          });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [isFullscreen]);

  // Animation tick for consistent frame-synced timing
  useEffect(() => {
    let frameId: number;
    const tick = () => {
      animTickRef.current = performance.now();
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Toggle node type visibility
  const toggleNodeType = (type: string) => {
    setVisibleNodeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Toggle relationship type visibility
  const toggleRelType = (type: string) => {
    setVisibleRelTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Toggle hierarchy node expansion
  const toggleHierarchyNode = (name: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // --- Shape drawing helpers ---
  const drawShapes: Record<string, (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => void> = {
    hexagon: (ctx, x, y, r) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = x + r * Math.cos(a);
        const py = y + r * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    },
    roundedRect: (ctx, x, y, r) => {
      const w = r * 1.8, h = r * 1.4, cr = r * 0.3;
      const lx = x - w / 2, ly = y - h / 2;
      ctx.beginPath();
      ctx.moveTo(lx + cr, ly);
      ctx.arcTo(lx + w, ly, lx + w, ly + h, cr);
      ctx.arcTo(lx + w, ly + h, lx, ly + h, cr);
      ctx.arcTo(lx, ly + h, lx, ly, cr);
      ctx.arcTo(lx, ly, lx + w, ly, cr);
      ctx.closePath();
    },
    diamond: (ctx, x, y, r) => {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.8, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.8, y);
      ctx.closePath();
    },
    circle: (ctx, x, y, r) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
    },
    triangle: (ctx, x, y, r) => {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.866, y + r * 0.5);
      ctx.lineTo(x - r * 0.866, y + r * 0.5);
      ctx.closePath();
    },
    pentagon: (ctx, x, y, r) => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
        const px = x + r * Math.cos(a);
        const py = y + r * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    },
    star: (ctx, x, y, r) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const d = i % 2 === 0 ? r : r * 0.45;
        const px = x + d * Math.cos(a);
        const py = y + d * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    },
    parallelogram: (ctx, x, y, r) => {
      const w = r * 1.6, h = r * 1.2, skew = r * 0.4;
      ctx.beginPath();
      ctx.moveTo(x - w / 2 + skew, y - h / 2);
      ctx.lineTo(x + w / 2 + skew, y - h / 2);
      ctx.lineTo(x + w / 2 - skew, y + h / 2);
      ctx.lineTo(x - w / 2 - skew, y + h / 2);
      ctx.closePath();
    },
    bowtie: (ctx, x, y, r) => {
      ctx.beginPath();
      ctx.moveTo(x - r, y - r * 0.6);
      ctx.lineTo(x, y);
      ctx.lineTo(x - r, y + r * 0.6);
      ctx.closePath();
      ctx.moveTo(x + r, y - r * 0.6);
      ctx.lineTo(x, y);
      ctx.lineTo(x + r, y + r * 0.6);
      ctx.closePath();
    },
    shield: (ctx, x, y, r) => {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x + r, y - r * 0.6, x + r, y);
      ctx.quadraticCurveTo(x + r * 0.5, y + r * 0.8, x, y + r);
      ctx.quadraticCurveTo(x - r * 0.5, y + r * 0.8, x - r, y);
      ctx.quadraticCurveTo(x - r, y - r * 0.6, x, y - r);
      ctx.closePath();
    },
    octagon: (ctx, x, y, r) => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i - Math.PI / 8;
        const px = x + r * Math.cos(a);
        const py = y + r * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    },
  };

  // Color utility helpers
  const lightenColor = (hex: string, amount: number): string => {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0x00FF) + amount);
    const b = Math.min(255, (num & 0x0000FF) + amount);
    return `rgb(${r},${g},${b})`;
  };

  const darkenColor = (hex: string, amount: number): string => {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - amount);
    const g = Math.max(0, ((num >> 8) & 0x00FF) - amount);
    const b = Math.max(0, (num & 0x0000FF) - amount);
    return `rgb(${r},${g},${b})`;
  };

  // Node canvas drawing — creative shape-coded visualization
  const drawNode = useCallback(
    (node: ForceGraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x;
      const y = node.y;
      if (x == null || y == null) return;

      const label = node.name || node.id;
      const nodeColor = NODE_COLORS[node.nodeType] || NODE_COLORS.other;
      const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
      const isHovered = hoverNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;

      const baseRadius = NODE_HIERARCHY_SIZE[node.nodeType] || 8;
      let radius = baseRadius * (isHovered ? 1.25 : isSelected ? 1.15 : 1);
      const shapeName = NODE_SHAPES[node.nodeType] || 'circle';
      const drawShape = drawShapes[shapeName] || drawShapes.circle;
      const symbol = NODE_SYMBOLS[node.nodeType] || '';
      const tick = animTickRef.current;

      // B3: Breathing pulse for sensor/observation nodes
      if ((node.nodeType === 'sensor' || node.nodeType === 'observation') && isHighlighted) {
        radius *= 1 + 0.08 * Math.sin(tick / 200);
      }

      ctx.save();

      // Smooth radialGradient halo (replaces shadowBlur glow)
      const haloAlpha = isHighlighted ? 0.35 : 0.12;
      const haloR = radius * (isHighlighted ? 2.5 : 1.8);
      const haloGrad = ctx.createRadialGradient(x, y, radius * 0.6, x, y, haloR);
      haloGrad.addColorStop(0, `${nodeColor}${Math.round(haloAlpha * 255).toString(16).padStart(2, '0')}`);
      haloGrad.addColorStop(0.4, `${nodeColor}${Math.round(haloAlpha * 0.4 * 255).toString(16).padStart(2, '0')}`);
      haloGrad.addColorStop(1, `${nodeColor}00`);
      ctx.beginPath();
      ctx.arc(x, y, haloR, 0, Math.PI * 2);
      ctx.fillStyle = haloGrad;
      ctx.fill();

      // --- Gradient fill ---
      const grad = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.3, 0, x, y, radius * 1.1);
      if (isHighlighted) {
        grad.addColorStop(0, lightenColor(nodeColor, 50));
        grad.addColorStop(0.6, nodeColor);
        grad.addColorStop(1, darkenColor(nodeColor, 30));
      } else {
        grad.addColorStop(0, lightenColor(nodeColor, 40));
        grad.addColorStop(0.6, `${nodeColor}90`);
        grad.addColorStop(1, `${nodeColor}50`);
      }

      drawShape(ctx, x, y, radius);
      ctx.fillStyle = grad;
      ctx.fill();

      // Specular highlight (glass/holographic feel)
      const specGrad = ctx.createRadialGradient(
        x - radius * 0.3, y - radius * 0.35, 0,
        x - radius * 0.05, y - radius * 0.05, radius * 0.75
      );
      specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
      specGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.06)');
      specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      drawShape(ctx, x, y, radius);
      ctx.fillStyle = specGrad;
      ctx.fill();

      // --- Border (outer crisp + inner glow) ---
      drawShape(ctx, x, y, radius);
      ctx.strokeStyle = isSelected ? '#f87171' : isHovered ? lightenColor(nodeColor, 40) : `${nodeColor}cc`;
      ctx.lineWidth = (isSelected ? 2.5 : isHovered ? 2 : 1) / globalScale;
      ctx.stroke();

      // Thin inner rim highlight
      if (isHighlighted) {
        drawShape(ctx, x, y, radius * 0.88);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 0.5 / globalScale;
        ctx.stroke();
      }

      // --- Selection / hover pulse ring ---
      if (isSelected || isHovered) {
        const t = (tick % 600) / 600;
        const pulseR = radius * (1.3 + t * 0.4);
        ctx.beginPath();
        ctx.arc(x, y, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = isSelected
          ? `rgba(231,76,60,${0.6 - t * 0.6})`
          : `rgba(56,189,248,${0.4 - t * 0.4})`;
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // Holographic orbit ring for important nodes (smooth gradient)
      if ((node.nodeType === 'processarea' || node.nodeType === 'equipment') && isHighlighted) {
        const orbitR = radius * 1.6;
        const rotAngle = (tick / 1500) * Math.PI * 2;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotAngle);
        ctx.scale(1, 0.35);
        // Outer glow ring
        ctx.beginPath();
        ctx.arc(0, 0, orbitR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
        ctx.lineWidth = 5 / globalScale;
        ctx.stroke();
        // Core ring
        ctx.beginPath();
        ctx.arc(0, 0, orbitR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.lineWidth = 0.8 / globalScale;
        ctx.stroke();
        // Orbiting dot with glow
        const dotAngle = (tick / 500) * Math.PI * 2;
        const dotX = orbitR * Math.cos(dotAngle);
        const dotY = orbitR * Math.sin(dotAngle);
        const dotGlowR = 4 / globalScale;
        const dotGrad = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, dotGlowR);
        dotGrad.addColorStop(0, 'rgba(56, 189, 248, 0.9)');
        dotGrad.addColorStop(0.4, 'rgba(56, 189, 248, 0.2)');
        dotGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotGlowR, 0, Math.PI * 2);
        ctx.fillStyle = dotGrad;
        ctx.fill();
        ctx.restore();
      }

      // --- Equipment health ring ---
      if (node.nodeType === 'equipment' && node.properties?.healthScore != null) {
        const health = Number(node.properties.healthScore);
        const hAngle = (health / 100) * Math.PI * 2;
        const ringR = radius + 3;
        ctx.beginPath();
        ctx.arc(x, y, ringR, -Math.PI / 2, -Math.PI / 2 + hAngle);
        ctx.strokeStyle = health > 70 ? '#22c55e' : health > 40 ? '#eab308' : '#ef4444';
        ctx.lineWidth = 2.5 / globalScale;
        ctx.stroke();
        // background arc
        ctx.beginPath();
        ctx.arc(x, y, ringR, -Math.PI / 2 + hAngle, -Math.PI / 2 + Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 2.5 / globalScale;
        ctx.stroke();
      }

      // --- Inner symbol (only when zoomed in) ---
      if (globalScale > 0.7) {
        const symSize = Math.max(8, radius * 0.85) / globalScale;
        ctx.font = `${symSize}px Sans-Serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(symbol, x, y);
      }

      // --- Label with pill background (only when sufficiently zoomed) ---
      if (globalScale > 1.0 || isHovered || isSelected) {
        const fontSize = 12 / globalScale;
        const labelText = label.substring(0, 20);
        ctx.font = `bold ${fontSize}px Sans-Serif`;
        const textWidth = ctx.measureText(labelText).width;
        const pillW = textWidth + 10;
        const pillH = fontSize + 6;
        const labelY = y + radius + 4;

        // pill background with refined glow border
        const px = x - pillW / 2, py = labelY - 1, pr = pillH / 2;
        ctx.beginPath();
        ctx.moveTo(px + pr, py);
        ctx.arcTo(px + pillW, py, px + pillW, py + pillH, pr);
        ctx.arcTo(px + pillW, py + pillH, px, py + pillH, pr);
        ctx.arcTo(px, py + pillH, px, py, pr);
        ctx.arcTo(px, py, px + pillW, py, pr);
        ctx.closePath();
        ctx.fillStyle = 'rgba(10, 15, 30, 0.92)';
        ctx.fill();
        ctx.strokeStyle = isHighlighted ? `${nodeColor}50` : 'rgba(56, 189, 248, 0.12)';
        ctx.lineWidth = 0.5 / globalScale;
        ctx.stroke();

        // label text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isHighlighted ? '#e2e8f0' : '#64748b';
        ctx.fillText(labelText, x, labelY + 1);

        // type badge (when zoomed in)
        if (globalScale > 1.2) {
          const badgeFontSize = 9 / globalScale;
          ctx.font = `${badgeFontSize}px Sans-Serif`;
          const badgeText = node.nodeType;
          const badgeW = ctx.measureText(badgeText).width + 6;
          const badgeH = badgeFontSize + 4;
          const badgeY = labelY + pillH + 1;

          ctx.beginPath();
          const bx = x - badgeW / 2, by = badgeY, br = badgeH / 2;
          ctx.moveTo(bx + br, by);
          ctx.arcTo(bx + badgeW, by, bx + badgeW, by + badgeH, br);
          ctx.arcTo(bx + badgeW, by + badgeH, bx, by + badgeH, br);
          ctx.arcTo(bx, by + badgeH, bx, by, br);
          ctx.arcTo(bx, by, bx + badgeW, by, br);
          ctx.closePath();
          ctx.fillStyle = `${nodeColor}30`;
          ctx.fill();

          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = nodeColor;
          ctx.fillText(badgeText, x, badgeY + 2);
        }
      }

      // Subtle ambient particles for anomaly/prediction
      if ((node.nodeType === 'anomaly' || node.nodeType === 'prediction') && isHighlighted) {
        const pColor = node.nodeType === 'anomaly' ? '239, 68, 68' : '251, 146, 60';
        for (let i = 0; i < 3; i++) {
          const phase = (tick / 1200 + i * 0.333) % 1;
          const angle = (i * Math.PI * 2 / 3) + (tick / 2500) * Math.PI * 2;
          const dist = radius * (1.4 + phase * 0.6);
          const px = x + dist * Math.cos(angle);
          const py = y + dist * Math.sin(angle);
          const alpha = (1 - phase) * 0.35;
          const pR = (2.5 - phase * 1.5) / globalScale;
          // Soft glow particle
          const pGrad = ctx.createRadialGradient(px, py, 0, px, py, pR);
          pGrad.addColorStop(0, `rgba(${pColor}, ${alpha})`);
          pGrad.addColorStop(1, `rgba(${pColor}, 0)`);
          ctx.beginPath();
          ctx.arc(px, py, pR, 0, Math.PI * 2);
          ctx.fillStyle = pGrad;
          ctx.fill();
        }
      }

      ctx.restore();
    },
    [highlightNodes, hoverNode, selectedNode, drawShapes, lightenColor, darkenColor]
  );

  // Link canvas drawing — category-differentiated
  const drawLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const sx = link.source.x;
      const sy = link.source.y;
      const tx = link.target.x;
      const ty = link.target.y;
      if (sx == null || sy == null || tx == null || ty == null) return;

      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      const linkId = `${sourceId}-${targetId}`;
      const isHighlighted = highlightLinks.size === 0 || highlightLinks.has(linkId);
      const cat = getLinkCategory(link.type || '');

      const dx = tx - sx;
      const dy = ty - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      ctx.save();

      // C1: Gradient links (source color → target color)
      const sourceType = (typeof link.source === 'object') ? link.source.nodeType : '';
      const targetType = (typeof link.target === 'object') ? link.target.nodeType : '';
      const sourceColor = NODE_COLORS[sourceType] || cat.color;
      const targetColor = NODE_COLORS[targetType] || cat.color;

      let lineColor: string | CanvasGradient;
      if (isHighlighted && sourceColor !== targetColor) {
        const grad = ctx.createLinearGradient(sx, sy, tx, ty);
        grad.addColorStop(0, sourceColor);
        grad.addColorStop(1, targetColor);
        lineColor = grad;
      } else {
        lineColor = isHighlighted ? cat.color : `${cat.color}50`;
      }

      // Subtle width modulation
      const t = animTickRef.current;
      const widthPulse = 1 + 0.04 * Math.sin(t / 500);
      const lineW = (isHighlighted ? cat.width * widthPulse : cat.width * 0.5) / Math.max(globalScale * 0.5, 0.5);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineW;

      // Apply dash pattern based on category style
      const dashOffset = -(t % 1000) / 10;

      if (cat.style === 'dotted') {
        ctx.setLineDash([3, 4]);
        ctx.lineDashOffset = dashOffset;
      } else if (cat.style === 'dashed') {
        ctx.setLineDash([6, 5]);
        ctx.lineDashOffset = dashOffset;
      } else if (cat.style === 'dashdot') {
        ctx.setLineDash([8, 4, 2, 4]);
        ctx.lineDashOffset = dashOffset;
      } else if (cat.style === 'pulse') {
        ctx.setLineDash([7, 4]);
        const pulse = 0.5 + 0.5 * Math.sin(t / 120);
        ctx.strokeStyle = isHighlighted
          ? `rgba(239,68,68,${0.4 + pulse * 0.6})`
          : `rgba(239,68,68,${0.15 + pulse * 0.25})`;
      } else {
        ctx.setLineDash([]);
      }

      // All links get subtle curvature; physical links get more
      const curveFactor = (cat.style === 'solid' && cat.width > 2) ? 8 : 2.5;
      const mx = (sx + tx) / 2;
      const my = (sy + ty) / 2;
      const perpX = -dy / dist * curveFactor;
      const perpY = dx / dist * curveFactor;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(mx + perpX, my + perpY, tx, ty);
      ctx.stroke();

      // Double-line for meta links
      if (cat.style === 'dashdot' && isHighlighted) {
        ctx.beginPath();
        const offset = 2 / globalScale;
        const nx = -dy / dist * offset;
        const ny = dx / dist * offset;
        ctx.moveTo(sx + nx, sy + ny);
        ctx.lineTo(tx + nx, ty + ny);
        ctx.stroke();
      }

      ctx.setLineDash([]);

      // Refined electric arc for status/anomaly links
      if (cat.style === 'pulse' && isHighlighted) {
        const segments = Math.max(8, Math.floor(dist / 15));
        const arcAmp = 2 / globalScale;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        for (let i = 1; i < segments; i++) {
          const frac = i / segments;
          const baseX = sx + dx * frac;
          const baseY = sy + dy * frac;
          const envelope = Math.sin(frac * Math.PI); // peaks at center
          const noise = Math.sin(frac * 25 + t / 60) * arcAmp * envelope;
          const npx = -dy / dist;
          const npy = dx / dist;
          ctx.lineTo(baseX + npx * noise, baseY + npy * noise);
        }
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.18)';
        ctx.lineWidth = 0.7 / globalScale;
        ctx.stroke();
      }

      // Clean energy flow particles (glow + core, no trail clutter)
      if (isHighlighted) {
        const particleCount = (cat.style === 'solid' && cat.width > 2) ? 3 : 2;
        for (let i = 0; i < particleCount; i++) {
          const phase = ((t / 900 + i / particleCount) % 1);
          // Follow the curve path
          const curvePx = sx + dx * phase + perpX * 4 * phase * (1 - phase);
          const curvePy = sy + dy * phase + perpY * 4 * phase * (1 - phase);

          // Soft glow
          const glowR = 4 / globalScale;
          const glowGrad = ctx.createRadialGradient(curvePx, curvePy, 0, curvePx, curvePy, glowR);
          glowGrad.addColorStop(0, `${cat.color}cc`);
          glowGrad.addColorStop(0.5, `${cat.color}30`);
          glowGrad.addColorStop(1, `${cat.color}00`);
          ctx.beginPath();
          ctx.arc(curvePx, curvePy, glowR, 0, Math.PI * 2);
          ctx.fillStyle = glowGrad;
          ctx.fill();

          // Bright core dot
          ctx.beginPath();
          ctx.arc(curvePx, curvePy, 1.2 / globalScale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.fill();
        }
      }

      // --- Sleek arrowhead ---
      const arrowPos = 0.78;
      const arrowX = sx + dx * arrowPos;
      const arrowY = sy + dy * arrowPos;
      const arrowLen = isHighlighted ? 5.5 : 3.5;
      const arrowW = isHighlighted ? 2.8 : 2;

      ctx.fillStyle = typeof lineColor === 'string' ? lineColor : cat.color;
      ctx.beginPath();
      ctx.moveTo(arrowX + arrowLen * Math.cos(angle), arrowY + arrowLen * Math.sin(angle));
      ctx.lineTo(arrowX + arrowW * Math.cos(angle + Math.PI / 2), arrowY + arrowW * Math.sin(angle + Math.PI / 2));
      ctx.lineTo(arrowX - arrowLen * 0.25 * Math.cos(angle), arrowY - arrowLen * 0.25 * Math.sin(angle));
      ctx.lineTo(arrowX + arrowW * Math.cos(angle - Math.PI / 2), arrowY + arrowW * Math.sin(angle - Math.PI / 2));
      ctx.closePath();
      ctx.fill();

      // --- Link label (dark theme, only when zoomed in) ---
      if (isHighlighted && globalScale > 1.2) {
        const midX = (sx + tx) / 2;
        const midY = (sy + ty) / 2;
        const fontSize = 10 / globalScale;
        ctx.font = `${fontSize}px Sans-Serif`;
        const textWidth = ctx.measureText(link.type).width;
        const lw = textWidth + 8;
        const lh = fontSize + 4;

        // Refined pill background
        const lpx = midX - lw / 2, lpy = midY - lh / 2, lpr = lh / 2;
        ctx.beginPath();
        ctx.moveTo(lpx + lpr, lpy);
        ctx.arcTo(lpx + lw, lpy, lpx + lw, lpy + lh, lpr);
        ctx.arcTo(lpx + lw, lpy + lh, lpx, lpy + lh, lpr);
        ctx.arcTo(lpx, lpy + lh, lpx, lpy, lpr);
        ctx.arcTo(lpx, lpy, lpx + lw, lpy, lpr);
        ctx.closePath();
        ctx.fillStyle = 'rgba(10, 15, 30, 0.92)';
        ctx.fill();
        ctx.strokeStyle = `${cat.color}30`;
        ctx.lineWidth = 0.5 / globalScale;
        ctx.stroke();

        ctx.fillStyle = cat.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(link.type, midX, midY);
      }

      ctx.restore();
    },
    [highlightLinks]
  );

  // Background grid + scanline (onRenderFramePre)
  const drawBackgroundGrid = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (globalScale < 0.3) return;
      const t = animTickRef.current;
      const gridSpacing = 50;
      const dotRadius = 0.8 / globalScale;

      const canvas = ctx.canvas;
      const transform = ctx.getTransform();
      const invScale = 1 / transform.a;
      const left = -transform.e * invScale;
      const top = -transform.f * invScale;
      const right = left + canvas.width * invScale;
      const bottom = top + canvas.height * invScale;

      const startX = Math.floor(left / gridSpacing) * gridSpacing;
      const startY = Math.floor(top / gridSpacing) * gridSpacing;

      const breathe = 0.03 + 0.015 * Math.sin(t / 800);
      ctx.fillStyle = `rgba(56, 189, 248, ${breathe})`;

      for (let gx = startX; gx < right; gx += gridSpacing) {
        for (let gy = startY; gy < bottom; gy += gridSpacing) {
          ctx.beginPath();
          ctx.arc(gx, gy, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Scan line effect
      const scanY = startY + ((t / 20) % (bottom - top));
      const scanGrad = ctx.createLinearGradient(left, scanY - 30, left, scanY + 30);
      scanGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      scanGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.04)');
      scanGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(left, scanY - 30, right - left, 60);
    },
    []
  );

  // Ambient glow under node clusters (onRenderFramePost)
  const drawAmbientGlow = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (globalScale < 0.2 || globalScale > 3) return;

      const clusters: Record<string, { x: number; y: number; count: number; color: string }> = {};
      for (const node of graphData.nodes) {
        if (node.x == null || node.y == null) continue;
        const nt = node.nodeType || 'other';
        if (!clusters[nt]) {
          clusters[nt] = { x: 0, y: 0, count: 0, color: NODE_COLORS[nt] || '#95a5a6' };
        }
        clusters[nt].x += node.x;
        clusters[nt].y += node.y;
        clusters[nt].count++;
      }

      for (const cluster of Object.values(clusters)) {
        if (cluster.count < 2) continue;
        cluster.x /= cluster.count;
        cluster.y /= cluster.count;
        const glowR = Math.sqrt(cluster.count) * 40;
        const grad = ctx.createRadialGradient(cluster.x, cluster.y, 0, cluster.x, cluster.y, glowR);
        grad.addColorStop(0, `${cluster.color}0c`);
        grad.addColorStop(0.6, `${cluster.color}05`);
        grad.addColorStop(1, `${cluster.color}00`);
        ctx.beginPath();
        ctx.arc(cluster.x, cluster.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
    },
    [graphData.nodes]
  );

  // Zoom controls
  const handleZoomIn = () => graphRef.current?.zoom(graphRef.current.zoom() * 1.5, 300);
  const handleZoomOut = () => graphRef.current?.zoom(graphRef.current.zoom() / 1.5, 300);
  const handleZoomReset = () => {
    graphRef.current?.zoomToFit(400, 60);
    handleBackgroundClick();
  };

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      setTimeout(() => graphRef.current?.zoomToFit(400, 80), 100);
      return !prev;
    });
  }, []);

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        setTimeout(() => graphRef.current?.zoomToFit(400, 80), 100);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Center viewport on graph's dense core without changing zoom level.
  // Uses centerAt only — avoids zoomToFit which recalculates zoom and shrinks nodes.
  const zoomToDenseCore = useCallback((duration: number = 400) => {
    const fg = graphRef.current;
    if (!fg) return;

    const positioned = graphData.nodes.filter((n: any) => n.x != null && n.y != null);
    if (positioned.length === 0) return;

    // Compute median position (robust density center)
    const xs = positioned.map((n: any) => n.x as number).sort((a, b) => a - b);
    const ys = positioned.map((n: any) => n.y as number).sort((a, b) => a - b);
    const medX = xs[Math.floor(xs.length / 2)];
    const medY = ys[Math.floor(ys.length / 2)];

    // Center on the dense core without changing zoom
    fg.centerAt(medX, medY, duration);
  }, [graphData.nodes]);

  // Fallback zoom-to-fit if onEngineStop doesn't fire in time
  useEffect(() => {
    if (graphData.nodes.length > 0 && graphRef.current && !initialFitDone.current) {
      const timer = setTimeout(() => {
        if (!initialFitDone.current) {
          zoomToDenseCore(400);
          initialFitDone.current = true;
        }
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [graphData.nodes.length, zoomToDenseCore]);

  // Force configuration — spacing, clustering, centering
  useEffect(() => {
    if (!graphRef.current) return;
    const fg = graphRef.current;

    // Link distance — spread nodes much further apart (default is ~30)
    try { fg.d3Force('link')?.distance(150); } catch { /* ignore */ }

    // Charge repulsion — much stronger to push nodes apart
    try {
      fg.d3Force('charge')?.strength((node: any) => {
        const size = NODE_HIERARCHY_SIZE[node.nodeType] || 8;
        return -250 * (size / 8);
      });
    } catch { /* ignore */ }

    // Custom cluster force: nudge nodes toward type-based cluster centers
    const clusterNodes = graphData.nodes;
    fg.d3Force('cluster', (alpha: number) => {
      const strength = 0.04 * alpha;
      const centroids: Record<string, { x: number; y: number; count: number }> = {};
      for (const n of clusterNodes) {
        if (n.x == null || n.y == null) continue;
        const t = n.nodeType || 'other';
        if (!centroids[t]) centroids[t] = { x: 0, y: 0, count: 0 };
        centroids[t].x += n.x;
        centroids[t].y += n.y;
        centroids[t].count++;
      }
      for (const t of Object.keys(centroids)) {
        centroids[t].x /= centroids[t].count;
        centroids[t].y /= centroids[t].count;
      }
      for (const n of clusterNodes) {
        if (n.x == null || n.y == null) continue;
        const t = n.nodeType || 'other';
        const c = centroids[t];
        if (!c) continue;
        n.vx = (n.vx || 0) + (c.x - n.x) * strength;
        n.vy = (n.vy || 0) + (c.y - n.y) * strength;
      }
    });

    // Reset so that onEngineStop re-centers after forces reposition nodes
    initialFitDone.current = false;
    fg.d3ReheatSimulation();
  }, [graphData.nodes]);

  // Render hierarchy tree
  const renderHierarchyTree = (nodes: HierarchyNode[], level: number = 0): JSX.Element[] => {
    return nodes.map((node) => (
      <div key={node.name} style={{ marginLeft: level * 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px',
            cursor: 'pointer',
            borderRadius: '6px',
            backgroundColor: expandedNodes.has(node.name) ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
          }}
          onClick={() => toggleHierarchyNode(node.name)}
        >
          {node.children && node.children.length > 0 && (
            <span style={{ marginRight: '4px', fontFamily: 'monospace', color: '#38bdf8' }}>
              {expandedNodes.has(node.name) ? '[-]' : '[+]'}
            </span>
          )}
          <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{node.name}</span>
          <span style={{ marginLeft: '8px', color: '#94a3b8', fontSize: '0.75rem' }}>
            ({node.count})
          </span>
        </div>
        {expandedNodes.has(node.name) && node.children && renderHierarchyTree(node.children, level + 1)}
      </div>
    ));
  };

  // Export handler
  const handleExport = async (format: 'json' | 'cypher') => {
    try {
      const res = await ontologyApi.exportOntology(format);
      if (res.status === 'success') {
        const data = JSON.stringify(res.data, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ontology_export.${format === 'json' ? 'json' : 'cypher'}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  // Fetch reasoning data
  const fetchReasoningData = useCallback(async () => {
    try {
      const [rulesRes, statsRes, inferredRes] = await Promise.all([
        reasoningApi.getRules(),
        reasoningApi.getStats(),
        reasoningApi.getInferred(100),
      ]);

      if (rulesRes.status === 'success' && rulesRes.data) {
        setInferenceRules(rulesRes.data);
      }
      if (statsRes.status === 'success' && statsRes.data) {
        setReasoningStats(statsRes.data);
      }
      if (inferredRes.status === 'success' && inferredRes.data) {
        setInferredFacts(inferredRes.data);
      }
    } catch (err) {
      console.error('Failed to fetch reasoning data:', err);
    }
  }, []);

  // Load reasoning data when tab is active
  useEffect(() => {
    if (activeTab === 'main') {
      fetchReasoningData();
    }
  }, [activeTab, fetchReasoningData]);

  // Run all inference rules
  const handleRunAllRules = async () => {
    setIsRunningReasoning(true);
    setReasoningMessage(null);
    setRunAllResult(null);

    try {
      const res = await reasoningApi.runAll();
      if (res.status === 'success' && res.data) {
        setRunAllResult(res.data);
        const successCount = res.data.results?.filter((r: any) => r.status === 'success' && r.count > 0).length || 0;
        const totalRules = res.data.results?.length || 0;
        // Refresh stats first so we can reference the latest counts
        await fetchReasoningData();
        const existingTotal = (reasoningStats?.totalInferredNodes || 0) + (reasoningStats?.totalInferredRelationships || 0);
        if (res.data.totalInferred > 0) {
          setReasoningMessage(`전체 ${totalRules}개 규칙 중 ${successCount}개 규칙에서 총 ${res.data.totalInferred}건의 새로운 지식을 추론했습니다.`);
        } else if (existingTotal > 0) {
          setReasoningMessage(`전체 ${totalRules}개 규칙을 실행했습니다. 새로운 추론은 없으며, 기존 추론 결과 ${existingTotal}건이 유지되고 있습니다.`);
        } else {
          setReasoningMessage(`전체 ${totalRules}개 규칙을 실행했으나 현재 조건에 부합하는 데이터가 없습니다.`);
        }
      }
    } catch (err) {
      console.error('Run all rules error:', err);
      setReasoningMessage('Failed to run inference rules');
    } finally {
      setIsRunningReasoning(false);
    }
  };

  // Clear all inferred facts
  const handleClearInferred = async () => {
    if (!window.confirm('Are you sure you want to clear all inferred facts?')) {
      return;
    }

    setIsRunningReasoning(true);
    setReasoningMessage(null);

    try {
      const res = await reasoningApi.clearInferred();
      if (res.status === 'success' && res.data) {
        setReasoningMessage(res.data.message);
        setInferredFacts(null);
        fetchReasoningData(); // Refresh stats
      }
    } catch (err) {
      console.error('Clear inferred error:', err);
      setReasoningMessage('Failed to clear inferred facts');
    } finally {
      setIsRunningReasoning(false);
    }
  };

  // Run rule with trace - 추론 과정 추적 실행
  const handleRunWithTrace = async (ruleId: string) => {
    setIsLoadingTrace(true);
    setReasoningTrace(null);
    setExpandedSteps(new Set());

    try {
      const res = await reasoningApi.runRuleWithTrace(ruleId);
      if (res.status === 'success' && res.data) {
        setReasoningTrace(res.data);
        setShowTraceModal(true);
        fetchReasoningData(); // Refresh stats
      }
    } catch (err) {
      console.error('Run with trace error:', err);
      setReasoningMessage('추론 과정 추적 실패');
    } finally {
      setIsLoadingTrace(false);
    }
  };

  // Toggle step expansion
  const toggleStepExpansion = (stepNumber: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNumber)) {
        next.delete(stepNumber);
      } else {
        next.add(stepNumber);
      }
      return next;
    });
  };

  // Fetch test data scenarios and status
  const fetchTestDataStatus = useCallback(async () => {
    try {
      const [scenariosRes, statusRes] = await Promise.all([
        testDataApi.getScenarios(),
        testDataApi.getStatus(),
      ]);

      if (scenariosRes.status === 'success' && scenariosRes.data) {
        setTestScenarios(scenariosRes.data);
      }
      if (statusRes.status === 'success' && statusRes.data) {
        setTestDataStatus(statusRes.data);
      }
    } catch (err) {
      console.error('Failed to fetch test data status:', err);
    }
  }, []);

  // Load test data when reasoning tab is active
  useEffect(() => {
    if (activeTab === 'main') {
      fetchTestDataStatus();
    }
  }, [activeTab, fetchTestDataStatus]);

  // Load all test scenarios
  const handleLoadAllTestData = async () => {
    setIsLoadingTestData(true);
    setTestDataMessage(null);

    try {
      const res = await testDataApi.loadAll();
      if (res.status === 'success' && res.data) {
        setTestDataMessage(`테스트 데이터 로드 완료: ${res.data.results.length}개 시나리오`);
        fetchTestDataStatus();
        fetchReasoningData();
      }
    } catch (err) {
      console.error('Load test data error:', err);
      setTestDataMessage('테스트 데이터 로드 실패');
    } finally {
      setIsLoadingTestData(false);
    }
  };

  // Load specific scenario
  const handleLoadScenario = async (scenarioId: string) => {
    setIsLoadingTestData(true);
    setTestDataMessage(null);

    try {
      const res = await testDataApi.loadScenario(scenarioId);
      if (res.status === 'success' && res.data) {
        setTestDataMessage(`${res.data.name} 로드 완료`);
        fetchTestDataStatus();
        fetchReasoningData();
      }
    } catch (err) {
      console.error('Load scenario error:', err);
      setTestDataMessage('시나리오 로드 실패');
    } finally {
      setIsLoadingTestData(false);
    }
  };

  // Reset test data to original state
  const handleResetTestData = async () => {
    if (!window.confirm('테스트 데이터를 초기화하시겠습니까? 이 작업은 모든 테스트 데이터를 원래 상태로 복원합니다.')) {
      return;
    }

    setIsLoadingTestData(true);
    setTestDataMessage(null);

    try {
      const res = await testDataApi.reset();
      if (res.status === 'success') {
        setTestDataMessage('테스트 데이터가 초기화되었습니다');
        fetchTestDataStatus();
        fetchReasoningData();
      }
    } catch (err) {
      console.error('Reset test data error:', err);
      setTestDataMessage('테스트 데이터 초기화 실패');
    } finally {
      setIsLoadingTestData(false);
    }
  };

  // Clear only inferred data
  const handleClearTestInferred = async () => {
    if (!window.confirm('추론 결과만 삭제하시겠습니까?')) {
      return;
    }

    setIsLoadingTestData(true);
    setTestDataMessage(null);

    try {
      const res = await testDataApi.clearInferred();
      if (res.status === 'success' && res.data) {
        setTestDataMessage(`추론 결과 삭제: 노드 ${res.data.deletedNodes}개, 관계 ${res.data.deletedRelationships}개`);
        fetchTestDataStatus();
        fetchReasoningData();
      }
    } catch (err) {
      console.error('Clear inferred error:', err);
      setTestDataMessage('추론 결과 삭제 실패');
    } finally {
      setIsLoadingTestData(false);
    }
  };

  // Get scenario status indicator
  const getScenarioStatus = (scenarioId: string): boolean => {
    return testDataStatus?.scenarios?.find(s => s.id === scenarioId)?.loaded ?? false;
  };

  // Get step type icon and color
  const getStepTypeStyle = (type: string) => {
    switch (type) {
      case 'MATCH':
        return { icon: '🔍', color: '#38bdf8', bgColor: 'rgba(56, 189, 248, 0.1)' };
      case 'FILTER':
        return { icon: '🔎', color: '#a78bfa', bgColor: 'rgba(167, 139, 250, 0.1)' };
      case 'CHECK':
        return { icon: '✓', color: '#34d399', bgColor: 'rgba(52, 211, 153, 0.1)' };
      case 'INFERENCE':
        return { icon: '💡', color: '#fb923c', bgColor: 'rgba(251, 146, 60, 0.1)' };
      case 'RESULT':
        return { icon: '📊', color: '#94a3b8', bgColor: 'rgba(148, 163, 184, 0.1)' };
      default:
        return { icon: '•', color: '#94a3b8', bgColor: 'rgba(148, 163, 184, 0.1)' };
    }
  };

  // Get result badge style
  const getResultBadgeStyle = (result: string) => {
    switch (result) {
      case 'SUCCESS':
        return { color: '#68d391', bgColor: 'rgba(72, 187, 120, 0.2)', text: '성공' };
      case 'NO_MATCH':
        return { color: '#f6e05e', bgColor: 'rgba(246, 224, 94, 0.2)', text: '매칭 없음' };
      case 'ERROR':
        return { color: '#fc8181', bgColor: 'rgba(252, 129, 129, 0.2)', text: '오류' };
      default:
        return { color: '#94a3b8', bgColor: 'rgba(148, 163, 184, 0.15)', text: '진행 중' };
    }
  };

  // Get category color for rules
  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      '유지보수': '#e67e22',
      '이상탐지': '#e74c3c',
      '예측': '#9b59b6',
      '구조': '#3498db',
      '분석': '#2ecc71',
      '공리': '#6b7280',
      // English fallbacks
      maintenance: '#e67e22',
      anomaly: '#e74c3c',
      prediction: '#9b59b6',
      structure: '#3498db',
      analysis: '#2ecc71',
      axiom: '#6b7280',
    };
    return colors[category] || '#95a5a6';
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
    <div className="ontology-page" style={{ padding: 0 }}>
      {/* === COMMAND BAR === */}
      {!isFullscreen && (
        <div className="oe-command-bar">
          <div className="oe-title">Ontology Explorer</div>

          {/* Search */}
          <div style={{ position: 'relative', flex: '0 1 280px' }}>
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch(e.target.value);
              }}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px',
                fontSize: '0.8rem',
                backgroundColor: 'rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                outline: 'none',
              }}
            />
            {isSearching && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, padding: '0.5rem', color: '#94a3b8', fontSize: '0.8rem', backgroundColor: '#1e293b', borderRadius: '0 0 6px 6px', zIndex: 201 }}>
                Searching...
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="oe-search-results">
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="oe-search-result-item"
                    onClick={() => handleSearchResultClick(result)}
                  >
                    <div style={{ fontWeight: 500 }}>{result.name}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>
                      {result.labels.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="oe-tabs">
            <button className={`oe-tab ${activeTab === 'main' ? 'active' : ''}`} onClick={() => setActiveTab('main')}>
              지식 그래프 &amp; 추론
            </button>
            <button className={`oe-tab ${activeTab === 'axioms' ? 'active' : ''}`} onClick={() => setActiveTab('axioms')}>
              공리 &amp; 제약조건
            </button>
            <button className={`oe-tab ${activeTab === 'query' ? 'active' : ''}`} onClick={() => setActiveTab('query')}>
              Cypher Query
            </button>
            <button className={`oe-tab ${activeTab === 'hierarchy' ? 'active' : ''}`} onClick={() => setActiveTab('hierarchy')}>
              Class Hierarchy
            </button>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
            <button
              onClick={() => handleExport('json')}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.15)',
                backgroundColor: 'rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Export JSON
            </button>
            <button
              onClick={() => handleExport('cypher')}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.15)',
                backgroundColor: 'rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Export Cypher
            </button>
          </div>
        </div>
      )}

      {/* === STATS RIBBON === */}
      {!isFullscreen && (
        <div className="oe-stats-ribbon">
          <div className="oe-stat-item">
            <span className="oe-stat-icon">{'\u25C8'}</span>
            <span className="oe-stat-value">{classes.length}</span>
            <span className="oe-stat-label">Types</span>
          </div>
          <div className="oe-stat-item">
            <span className="oe-stat-icon">{'\u25CE'}</span>
            <span className="oe-stat-value">{graphData.nodes.length}</span>
            <span className="oe-stat-label">Nodes</span>
          </div>
          <div className="oe-stat-item">
            <span className="oe-stat-icon">{'\u2192'}</span>
            <span className="oe-stat-value">{graphData.links.length}</span>
            <span className="oe-stat-label">Rels</span>
          </div>
          <div className="oe-stat-item">
            <span className="oe-stat-icon">{'\u2194'}</span>
            <span className="oe-stat-value">{relationshipTypes.length}</span>
            <span className="oe-stat-label">Rel Types</span>
          </div>
        </div>
      )}

      {/* === GRAPH SECTION (Always Visible, Full Width) === */}
      <div className="oe-graph-section" style={isFullscreen ? { position: 'fixed', inset: 0, zIndex: 9999 } : {}}>
        <div
          className="oe-graph-container"
          ref={graphContainerRef}
          style={isFullscreen ? { height: '100vh' } : {}}
        >
          {/* Filter Toggle Button */}
          {!showFilters && (
            <button
              className="oe-filter-toggle"
              onClick={() => setShowFilters(true)}
            >
              {'\u2630'} Filters
            </button>
          )}

          {/* Floating Filter Panel */}
          <div className={`oe-filter-panel ${!showFilters ? 'collapsed' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem' }}>Filters</span>
              <button
                onClick={() => setShowFilters(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.1rem', padding: '2px 6px' }}
              >
                {'\u2715'}
              </button>
            </div>

            {/* Node Type Filters */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Node Types</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {Object.entries(NODE_TYPE_GROUPS).map(([groupKey, group]) => (
                  <div key={groupKey}>
                    <div style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: groupKey === 'axiomConstraint' ? '#a78bfa' : '#cbd5e1',
                      marginBottom: '0.25rem',
                    }}>
                      {group.label}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', paddingLeft: '0.5rem', borderLeft: `2px solid ${groupKey === 'axiomConstraint' ? '#7c3aed' : 'rgba(255,255,255,0.1)'}` }}>
                      {group.types.filter(type => NODE_COLORS[type]).map((type) => (
                        <label
                          key={type}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: '#e2e8f0', fontSize: '0.8rem' }}
                        >
                          <input
                            type="checkbox"
                            checked={visibleNodeTypes.has(type)}
                            onChange={() => toggleNodeType(type)}
                            style={{ accentColor: NODE_COLORS[type] }}
                          />
                          <div
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: '3px',
                              backgroundColor: NODE_COLORS[type],
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '9px',
                              color: '#fff',
                            }}
                          >
                            {NODE_SYMBOLS[type] || ''}
                          </div>
                          <span style={{ textTransform: 'capitalize' }}>{type}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Relationship Type Filters */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Relationships</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflow: 'auto' }}>
                {(() => {
                  const generalRels = relationshipTypes.filter(
                    ({ type }) => !AXIOM_CONSTRAINT_REL_PATTERNS.some(pattern => type.toUpperCase().includes(pattern))
                  );
                  const axiomRels = relationshipTypes.filter(
                    ({ type }) => AXIOM_CONSTRAINT_REL_PATTERNS.some(pattern => type.toUpperCase().includes(pattern))
                  );
                  return (
                    <>
                      {generalRels.length > 0 && (
                        <div>
                          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>일반 데이터</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', paddingLeft: '0.5rem', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                            {generalRels.map(({ type, count }) => (
                              <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: '#e2e8f0', fontSize: '0.8rem' }}>
                                <input type="checkbox" checked={visibleRelTypes.has(type)} onChange={() => toggleRelType(type)} />
                                <span>{type}</span>
                                <span style={{ color: '#64748b', fontSize: '0.7rem' }}>({count})</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {axiomRels.length > 0 && (
                        <div>
                          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#a78bfa', marginBottom: '0.25rem' }}>공리/제약조건</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', paddingLeft: '0.5rem', borderLeft: '2px solid #7c3aed' }}>
                            {axiomRels.map(({ type, count }) => (
                              <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: '#e2e8f0', fontSize: '0.8rem' }}>
                                <input type="checkbox" checked={visibleRelTypes.has(type)} onChange={() => toggleRelType(type)} />
                                <span>{type}</span>
                                <span style={{ color: '#64748b', fontSize: '0.7rem' }}>({count})</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Path Finding */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Path Finding</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.375rem' }}>Click nodes to set source/target</div>
              <input
                type="text"
                placeholder="Source Node ID"
                value={pathSource}
                onChange={(e) => setPathSource(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.375rem 0.5rem',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  marginBottom: '0.375rem',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  color: '#e2e8f0',
                  outline: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Target Node ID"
                value={pathTarget}
                onChange={(e) => setPathTarget(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.375rem 0.5rem',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  marginBottom: '0.375rem',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  color: '#e2e8f0',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleFindPath}
                disabled={isFindingPath || !pathSource || !pathTarget}
                style={{
                  width: '100%',
                  padding: '0.4rem',
                  borderRadius: '4px',
                  border: '1px solid #38bdf8',
                  backgroundColor: 'rgba(56,189,248,0.15)',
                  color: '#38bdf8',
                  fontSize: '0.75rem',
                  cursor: isFindingPath || !pathSource || !pathTarget ? 'not-allowed' : 'pointer',
                  opacity: isFindingPath || !pathSource || !pathTarget ? 0.5 : 1,
                }}
              >
                {isFindingPath ? 'Finding...' : 'Find Path'}
              </button>
              {pathResult && (
                <div style={{ marginTop: '0.375rem', fontSize: '0.7rem', color: '#4ade80' }}>
                  Path found: {pathResult.length} hops
                </div>
              )}
              {pathResult === null && pathSource && pathTarget && !isFindingPath && (
                <div style={{ marginTop: '0.375rem', fontSize: '0.7rem', color: '#f87171' }}>
                  No path found
                </div>
              )}
            </div>

            {/* Fullscreen toggle */}
            <button
              onClick={toggleFullscreen}
              style={{
                width: '100%',
                padding: '0.4rem',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.15)',
                backgroundColor: 'rgba(255,255,255,0.06)',
                color: '#e2e8f0',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
          </div>

          {/* Force Graph */}
          {graphData.nodes.length > 0 ? (
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              nodeId="id"
              width={graphDimensions.width || undefined}
              height={graphDimensions.height || undefined}
              nodeCanvasObject={drawNode}
              nodePointerAreaPaint={(node: any, color, ctx) => {
                const r = (NODE_HIERARCHY_SIZE[node.nodeType] || 8) + 4;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI);
                ctx.fill();
              }}
              linkCanvasObject={drawLink}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              onBackgroundClick={handleBackgroundClick}
              onLinkClick={handleLinkClick}
              onNodeDragEnd={(node) => {
                node.fx = node.x;
                node.fy = node.y;
              }}
              cooldownTicks={200}
              d3AlphaDecay={0.015}
              d3VelocityDecay={0.25}
              warmupTicks={80}
              enableNodeDrag={true}
              enableZoomInteraction={true}
              enablePanInteraction={true}
              backgroundColor="#0f172a"
              onRenderFramePre={drawBackgroundGrid}
              onRenderFramePost={drawAmbientGlow}
              onEngineStop={() => {
                if (!initialFitDone.current) {
                  // Center dense region on first simulation settle
                  zoomToDenseCore(400);
                  initialFitDone.current = true;
                }
              }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontSize: '0.9rem' }}>
              No graph data available (check filters)
            </div>
          )}

          {/* Zoom Controls */}
          <div className="oe-zoom-controls">
            <button className="oe-zoom-btn" onClick={handleZoomIn} title="Zoom In">+</button>
            <button className="oe-zoom-btn" onClick={handleZoomOut} title="Zoom Out">{'\u2212'}</button>
            <button className="oe-zoom-btn" onClick={handleZoomReset} title="Fit to View">{'\u229E'}</button>
            {isFullscreen && (
              <button
                className="oe-zoom-btn"
                onClick={toggleFullscreen}
                title="Exit Fullscreen"
                style={{ backgroundColor: 'rgba(239,68,68,0.8)', marginTop: '0.25rem' }}
              >
                {'\u2715'}
              </button>
            )}
          </div>

          {/* Node Details Popup */}
          {popupPosition && nodeDetails && (
            <div
              ref={popupRef}
              className="oe-node-popup"
              style={{ left: popupPosition.x, top: popupPosition.y }}
            >
              <div className="oe-node-popup-header" onMouseDown={handlePopupDragStart}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f1f5f9' }}>{nodeDetails.name}</div>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    {nodeDetails.labels.map((label) => (
                      <span
                        key={label}
                        style={{
                          padding: '1px 6px',
                          borderRadius: '3px',
                          backgroundColor: 'rgba(56,189,248,0.2)',
                          color: '#38bdf8',
                          fontSize: '0.65rem',
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => { setPopupPosition(null); setNodeDetails(null); }}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem', padding: '2px 6px' }}
                >
                  {'\u2715'}
                </button>
              </div>
              <div className="oe-node-popup-body">
                {/* Properties */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Properties</div>
                  <div style={{ maxHeight: '120px', overflow: 'auto', padding: '0.375rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                    {Object.entries(nodeDetails.properties).map(([key, value]) => (
                      <div key={key} style={{ marginBottom: '0.2rem', fontSize: '0.75rem' }}>
                        <span style={{ color: '#64748b' }}>{key}:</span>{' '}
                        <span style={{ color: '#e2e8f0' }}>{String(value).substring(0, 50)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Outgoing */}
                {nodeDetails.outgoing.length > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Outgoing ({nodeDetails.outgoing.length})</div>
                    <div style={{ maxHeight: '80px', overflow: 'auto' }}>
                      {nodeDetails.outgoing.map((rel, i) => (
                        <div key={i} style={{ fontSize: '0.75rem', padding: '0.15rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <span style={{ color: '#38bdf8' }}>{rel.type}</span>
                          <span style={{ color: '#64748b' }}> {'\u2192'} </span>
                          <span style={{ color: '#e2e8f0' }}>{rel.targetName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Incoming */}
                {nodeDetails.incoming.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Incoming ({nodeDetails.incoming.length})</div>
                    <div style={{ maxHeight: '80px', overflow: 'auto' }}>
                      {nodeDetails.incoming.map((rel, i) => (
                        <div key={i} style={{ fontSize: '0.75rem', padding: '0.15rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <span style={{ color: '#e2e8f0' }}>{rel.sourceName}</span>
                          <span style={{ color: '#64748b' }}> {'\u2192'} </span>
                          <span style={{ color: '#38bdf8' }}>{rel.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Edge Details Popup */}
          {popupPosition && selectedEdge && !nodeDetails && (
            <div
              ref={popupRef}
              className="oe-node-popup"
              style={{ left: popupPosition.x, top: popupPosition.y }}
            >
              <div className="oe-node-popup-header" onMouseDown={handlePopupDragStart}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f1f5f9' }}>Relationship</div>
                  <span style={{
                    display: 'inline-block',
                    padding: '1px 8px',
                    borderRadius: '3px',
                    backgroundColor: 'rgba(251,146,60,0.2)',
                    color: '#fb923c',
                    fontSize: '0.7rem',
                    marginTop: '0.25rem',
                  }}>
                    {selectedEdge.type || selectedEdge.label || 'RELATED'}
                  </span>
                </div>
                <button
                  onClick={() => { setPopupPosition(null); setSelectedEdge(null); }}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem', padding: '2px 6px' }}
                >
                  {'\u2715'}
                </button>
              </div>
              <div className="oe-node-popup-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>
                    {typeof selectedEdge.source === 'object' ? selectedEdge.source.name || selectedEdge.source.id : selectedEdge.source}
                  </span>
                  <span style={{ color: '#fb923c' }}>{'\u2192'}</span>
                  <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>
                    {typeof selectedEdge.target === 'object' ? selectedEdge.target.name || selectedEdge.target.id : selectedEdge.target}
                  </span>
                </div>
                {selectedEdge.properties && Object.keys(selectedEdge.properties).length > 0 && (
                  <div style={{ padding: '0.375rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                    {Object.entries(selectedEdge.properties).map(([key, value]) => (
                      <div key={key} style={{ marginBottom: '0.2rem', fontSize: '0.75rem' }}>
                        <span style={{ color: '#64748b' }}>{key}:</span>{' '}
                        <span style={{ color: '#e2e8f0' }}>{String(value).substring(0, 50)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === TAB CONTENT (Below Graph) === */}
      <div className="oe-tab-content">
        {/* Main Tab - Reasoning Engine Only */}
        {activeTab === 'main' && (
          <div>
            {/* Section Divider */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{ fontSize: '1.5rem' }}>🧠</span> 추론 엔진
              </h2>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(56, 189, 248, 0.2)' }} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleRunAllRules}
                  disabled={isRunningReasoning}
                  style={{ fontSize: '0.875rem' }}
                >
                  {isRunningReasoning ? '실행 중...' : '전체 추론 실행'}
                </button>
                <button
                  className="btn"
                  onClick={handleClearInferred}
                  disabled={isRunningReasoning}
                  style={{ backgroundColor: '#e53e3e', color: 'white', fontSize: '0.875rem' }}
                >
                  추론 결과 삭제
                </button>
              </div>
            </div>

            {/* Reasoning Stats */}
            <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
                <div className="stat-value">{inferenceRules.length}</div>
                <div className="stat-label" style={{ color: 'rgba(255,255,255,0.9)' }}>추론 규칙</div>
              </div>
              <div className="stat-card" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}>
                <div className="stat-value">{reasoningStats?.totalInferredNodes || 0}</div>
                <div className="stat-label" style={{ color: 'rgba(255,255,255,0.9)' }}>추론된 노드</div>
              </div>
              <div className="stat-card" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white' }}>
                <div className="stat-value">{reasoningStats?.totalInferredRelationships || 0}</div>
                <div className="stat-label" style={{ color: 'rgba(255,255,255,0.9)' }}>추론된 관계</div>
              </div>
              <div className="stat-card" style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: 'white' }}>
                <div className="stat-value">
                  {(reasoningStats?.totalInferredNodes || 0) + (reasoningStats?.totalInferredRelationships || 0)}
                </div>
                <div className="stat-label" style={{ color: 'rgba(255,255,255,0.9)' }}>총 추론 결과</div>
              </div>
            </div>

            {/* Message Display */}
            {reasoningMessage && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  marginBottom: '1rem',
                  backgroundColor: reasoningMessage.includes('Failed') || reasoningMessage.includes('실패') ? 'rgba(229, 62, 62, 0.15)' : 'rgba(72, 187, 120, 0.15)',
                  color: reasoningMessage.includes('Failed') || reasoningMessage.includes('실패') ? '#fc8181' : '#68d391',
                  borderRadius: '8px',
                  border: `1px solid ${reasoningMessage.includes('Failed') || reasoningMessage.includes('실패') ? 'rgba(229, 62, 62, 0.3)' : 'rgba(72, 187, 120, 0.3)'}`,
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                {reasoningMessage}
              </div>
            )}

            {/* Inference Rules Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1rem' }}>
              {inferenceRules.map((rule) => {
                const isAxiomRule = rule.category === '공리' || rule.category === 'axiom';
                return (
                <div
                  key={rule.id}
                  style={{
                    padding: '1.25rem',
                    backgroundColor: isAxiomRule ? 'rgba(59, 130, 246, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                    borderRadius: '12px',
                    border: isAxiomRule ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(56, 189, 248, 0.12)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '1rem', color: '#f1f5f9' }}>{rule.name}</span>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: '12px',
                            backgroundColor: getCategoryColor(rule.category),
                            color: 'white',
                            fontSize: '0.7rem',
                            fontWeight: 500,
                            textTransform: 'uppercase',
                          }}
                        >
                          {rule.category}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5 }}>{rule.description}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleRunWithTrace(rule.id)}
                      disabled={isRunningReasoning || isLoadingTrace}
                      style={{ fontSize: '0.8rem', padding: '6px 16px' }}
                    >
                      {isLoadingTrace ? '실행 중...' : '실행'}
                    </button>
                  </div>
                </div>
              );
              })}
            </div>

            {/* Run All Results Detail */}
            {runAllResult && runAllResult.results && (() => {
              const existingCount = (reasoningStats?.totalInferredNodes || 0) + (reasoningStats?.totalInferredRelationships || 0);
              const hasExisting = existingCount > 0;
              const newCount = runAllResult.totalInferred || 0;
              return (
              <div style={{
                marginTop: '1.5rem',
                padding: '1.25rem',
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                borderRadius: '12px',
                border: '1px solid rgba(56, 189, 248, 0.15)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>
                    전체 추론 결과
                  </h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {newCount > 0 && (
                      <span style={{
                        padding: '4px 12px', borderRadius: '12px',
                        backgroundColor: 'rgba(72, 187, 120, 0.2)', color: '#68d391',
                        fontSize: '0.8rem', fontWeight: 600,
                      }}>
                        +{newCount}건 새로 추론
                      </span>
                    )}
                    {hasExisting && (
                      <span style={{
                        padding: '4px 12px', borderRadius: '12px',
                        backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8',
                        fontSize: '0.8rem', fontWeight: 600,
                      }}>
                        기존 {existingCount}건 유지
                      </span>
                    )}
                    {!hasExisting && newCount === 0 && (
                      <span style={{
                        padding: '4px 12px', borderRadius: '12px',
                        backgroundColor: 'rgba(236, 201, 75, 0.15)', color: '#ecc94b',
                        fontSize: '0.8rem', fontWeight: 600,
                      }}>
                        추론 결과 없음
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {runAllResult.results.map((r: any, i: number) => {
                    const isNewSuccess = r.status === 'success' && r.count > 0;
                    const isZeroCount = r.status === 'success' && r.count === 0;
                    // If no new inferences but existing data exists, it's "already inferred"
                    const isAlreadyDone = isZeroCount && hasExisting;
                    const borderColor = isNewSuccess ? '#68d391' : isAlreadyDone ? '#38bdf8' : isZeroCount ? '#ecc94b' : '#fc8181';
                    const badgeBg = isNewSuccess ? 'rgba(72, 187, 120, 0.2)' : isAlreadyDone ? 'rgba(56, 189, 248, 0.15)' : isZeroCount ? 'rgba(236, 201, 75, 0.2)' : 'rgba(252, 129, 129, 0.2)';
                    const badgeColor = isNewSuccess ? '#68d391' : isAlreadyDone ? '#38bdf8' : isZeroCount ? '#ecc94b' : '#fc8181';
                    const badgeText = isNewSuccess ? '성공' : isAlreadyDone ? '이미 추론됨' : isZeroCount ? '매칭 없음' : '오류';
                    const clickable = Boolean(r.ruleId);
                    return (
                      <div
                        key={i}
                        onClick={() => clickable && handleRunWithTrace(r.ruleId)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.6rem 0.8rem',
                          backgroundColor: 'rgba(15, 23, 42, 0.5)',
                          borderRadius: '8px',
                          borderLeft: `3px solid ${borderColor}`,
                          cursor: clickable ? 'pointer' : 'default',
                          transition: 'background-color 0.15s',
                        }}
                        onMouseEnter={(e) => { if (clickable) e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.5)'; }}
                      >
                        <span style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>{r.ruleName}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {isNewSuccess && (
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#68d391' }}>
                              +{r.count}건
                            </span>
                          )}
                          <span style={{
                            padding: '2px 8px', borderRadius: '8px',
                            fontSize: '0.7rem', fontWeight: 500,
                            backgroundColor: badgeBg, color: badgeColor,
                          }}>
                            {badgeText}
                          </span>
                          {clickable && (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{'\u203A'}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
                  각 규칙을 클릭하면 추론 과정과 개별 결과를 상세히 확인할 수 있습니다
                </div>
              </div>
              );
            })()}
          </div>
        )}

        {/* Cypher Query Tab */}
        {activeTab === 'query' && (
          <div className="card">
            <h2 className="card-title">Cypher Query Editor</h2>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1rem' }}>
              Execute read-only Cypher queries against the Neo4j database. CREATE, DELETE, SET, MERGE operations are not allowed.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <textarea
                value={cypherQuery}
                onChange={(e) => setCypherQuery(e.target.value)}
                placeholder="Enter Cypher query..."
                style={{
                  width: '100%',
                  height: '120px',
                  padding: '0.75rem',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: '8px',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  resize: 'vertical',
                  backgroundColor: 'rgba(15, 23, 42, 0.5)',
                  color: '#e2e8f0',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                className="btn btn-primary"
                onClick={executeQuery}
                disabled={isQuerying || !cypherQuery.trim()}
              >
                {isQuerying ? 'Executing...' : 'Execute Query'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setCypherQuery('MATCH (n) RETURN n LIMIT 25')}
              >
                Reset
              </button>
            </div>

            {/* Sample Queries */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>Sample Queries:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {[
                  { label: 'All Nodes', query: 'MATCH (n) RETURN n LIMIT 50' },
                  { label: 'Equipment', query: 'MATCH (e:Equipment) RETURN e.name, e.equipmentId, e.healthScore' },
                  { label: 'Sensors', query: 'MATCH (s:Sensor) RETURN s.name, s.sensorId, s.sensorType' },
                  { label: 'Equipment-Sensor', query: 'MATCH (e:Equipment)-[r:HAS_SENSOR]->(s:Sensor) RETURN e.name, type(r), s.name LIMIT 20' },
                  { label: 'Count by Label', query: 'MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count ORDER BY count DESC' },
                ].map((sample) => (
                  <button
                    key={sample.label}
                    className="btn btn-sm"
                    onClick={() => setCypherQuery(sample.query)}
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </div>

            {queryError && (
              <div className="error-message" style={{ marginBottom: '1rem' }}>
                {queryError}
              </div>
            )}

            {queryResults && (
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#f1f5f9' }}>
                  Results: {queryResults.length} rows
                </div>
                <div style={{ overflow: 'auto', maxHeight: '400px' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        {queryColumns.map((col) => (
                          <th key={col}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResults.map((row, i) => (
                        <tr key={i}>
                          {queryColumns.map((col) => (
                            <td key={col} style={{ fontSize: '0.875rem' }}>
                              {typeof row[col] === 'object'
                                ? JSON.stringify(row[col]).substring(0, 100)
                                : String(row[col] ?? '').substring(0, 100)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Class Hierarchy Tab */}
        {activeTab === 'hierarchy' && (
          <div className="card">
            <h2 className="card-title">Class Hierarchy</h2>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1rem' }}>
              Explore the ontology class structure. Click on nodes to expand/collapse.
            </p>

            {hierarchy.length > 0 ? (
              <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                {renderHierarchyTree(hierarchy)}
              </div>
            ) : (
              <div style={{ color: '#94a3b8' }}>No hierarchy data available</div>
            )}

            {/* Flat class list */}
            <div style={{ marginTop: '2rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#f1f5f9' }}>All Node Types</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                {classes.map((cls: any) => (
                  <div
                    key={cls.name}
                    style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: 'rgba(30, 41, 59, 0.5)',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      border: '1px solid rgba(56, 189, 248, 0.1)',
                    }}
                  >
                    <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{cls.name}</span>
                    <span style={{ marginLeft: '0.5rem', color: '#94a3b8' }}>({(cls as any).count || 0})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Axioms & Constraints Tab */}
        {activeTab === 'axioms' && (
          <div className="card">
            <h2 className="card-title">공리 및 제약조건</h2>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1.5rem' }}>
              온톨로지의 구조적 공리와 데이터 제약조건을 검증하고 추론 기반을 확인합니다.
            </p>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{
                padding: '1rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '8px',
                color: 'white'
              }}>
                <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>공리 (Axioms)</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}>
                  {axioms.length}
                </div>
              </div>
              <div style={{
                padding: '1rem',
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                borderRadius: '8px',
                color: 'white'
              }}>
                <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>제약조건 (Constraints)</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}>
                  {constraints.length}
                </div>
              </div>
              <div style={{
                padding: '1rem',
                background: axiomResults && axiomResults.totalViolations > 0
                  ? 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
                  : 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
                borderRadius: '8px',
                color: 'white'
              }}>
                <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>공리 위반</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}>
                  {axiomResults?.totalViolations || 0}
                </div>
              </div>
              <div style={{
                padding: '1rem',
                background: constraintResults && constraintResults.totalViolations > 0
                  ? 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
                  : 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
                borderRadius: '8px',
                color: 'white'
              }}>
                <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>제약조건 위반</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}>
                  {constraintResults?.totalViolations || 0}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  setIsCheckingAxioms(true);
                  try {
                    const response = await axiomApi.checkAll();
                    if (response.data) {
                      setAxiomResults(response.data);
                    }
                  } catch (error) {
                    console.error('Failed to check axioms:', error);
                  } finally {
                    setIsCheckingAxioms(false);
                  }
                }}
                disabled={isCheckingAxioms}
              >
                {isCheckingAxioms ? '검증 중...' : '공리 검증'}
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  setIsValidatingConstraints(true);
                  try {
                    const response = await constraintApi.validateAll();
                    if (response.data) {
                      setConstraintResults(response.data);
                    }
                  } catch (error) {
                    console.error('Failed to validate constraints:', error);
                  } finally {
                    setIsValidatingConstraints(false);
                  }
                }}
                disabled={isValidatingConstraints}
              >
                {isValidatingConstraints ? '검증 중...' : '제약조건 검증'}
              </button>
              <button
                className="btn btn-success"
                onClick={async () => {
                  setIsCheckingAxioms(true);
                  setIsValidatingConstraints(true);
                  try {
                    const [axiomResponse, constraintResponse] = await Promise.all([
                      axiomApi.checkAll(),
                      constraintApi.validateAll()
                    ]);
                    if (axiomResponse.data) setAxiomResults(axiomResponse.data);
                    if (constraintResponse.data) setConstraintResults(constraintResponse.data);
                  } catch (error) {
                    console.error('Failed to validate:', error);
                  } finally {
                    setIsCheckingAxioms(false);
                    setIsValidatingConstraints(false);
                  }
                }}
                disabled={isCheckingAxioms || isValidatingConstraints}
              >
                전체 검증
              </button>
            </div>

            {/* Axioms Section */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: '0.5rem' }}>📜</span>
                공리 (Axioms)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
                {axioms.map((axiom) => (
                  <AxiomViewer
                    key={axiom.axiomId}
                    axiom={axiom}
                    isLoading={checkingAxiomId === axiom.axiomId}
                    checkResult={individualAxiomResults[axiom.axiomId] || null}
                    onCheck={async (axiomId: string) => {
                      setCheckingAxiomId(axiomId);
                      try {
                        const response = await axiomApi.check(axiomId);
                        if (response.status === 'success' && response.data?.result) {
                          const result = response.data.result;
                          setIndividualAxiomResults(prev => ({
                            ...prev,
                            [axiomId]: {
                              passed: result.passed,
                              violationCount: result.violationCount,
                              violations: result.violations,
                              checkedAt: result.checkedAt
                            }
                          }));
                        }
                      } catch (error) {
                        console.error('Failed to check axiom:', error);
                      } finally {
                        setCheckingAxiomId(null);
                      }
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Constraints Section */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: '0.5rem' }}>🔒</span>
                제약조건 (Constraints)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
                {constraints.map((constraint) => (
                  <ConstraintViewer
                    key={constraint.constraintId}
                    constraint={constraint}
                    isLoading={checkingConstraintId === constraint.constraintId}
                    checkResult={individualConstraintResults[constraint.constraintId] || null}
                    onValidate={async (constraintId: string) => {
                      setCheckingConstraintId(constraintId);
                      try {
                        const response = await constraintApi.validate(constraintId);
                        if (response.status === 'success' && response.data?.result) {
                          const result = response.data.result;
                          setIndividualConstraintResults(prev => ({
                            ...prev,
                            [constraintId]: {
                              passed: result.passed,
                              violationCount: result.violationCount,
                              violations: result.violations,
                              checkedAt: result.checkedAt
                            }
                          }));
                        }
                      } catch (error) {
                        console.error('Failed to validate constraint:', error);
                      } finally {
                        setCheckingConstraintId(null);
                      }
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Violation Results */}
            {(axiomResults || constraintResults) && (
              <ViolationPanel
                axiomResults={axiomResults}
                constraintResults={constraintResults}
              />
            )}
          </div>
        )}
      </div>

      {/* Reasoning Trace Modal */}
      {showTraceModal && reasoningTrace && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setShowTraceModal(false)}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '16px',
              width: '90%',
              maxWidth: '900px',
              maxHeight: '85vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1rem 1.5rem',
                borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'rgba(15, 23, 42, 0.5)',
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#f1f5f9' }}>
                  추론 과정 분석
                </h2>
                <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                  {reasoningTrace.ruleName}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span
                  style={{
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    backgroundColor: getResultBadgeStyle(reasoningTrace.result).bgColor,
                    color: getResultBadgeStyle(reasoningTrace.result).color,
                  }}
                >
                  {getResultBadgeStyle(reasoningTrace.result).text}
                </span>
                <button
                  onClick={() => setShowTraceModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    color: '#94a3b8',
                  }}
                >
                  {'\u00D7'}
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
              {/* Insight Summary */}
              {(() => {
                const isSuccess = reasoningTrace.result === 'SUCCESS';
                const isNoMatch = reasoningTrace.result === 'NO_MATCH';
                const accentColor = isSuccess ? '#68d391' : isNoMatch ? '#ecc94b' : '#fc8181';
                const accentBg = isSuccess ? 'rgba(72, 187, 120, 0.1)' : isNoMatch ? 'rgba(236, 201, 75, 0.08)' : 'rgba(252, 129, 129, 0.1)';
                const accentBorder = isSuccess ? 'rgba(72, 187, 120, 0.3)' : isNoMatch ? 'rgba(236, 201, 75, 0.25)' : 'rgba(252, 129, 129, 0.3)';

                // Find where pipeline stopped for NO_MATCH
                const failedStep = isNoMatch
                  ? reasoningTrace.steps.find((s: any) => s.dataCount === 0)
                  : null;
                const lastSuccessStep = isNoMatch
                  ? [...reasoningTrace.steps].reverse().find((s: any) => s.dataCount > 0)
                  : null;

                return (
                  <div style={{
                    padding: '1.25rem',
                    backgroundColor: accentBg,
                    borderRadius: '12px',
                    marginBottom: '1.5rem',
                    border: `1px solid ${accentBorder}`,
                  }}>
                    {/* Result headline */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                      <span style={{ fontSize: '1.3rem' }}>
                        {isSuccess ? '\u2705' : isNoMatch ? '\u26A0\uFE0F' : '\u274C'}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '1.05rem', color: accentColor }}>
                        {isSuccess
                          ? `${reasoningTrace.inferredCount}건의 새로운 지식이 추론되었습니다`
                          : isNoMatch
                            ? '현재 조건에 부합하는 데이터가 없습니다'
                            : '규칙 실행 중 오류가 발생했습니다'}
                      </span>
                    </div>

                    {/* Rule condition box */}
                    <div style={{
                      padding: '0.75rem 1rem',
                      backgroundColor: 'rgba(15, 23, 42, 0.4)',
                      borderRadius: '8px',
                      marginBottom: '0.75rem',
                      borderLeft: `3px solid ${accentColor}`,
                    }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        적용 조건
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                        {(reasoningTrace as any).condition || reasoningTrace.ruleDescription}
                      </div>
                    </div>

                    {/* What would be inferred (for SUCCESS or NO_MATCH) */}
                    {(reasoningTrace as any).inference && (
                      <div style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: 'rgba(15, 23, 42, 0.4)',
                        borderRadius: '8px',
                        marginBottom: '0.75rem',
                        borderLeft: `3px solid #38bdf8`,
                      }}>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {isSuccess ? '추론 내용' : '추론 예정 내용'}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                          {(reasoningTrace as any).inference}
                        </div>
                      </div>
                    )}

                    {/* Diagnostic for NO_MATCH */}
                    {isNoMatch && (failedStep || lastSuccessStep) && (
                      <div style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: 'rgba(236, 201, 75, 0.06)',
                        borderRadius: '8px',
                        borderLeft: '3px solid #ecc94b',
                      }}>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          진단
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#e2e8f0', lineHeight: 1.6 }}>
                          {lastSuccessStep && (
                            <div>
                              <span style={{ color: '#68d391' }}>{'\u2714'}</span>{' '}
                              <strong>{lastSuccessStep.description}</strong> 단계에서 <strong>{lastSuccessStep.dataCount}건</strong>의 데이터가 검색됨
                            </div>
                          )}
                          {failedStep && (
                            <div style={{ marginTop: '0.3rem' }}>
                              <span style={{ color: '#ecc94b' }}>{'\u2716'}</span>{' '}
                              <strong>{failedStep.description}</strong> 단계에서 조건에 맞는 결과가 0건
                            </div>
                          )}
                          {failedStep && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
                              {failedStep.resultSummary || '위 단계의 필터 조건을 만족하는 데이터가 현재 존재하지 않습니다.'}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Success count */}
                    {isSuccess && reasoningTrace.inferredCount > 0 && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#68d391', fontWeight: 500 }}>
                        아래 추론 단계에서 상세 과정을 확인하세요.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Timeline Steps */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                  🔄 추론 단계 ({reasoningTrace.steps.length}단계)
                </h3>
                <div style={{ position: 'relative' }}>
                  {reasoningTrace.steps.map((step, index) => {
                    const stepStyle = getStepTypeStyle(step.type);
                    const isExpanded = expandedSteps.has(step.stepNumber);

                    return (
                      <div
                        key={step.stepNumber}
                        style={{
                          position: 'relative',
                          paddingLeft: '50px',
                          marginBottom: '1rem',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            left: '8px',
                            top: '4px',
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            backgroundColor: stepStyle.bgColor,
                            border: `2px solid ${stepStyle.color}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.9rem',
                            zIndex: 1,
                          }}
                        >
                          {stepStyle.icon}
                        </div>
                        <div
                          style={{
                            backgroundColor: stepStyle.bgColor,
                            borderRadius: '8px',
                            border: `1px solid ${stepStyle.color}30`,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              padding: '0.75rem 1rem',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                            onClick={() => toggleStepExpansion(step.stepNumber)}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: stepStyle.color, textTransform: 'uppercase' }}>
                                  Step {step.stepNumber}: {step.type}
                                </span>
                                {step.dataCount > 0 && (
                                  <span style={{ padding: '2px 6px', backgroundColor: stepStyle.color, color: 'white', borderRadius: '4px', fontSize: '0.7rem' }}>
                                    {step.dataCount}건
                                  </span>
                                )}
                              </div>
                              <div style={{ fontWeight: 500, marginTop: '0.25rem', color: '#e2e8f0' }}>{step.description}</div>
                              {step.resultSummary && (
                                <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginTop: '0.25rem' }}>{'\u2192'} {step.resultSummary}</div>
                              )}
                            </div>
                            <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                          </div>
                          {isExpanded && step.data && step.data.length > 0 && (
                            <div style={{ padding: '0.75rem 1rem', borderTop: `1px solid ${stepStyle.color}30`, backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
                              <div style={{ maxHeight: '150px', overflow: 'auto', backgroundColor: 'rgba(15, 23, 42, 0.5)', borderRadius: '6px', padding: '0.5rem' }}>
                                {step.data.slice(0, 5).map((item, i) => (
                                  <div key={i} style={{ padding: '0.5rem', marginBottom: '0.25rem', backgroundColor: 'rgba(30, 41, 59, 0.5)', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', color: '#e2e8f0' }}>
                                    {Object.entries(item).map(([key, value]) => (
                                      <span key={key} style={{ padding: '2px 6px', backgroundColor: 'rgba(56, 189, 248, 0.1)', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.15)' }}>
                                        <strong>{key}:</strong> {String(value)}
                                      </span>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Evidence Section */}
              {reasoningTrace.evidence.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                    📌 추론 근거 ({reasoningTrace.evidence.length}건)
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
                    {reasoningTrace.evidence.map((ev) => (
                      <div key={ev.id} style={{ padding: '0.75rem', backgroundColor: 'rgba(30, 41, 59, 0.5)', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.15)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <span style={{ padding: '2px 6px', backgroundColor: ev.type === 'PROPERTY' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(251, 146, 60, 0.2)', color: ev.type === 'PROPERTY' ? '#38bdf8' : '#fb923c', borderRadius: '4px', fontSize: '0.7rem' }}>
                            {ev.type}
                          </span>
                          <span style={{ fontWeight: 500, fontSize: '0.875rem', color: '#e2e8f0' }}>{ev.label}</span>
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>{ev.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Inferred Items */}
              {reasoningTrace.inferredItems.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                    ✨ 새로 추론된 지식 ({reasoningTrace.inferredItems.length}건)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {reasoningTrace.inferredItems.map((item, i) => (
                      <div key={i} style={{ padding: '0.75rem', backgroundColor: 'rgba(251, 146, 60, 0.1)', borderRadius: '8px', border: '1px solid rgba(251, 146, 60, 0.3)', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {Object.entries(item).map(([key, value]) => (
                          <span key={key} style={{ padding: '4px 8px', backgroundColor: 'rgba(251, 146, 60, 0.15)', borderRadius: '4px', fontSize: '0.875rem', color: '#e2e8f0' }}>
                            <strong>{key}:</strong> {String(value)}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid rgba(56, 189, 248, 0.15)', display: 'flex', justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
              <button className="btn btn-secondary" onClick={() => setShowTraceModal(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* Ontology Information */}
      <div style={{ padding: '1.5rem 2rem', backgroundColor: 'rgba(30, 41, 59, 0.3)', borderTop: '1px solid rgba(56, 189, 248, 0.08)' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>Ontology Information</h2>
        <div className="grid-2">
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#f1f5f9' }}>Base Ontologies</h3>
            <ul style={{ paddingLeft: '1.5rem', color: '#94a3b8' }}>
              <li><strong style={{ color: '#e2e8f0' }}>SSN/SOSA</strong> - Semantic Sensor Network Ontology</li>
              <li><strong style={{ color: '#e2e8f0' }}>SAREF</strong> - Smart Applications Reference Ontology</li>
              <li><strong style={{ color: '#e2e8f0' }}>IOF-Maint</strong> - Industrial Ontologies Foundry - Maintenance</li>
            </ul>
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#f1f5f9' }}>Namespaces</h3>
            <ul style={{ paddingLeft: '1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>
              <li><code style={{ color: '#38bdf8' }}>upw:</code> http://example.org/upw#</li>
              <li><code style={{ color: '#38bdf8' }}>sosa:</code> http://www.w3.org/ns/sosa/</li>
              <li><code style={{ color: '#38bdf8' }}>saref:</code> https://saref.etsi.org/core/</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OntologyExplorer;
