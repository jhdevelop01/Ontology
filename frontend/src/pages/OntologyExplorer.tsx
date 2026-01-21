import React, { useEffect, useState, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { ontologyApi, reasoningApi, testDataApi } from '../services/api';
import type { OntologyClass } from '../types';

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
  'other': '#95a5a6',
};

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

type ActiveTab = 'graph' | 'query' | 'hierarchy' | 'reasoning';

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
  const [activeTab, setActiveTab] = useState<ActiveTab>('graph');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [showNodePanel, setShowNodePanel] = useState(true);

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
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [ruleCheckResult, setRuleCheckResult] = useState<any>(null);
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

  // Refs
  const graphRef = useRef<any>();
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [classesRes, graphRes, relTypesRes, hierarchyRes] = await Promise.all([
          ontologyApi.getClasses(),
          ontologyApi.getGraph(),
          ontologyApi.getRelationshipTypes(),
          ontologyApi.getHierarchy(),
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
  const handleNodeClick = useCallback(async (node: ForceGraphNode) => {
    setSelectedNode(node);
    setPathSource(node.id);

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
  }, [graphData.links]);

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
    setSelectedNode(null);
    setNodeDetails(null);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    setPathResult(null);
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

  // Node canvas drawing
  const drawNode = useCallback(
    (node: ForceGraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name || node.id;
      const fontSize = 12 / globalScale;
      const nodeColor = NODE_COLORS[node.nodeType] || NODE_COLORS.other;
      const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
      const isHovered = hoverNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;

      const radius = isHovered ? 12 : isSelected ? 11 : 9;

      // Shadow
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, radius + 2, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fill();

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);
      ctx.fillStyle = isHighlighted ? nodeColor : `${nodeColor}60`;
      ctx.fill();

      // Border
      ctx.strokeStyle = isSelected ? '#e74c3c' : isHovered ? '#2c3e50' : nodeColor;
      ctx.lineWidth = (isSelected || isHovered ? 3 : 2) / globalScale;
      ctx.stroke();

      // Label
      if (globalScale > 0.5 || isHovered || isSelected) {
        const labelText = label.substring(0, 18);
        ctx.font = `bold ${fontSize}px Sans-Serif`;
        const textWidth = ctx.measureText(labelText).width;

        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(node.x! - textWidth / 2 - 3, node.y! + radius + 2, textWidth + 6, fontSize + 4);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isHighlighted ? '#2c3e50' : '#7f8c8d';
        ctx.fillText(labelText, node.x!, node.y! + radius + 4);
      }
    },
    [highlightNodes, hoverNode, selectedNode]
  );

  // Link canvas drawing
  const drawLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      const linkId = `${sourceId}-${targetId}`;
      const isHighlighted = highlightLinks.size === 0 || highlightLinks.has(linkId);

      ctx.strokeStyle = isHighlighted ? '#5a6c7d' : '#bdc3c7';
      ctx.lineWidth = isHighlighted ? 2 : 1;

      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);
      ctx.stroke();

      // Arrow
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      const angle = Math.atan2(dy, dx);
      const arrowPos = 0.75;
      const arrowX = link.source.x + dx * arrowPos;
      const arrowY = link.source.y + dy * arrowPos;
      const arrowSize = isHighlighted ? 6 : 4;

      ctx.fillStyle = isHighlighted ? '#5a6c7d' : '#bdc3c7';
      ctx.beginPath();
      ctx.moveTo(arrowX + arrowSize * Math.cos(angle), arrowY + arrowSize * Math.sin(angle));
      ctx.lineTo(
        arrowX + arrowSize * Math.cos(angle + 2.5),
        arrowY + arrowSize * Math.sin(angle + 2.5)
      );
      ctx.lineTo(
        arrowX + arrowSize * Math.cos(angle - 2.5),
        arrowY + arrowSize * Math.sin(angle - 2.5)
      );
      ctx.closePath();
      ctx.fill();

      // Link label
      if (isHighlighted && globalScale > 0.8) {
        const midX = (link.source.x + link.target.x) / 2;
        const midY = (link.source.y + link.target.y) / 2;
        const fontSize = 10 / globalScale;

        ctx.font = `${fontSize}px Sans-Serif`;
        const textWidth = ctx.measureText(link.type).width;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(midX - textWidth / 2 - 2, midY - fontSize / 2 - 1, textWidth + 4, fontSize + 2);

        ctx.fillStyle = '#5a6c7d';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(link.type, midX, midY);
      }
    },
    [highlightLinks]
  );

  // Zoom controls
  const handleZoomIn = () => graphRef.current?.zoom(graphRef.current.zoom() * 1.5, 300);
  const handleZoomOut = () => graphRef.current?.zoom(graphRef.current.zoom() / 1.5, 300);
  const handleZoomReset = () => {
    graphRef.current?.zoomToFit(400, 50);
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

  // Center graph on load
  useEffect(() => {
    if (graphData.nodes.length > 0 && graphRef.current) {
      setTimeout(() => graphRef.current?.zoomToFit(400, 80), 500);
    }
  }, [graphData.nodes.length]);

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
            borderRadius: '4px',
            backgroundColor: expandedNodes.has(node.name) ? '#e2e8f0' : 'transparent',
          }}
          onClick={() => toggleHierarchyNode(node.name)}
        >
          {node.children && node.children.length > 0 && (
            <span style={{ marginRight: '4px', fontFamily: 'monospace' }}>
              {expandedNodes.has(node.name) ? '[-]' : '[+]'}
            </span>
          )}
          <span style={{ fontWeight: 500 }}>{node.name}</span>
          <span style={{ marginLeft: '8px', color: '#718096', fontSize: '0.75rem' }}>
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
    if (activeTab === 'reasoning') {
      fetchReasoningData();
    }
  }, [activeTab, fetchReasoningData]);

  // Check what a rule would infer
  const handleCheckRule = async (ruleId: string) => {
    setSelectedRule(ruleId);
    setRuleCheckResult(null);
    setReasoningMessage(null);

    try {
      const res = await reasoningApi.checkRule(ruleId);
      if (res.status === 'success' && res.data) {
        setRuleCheckResult(res.data);
      }
    } catch (err) {
      console.error('Check rule error:', err);
      setReasoningMessage('Failed to check rule');
    }
  };

  // Apply a specific rule
  const handleApplyRule = async (ruleId: string) => {
    setIsRunningReasoning(true);
    setReasoningMessage(null);

    try {
      const res = await reasoningApi.applyRule(ruleId);
      if (res.status === 'success' && res.data) {
        setReasoningMessage(`Applied rule: ${res.data.message}`);
        fetchReasoningData(); // Refresh stats
      }
    } catch (err) {
      console.error('Apply rule error:', err);
      setReasoningMessage('Failed to apply rule');
    } finally {
      setIsRunningReasoning(false);
    }
  };

  // Run all inference rules
  const handleRunAllRules = async () => {
    setIsRunningReasoning(true);
    setReasoningMessage(null);
    setRunAllResult(null);

    try {
      const res = await reasoningApi.runAll();
      if (res.status === 'success' && res.data) {
        setRunAllResult(res.data);
        setReasoningMessage(`Completed: ${res.data.totalInferred} new inferences`);
        fetchReasoningData(); // Refresh stats
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
    if (activeTab === 'reasoning') {
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
        return { icon: '🔍', color: '#3498db', bgColor: '#ebf8ff' };
      case 'FILTER':
        return { icon: '🔎', color: '#9b59b6', bgColor: '#faf5ff' };
      case 'CHECK':
        return { icon: '✓', color: '#27ae60', bgColor: '#f0fff4' };
      case 'INFERENCE':
        return { icon: '💡', color: '#e67e22', bgColor: '#fffaf0' };
      case 'RESULT':
        return { icon: '📊', color: '#718096', bgColor: '#f7fafc' };
      default:
        return { icon: '•', color: '#718096', bgColor: '#f7fafc' };
    }
  };

  // Get result badge style
  const getResultBadgeStyle = (result: string) => {
    switch (result) {
      case 'SUCCESS':
        return { color: '#276749', bgColor: '#c6f6d5', text: '성공' };
      case 'NO_MATCH':
        return { color: '#744210', bgColor: '#fefcbf', text: '매칭 없음' };
      case 'ERROR':
        return { color: '#c53030', bgColor: '#fed7d7', text: '오류' };
      default:
        return { color: '#718096', bgColor: '#e2e8f0', text: '진행 중' };
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
      // English fallbacks
      maintenance: '#e67e22',
      anomaly: '#e74c3c',
      prediction: '#9b59b6',
      structure: '#3498db',
      analysis: '#2ecc71',
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
    <div className="ontology-page">
      <h1 className="page-title">Ontology Explorer</h1>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          className={`btn ${activeTab === 'graph' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('graph')}
        >
          Graph View
        </button>
        <button
          className={`btn ${activeTab === 'query' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('query')}
        >
          Cypher Query
        </button>
        <button
          className={`btn ${activeTab === 'hierarchy' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('hierarchy')}
        >
          Class Hierarchy
        </button>
        <button
          className={`btn ${activeTab === 'reasoning' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('reasoning')}
        >
          추론
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => handleExport('json')}>
            Export JSON
          </button>
          <button className="btn btn-secondary" onClick={() => handleExport('cypher')}>
            Export Cypher
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-value">{classes.length}</div>
          <div className="stat-label">Node Types</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{graphData.nodes.length}</div>
          <div className="stat-label">Visible Nodes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{graphData.links.length}</div>
          <div className="stat-label">Visible Relationships</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{relationshipTypes.length}</div>
          <div className="stat-label">Relationship Types</div>
        </div>
      </div>

      {/* Graph View Tab */}
      {activeTab === 'graph' && (
        <div style={{ display: 'grid', gridTemplateColumns: showFilters ? '280px 1fr' : '1fr', gap: '1.5rem' }}>
          {/* Left Sidebar */}
          {showFilters && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Search */}
              <div className="card">
                <h2 className="card-title">Search Nodes</h2>
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    handleSearch(e.target.value);
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                />
                {isSearching && <div style={{ padding: '0.5rem', color: '#718096' }}>Searching...</div>}
                {searchResults.length > 0 && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      maxHeight: '200px',
                      overflow: 'auto',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                    }}
                  >
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        onClick={() => handleSearchResultClick(result)}
                        style={{
                          padding: '0.5rem',
                          cursor: 'pointer',
                          borderBottom: '1px solid #e2e8f0',
                          fontSize: '0.875rem',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f7fafc')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                      >
                        <div style={{ fontWeight: 500 }}>{result.name}</div>
                        <div style={{ color: '#718096', fontSize: '0.75rem' }}>
                          {result.labels.join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Node Type Filters */}
              <div className="card">
                <h2 className="card-title">Node Types</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {Object.entries(NODE_COLORS).map(([type, color]) => (
                    <label
                      key={type}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={visibleNodeTypes.has(type)}
                        onChange={() => toggleNodeType(type)}
                      />
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: color,
                        }}
                      />
                      <span style={{ textTransform: 'capitalize', fontSize: '0.875rem' }}>{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Relationship Type Filters */}
              <div className="card">
                <h2 className="card-title">Relationship Types</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '150px', overflow: 'auto' }}>
                  {relationshipTypes.map(({ type, count }) => (
                    <label
                      key={type}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={visibleRelTypes.has(type)}
                        onChange={() => toggleRelType(type)}
                      />
                      <span style={{ fontSize: '0.875rem' }}>{type}</span>
                      <span style={{ color: '#718096', fontSize: '0.75rem' }}>({count})</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Path Finding */}
              <div className="card">
                <h2 className="card-title">Path Finding</h2>
                <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.5rem' }}>
                  Click nodes to set source/target
                </div>
                <input
                  type="text"
                  placeholder="Source Node ID"
                  value={pathSource}
                  onChange={(e) => setPathSource(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.375rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    marginBottom: '0.5rem',
                  }}
                />
                <input
                  type="text"
                  placeholder="Target Node ID"
                  value={pathTarget}
                  onChange={(e) => setPathTarget(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.375rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    marginBottom: '0.5rem',
                  }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleFindPath}
                  disabled={isFindingPath || !pathSource || !pathTarget}
                  style={{ width: '100%' }}
                >
                  {isFindingPath ? 'Finding...' : 'Find Path'}
                </button>
                {pathResult && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#276749' }}>
                    Path found: {pathResult.length} hops
                  </div>
                )}
                {pathResult === null && pathSource && pathTarget && !isFindingPath && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#c53030' }}>
                    No path found
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="card">
                <h2 className="card-title">Controls</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={handleZoomIn} className="btn btn-sm">+</button>
                    <button onClick={handleZoomOut} className="btn btn-sm">-</button>
                    <button onClick={handleZoomReset} className="btn btn-sm">Fit</button>
                  </div>
                  <button onClick={toggleFullscreen} className="btn btn-sm" style={{ width: '100%' }}>
                    {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Graph + Node Details */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            {/* Graph */}
            <div
              ref={graphContainerRef}
              style={{
                flex: 1,
                position: isFullscreen ? 'fixed' : 'relative',
                top: isFullscreen ? 0 : 'auto',
                left: isFullscreen ? 0 : 'auto',
                height: isFullscreen ? '100vh' : '600px',
                width: isFullscreen ? '100vw' : 'auto',
                zIndex: isFullscreen ? 9999 : 'auto',
                backgroundColor: '#f8fafc',
                borderRadius: isFullscreen ? 0 : '12px',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
            >
              {/* Fullscreen header */}
              {isFullscreen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    padding: '0.75rem 1rem',
                    background: 'rgba(255,255,255,0.98)',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    zIndex: 10,
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: '1rem' }}>Graph Visualization</h2>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={handleZoomIn} className="btn btn-sm">+</button>
                    <button onClick={handleZoomOut} className="btn btn-sm">-</button>
                    <button onClick={handleZoomReset} className="btn btn-sm">Fit</button>
                    <button
                      onClick={toggleFullscreen}
                      className="btn btn-sm"
                      style={{ background: '#e53e3e', color: 'white', marginLeft: '1rem' }}
                    >
                      Exit (ESC)
                    </button>
                  </div>
                </div>
              )}
              {graphData.nodes.length > 0 ? (
                <ForceGraph2D
                  ref={graphRef}
                  graphData={graphData}
                  nodeId="id"
                  nodeCanvasObject={drawNode}
                  nodePointerAreaPaint={(node, color, ctx) => {
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(node.x!, node.y!, 14, 0, 2 * Math.PI);
                    ctx.fill();
                  }}
                  linkCanvasObject={drawLink}
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                  onBackgroundClick={handleBackgroundClick}
                  onNodeDragEnd={(node) => {
                    node.fx = node.x;
                    node.fy = node.y;
                  }}
                  cooldownTicks={100}
                  d3AlphaDecay={0.02}
                  d3VelocityDecay={0.3}
                  warmupTicks={50}
                  enableNodeDrag={true}
                  enableZoomInteraction={true}
                  enablePanInteraction={true}
                  backgroundColor="#f8fafc"
                  onEngineStop={() => graphRef.current?.zoomToFit(400, 80)}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#718096',
                  }}
                >
                  No graph data available (check filters)
                </div>
              )}
            </div>

            {/* Node Details Panel */}
            {showNodePanel && nodeDetails && !isFullscreen && (
              <div className="card" style={{ width: '320px', maxHeight: '600px', overflow: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 className="card-title" style={{ marginBottom: 0 }}>Node Details</h2>
                  <button
                    onClick={() => setNodeDetails(null)}
                    className="btn btn-sm"
                    style={{ padding: '0.25rem 0.5rem' }}
                  >
                    X
                  </button>
                </div>

                <div style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <strong>Name:</strong> {nodeDetails.name}
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <strong>Labels:</strong>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                      {nodeDetails.labels.map((label) => (
                        <span
                          key={label}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: '#e2e8f0',
                            fontSize: '0.75rem',
                          }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '0.75rem' }}>
                    <strong>Properties:</strong>
                    <div
                      style={{
                        marginTop: '0.25rem',
                        padding: '0.5rem',
                        backgroundColor: '#f7fafc',
                        borderRadius: '4px',
                        maxHeight: '150px',
                        overflow: 'auto',
                      }}
                    >
                      {Object.entries(nodeDetails.properties).map(([key, value]) => (
                        <div key={key} style={{ marginBottom: '0.25rem', fontSize: '0.75rem' }}>
                          <span style={{ color: '#718096' }}>{key}:</span>{' '}
                          <span>{String(value).substring(0, 50)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {nodeDetails.outgoing.length > 0 && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <strong>Outgoing ({nodeDetails.outgoing.length}):</strong>
                      <div style={{ marginTop: '0.25rem', maxHeight: '100px', overflow: 'auto' }}>
                        {nodeDetails.outgoing.map((rel, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem',
                              borderBottom: '1px solid #e2e8f0',
                            }}
                          >
                            <span style={{ color: '#3498db' }}>{rel.type}</span> → {rel.targetName}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {nodeDetails.incoming.length > 0 && (
                    <div>
                      <strong>Incoming ({nodeDetails.incoming.length}):</strong>
                      <div style={{ marginTop: '0.25rem', maxHeight: '100px', overflow: 'auto' }}>
                        {nodeDetails.incoming.map((rel, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem',
                              borderBottom: '1px solid #e2e8f0',
                            }}
                          >
                            {rel.sourceName} → <span style={{ color: '#3498db' }}>{rel.type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cypher Query Tab */}
      {activeTab === 'query' && (
        <div className="card">
          <h2 className="card-title">Cypher Query Editor</h2>
          <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '1rem' }}>
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
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                resize: 'vertical',
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
            <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.5rem' }}>Sample Queries:</div>
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
              <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
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
          <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '1rem' }}>
            Explore the ontology class structure. Click on nodes to expand/collapse.
          </p>

          {hierarchy.length > 0 ? (
            <div style={{ maxHeight: '500px', overflow: 'auto' }}>
              {renderHierarchyTree(hierarchy)}
            </div>
          ) : (
            <div style={{ color: '#718096' }}>No hierarchy data available</div>
          )}

          {/* Flat class list */}
          <div style={{ marginTop: '2rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>All Node Types</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
              {classes.map((cls: any) => (
                <div
                  key={cls.name}
                  style={{
                    padding: '0.5rem 0.75rem',
                    backgroundColor: '#f7fafc',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{cls.name}</span>
                  <span style={{ marginLeft: '0.5rem', color: '#718096' }}>({(cls as any).count || 0})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Reasoning Tab */}
      {activeTab === 'reasoning' && (
        <div>
          {/* Test Data Panel */}
          <div className="card" style={{ marginBottom: '1.5rem', backgroundColor: '#fefcbf', border: '1px solid #f6e05e' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 className="card-title" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🧪</span> 테스트 시나리오
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleLoadAllTestData}
                  disabled={isLoadingTestData}
                >
                  {isLoadingTestData ? '로딩 중...' : '전체 시나리오 로드'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleResetTestData}
                  disabled={isLoadingTestData}
                >
                  데이터 초기화
                </button>
                <button
                  className="btn"
                  onClick={handleClearTestInferred}
                  disabled={isLoadingTestData}
                  style={{ backgroundColor: '#ed8936', color: 'white' }}
                >
                  추론 결과만 삭제
                </button>
              </div>
            </div>

            {/* Test Data Message */}
            {testDataMessage && (
              <div
                style={{
                  padding: '0.5rem 0.75rem',
                  marginBottom: '1rem',
                  backgroundColor: testDataMessage.includes('실패') ? '#fed7d7' : '#c6f6d5',
                  color: testDataMessage.includes('실패') ? '#c53030' : '#276749',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                {testDataMessage}
              </div>
            )}

            {/* Test Data Status */}
            {testDataStatus && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'white', borderRadius: '6px', fontSize: '0.8rem' }}>
                <strong>현재 데이터 상태:</strong>{' '}
                저건강 설비 {testDataStatus.dataStatus.lowHealthEquipment}개 |{' '}
                이상 관측값 {testDataStatus.dataStatus.anomalyObservations}개 |{' '}
                트렌딩 관측값 {testDataStatus.dataStatus.trendingObservations}개 |{' '}
                테스트 설비 {testDataStatus.dataStatus.testEquipment}개 |{' '}
                Flow 센서 {testDataStatus.dataStatus.flowSensors}개 |{' '}
                추론 노드 {testDataStatus.dataStatus.inferredNodes}개 |{' '}
                추론 관계 {testDataStatus.dataStatus.inferredRelationships}개
              </div>
            )}

            {/* Scenario List */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '0.75rem' }}>
              {testScenarios.map((scenario) => {
                const isLoaded = getScenarioStatus(scenario.id);
                return (
                  <div
                    key={scenario.id}
                    style={{
                      padding: '0.75rem',
                      backgroundColor: isLoaded ? '#c6f6d5' : 'white',
                      borderRadius: '6px',
                      border: isLoaded ? '1px solid #68d391' : '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                            {isLoaded ? '✅' : '⬜'} {scenario.name}
                          </span>
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '3px',
                              backgroundColor: '#667eea',
                              color: 'white',
                              fontSize: '0.65rem',
                            }}
                          >
                            {scenario.targetRule}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#4a5568', marginBottom: '0.25rem' }}>
                          {scenario.description}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#718096' }}>
                          예상 결과: {scenario.expectedResult}
                        </div>
                      </div>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleLoadScenario(scenario.id)}
                        disabled={isLoadingTestData || isLoaded}
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.25rem 0.5rem',
                          backgroundColor: isLoaded ? '#a0aec0' : '#4299e1',
                          color: 'white',
                        }}
                      >
                        {isLoaded ? '로드됨' : '로드'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <p style={{ fontSize: '0.75rem', color: '#744210', marginTop: '1rem', marginBottom: 0 }}>
              💡 테스트 시나리오를 로드한 후 아래 추론 규칙의 "추론 과정 보기" 버튼을 클릭하면 실제 추론 과정을 확인할 수 있습니다.
            </p>
          </div>

          {/* Reasoning Stats */}
          <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-value">{inferenceRules.length}</div>
              <div className="stat-label">추론 규칙 수</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{reasoningStats?.totalInferredNodes || 0}</div>
              <div className="stat-label">추론된 노드</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{reasoningStats?.totalInferredRelationships || 0}</div>
              <div className="stat-label">추론된 관계</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {(reasoningStats?.totalInferredNodes || 0) + (reasoningStats?.totalInferredRelationships || 0)}
              </div>
              <div className="stat-label">총 추론 결과</div>
            </div>
          </div>

          {/* Message Display */}
          {reasoningMessage && (
            <div
              style={{
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                backgroundColor: reasoningMessage.includes('Failed') || reasoningMessage.includes('실패') ? '#fed7d7' : '#c6f6d5',
                color: reasoningMessage.includes('Failed') || reasoningMessage.includes('실패') ? '#c53030' : '#276749',
                borderRadius: '6px',
                fontSize: '0.875rem',
              }}
            >
              {reasoningMessage}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Inference Rules */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>추론 규칙</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleRunAllRules}
                    disabled={isRunningReasoning}
                  >
                    {isRunningReasoning ? '실행 중...' : '전체 규칙 실행'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={handleClearInferred}
                    disabled={isRunningReasoning}
                    style={{ backgroundColor: '#e53e3e', color: 'white' }}
                  >
                    추론 결과 삭제
                  </button>
                </div>
              </div>

              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '1rem' }}>
                기존 데이터에서 새로운 지식을 추론하는 규칙 기반 추론 엔진입니다.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {inferenceRules.map((rule) => (
                  <div
                    key={rule.id}
                    style={{
                      padding: '1rem',
                      backgroundColor: selectedRule === rule.id ? '#ebf8ff' : '#f7fafc',
                      borderRadius: '8px',
                      border: selectedRule === rule.id ? '2px solid #3182ce' : '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <button
                            onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '0',
                              fontSize: '0.875rem',
                              color: '#4a5568',
                            }}
                          >
                            {expandedRule === rule.id ? '▼' : '▶'}
                          </button>
                          <span style={{ fontWeight: 600 }}>{rule.name}</span>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: getCategoryColor(rule.category),
                              color: 'white',
                              fontSize: '0.7rem',
                              textTransform: 'uppercase',
                            }}
                          >
                            {rule.category}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#718096', marginLeft: '1.25rem' }}>{rule.description}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn btn-sm"
                          onClick={() => handleCheckRule(rule.id)}
                          disabled={isRunningReasoning || isLoadingTrace}
                        >
                          확인
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleApplyRule(rule.id)}
                          disabled={isRunningReasoning || isLoadingTrace}
                        >
                          적용
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => handleRunWithTrace(rule.id)}
                          disabled={isRunningReasoning || isLoadingTrace}
                          style={{ backgroundColor: '#9b59b6', color: 'white' }}
                        >
                          {isLoadingTrace ? '분석 중...' : '추론 과정 보기'}
                        </button>
                      </div>
                    </div>

                    {/* Rule Details (Expanded) */}
                    {expandedRule === rule.id && (
                      <div
                        style={{
                          marginTop: '0.75rem',
                          marginLeft: '1.25rem',
                          padding: '0.75rem',
                          backgroundColor: 'white',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div style={{ marginBottom: '0.75rem' }}>
                          <div style={{ fontSize: '0.75rem', color: '#4a5568', fontWeight: 600, marginBottom: '0.25rem' }}>
                            📋 조건 (Condition)
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#2d3748', backgroundColor: '#edf2f7', padding: '0.5rem', borderRadius: '4px' }}>
                            {rule.condition || '조건 정보 없음'}
                          </div>
                        </div>

                        <div style={{ marginBottom: '0.75rem' }}>
                          <div style={{ fontSize: '0.75rem', color: '#4a5568', fontWeight: 600, marginBottom: '0.25rem' }}>
                            🔄 추론 과정 (Inference)
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#2d3748', backgroundColor: '#e6fffa', padding: '0.5rem', borderRadius: '4px' }}>
                            {rule.inference || '추론 과정 정보 없음'}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: '#4a5568', fontWeight: 600, marginBottom: '0.25rem' }}>
                              📥 입력 데이터
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#2d3748' }}>
                              {rule.inputData && rule.inputData.length > 0 ? (
                                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                                  {rule.inputData.map((item, i) => (
                                    <li key={i}>{item}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span style={{ color: '#a0aec0' }}>없음</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: '#4a5568', fontWeight: 600, marginBottom: '0.25rem' }}>
                              📤 출력 데이터
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#2d3748' }}>
                              {rule.outputData && rule.outputData.length > 0 ? (
                                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                                  {rule.outputData.map((item, i) => (
                                    <li key={i}>{item}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span style={{ color: '#a0aec0' }}>없음</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Rule Check Result */}
                    {selectedRule === rule.id && ruleCheckResult && (
                      <div
                        style={{
                          marginTop: '0.75rem',
                          marginLeft: '1.25rem',
                          padding: '0.75rem',
                          backgroundColor: '#fffaf0',
                          borderRadius: '6px',
                          border: '1px solid #ed8936',
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#c05621' }}>
                          🔍 추론 대상 확인 결과: {ruleCheckResult.count || 0}건
                        </div>
                        {ruleCheckResult.candidates && ruleCheckResult.candidates.length > 0 ? (
                          <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                            {ruleCheckResult.candidates.slice(0, 10).map((candidate: any, i: number) => (
                              <div
                                key={i}
                                style={{
                                  padding: '0.5rem',
                                  marginBottom: '0.5rem',
                                  backgroundColor: 'white',
                                  borderRadius: '4px',
                                  fontSize: '0.8rem',
                                }}
                              >
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                  {Object.entries(candidate).map(([key, value]) => (
                                    <span key={key} style={{ backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '3px' }}>
                                      <strong>{key}:</strong> {String(value)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                            {ruleCheckResult.candidates.length > 10 && (
                              <div style={{ color: '#718096', marginTop: '0.25rem', fontSize: '0.8rem' }}>
                                ...외 {ruleCheckResult.candidates.length - 10}건 더 있음
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ color: '#718096', fontSize: '0.875rem' }}>
                            현재 조건에 맞는 추론 대상이 없습니다.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Run All Results */}
              {runAllResult && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f7fafc', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                    추론 실행 결과 ({runAllResult.timestamp})
                  </div>
                  <div style={{ fontSize: '0.875rem' }}>
                    총 추론 결과: <strong>{runAllResult.totalInferred}건</strong>
                  </div>
                  <div style={{ marginTop: '0.5rem', maxHeight: '150px', overflow: 'auto' }}>
                    {runAllResult.results?.map((result: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '0.25rem 0',
                          fontSize: '0.75rem',
                          borderBottom: '1px solid #e2e8f0',
                        }}
                      >
                        <span>{result.ruleName}</span>
                        <span style={{ color: result.count > 0 ? '#276749' : '#718096' }}>
                          +{result.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Inferred Facts */}
            <div className="card">
              <h2 className="card-title">추론된 지식</h2>
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '1rem' }}>
                추론 엔진에 의해 새롭게 생성된 지식입니다.
              </p>

              {/* Inferred Nodes */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  추론된 노드 ({inferredFacts?.nodeCount || 0})
                </h3>
                {inferredFacts && inferredFacts.nodes.length > 0 ? (
                  <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                    {inferredFacts.nodes.map((node: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          padding: '0.5rem',
                          marginBottom: '0.5rem',
                          backgroundColor: '#f7fafc',
                          borderRadius: '4px',
                          fontSize: '0.875rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {node.labels?.map((label: string) => (
                            <span
                              key={label}
                              style={{
                                padding: '2px 6px',
                                backgroundColor: label === 'Inferred' ? '#9b59b6' : '#3498db',
                                color: 'white',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                              }}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                        <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#718096' }}>
                          {node.properties?.reason || node.properties?.description || JSON.stringify(node.properties).substring(0, 80)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#718096', fontSize: '0.875rem' }}>추론된 노드 없음</div>
                )}
              </div>

              {/* Inferred Relationships */}
              <div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  추론된 관계 ({inferredFacts?.relationshipCount || 0})
                </h3>
                {inferredFacts && inferredFacts.relationships.length > 0 ? (
                  <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                    {inferredFacts.relationships.map((rel: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          padding: '0.5rem',
                          marginBottom: '0.5rem',
                          backgroundColor: '#f7fafc',
                          borderRadius: '4px',
                          fontSize: '0.875rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{rel.sourceName || 'Node'}</span>
                        <span
                          style={{
                            padding: '2px 6px',
                            backgroundColor: '#e67e22',
                            color: 'white',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                          }}
                        >
                          {rel.type}
                        </span>
                        <span style={{ fontWeight: 500 }}>{rel.targetName || 'Node'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#718096', fontSize: '0.875rem' }}>추론된 관계 없음</div>
                )}
              </div>

              {/* Stats by Type */}
              {reasoningStats && (reasoningStats.nodesByType.length > 0 || reasoningStats.relationshipsByType.length > 0) && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>유형별 통계</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.25rem' }}>노드</div>
                      {reasoningStats.nodesByType.map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                          <span>{item.label}</span>
                          <span style={{ fontWeight: 500 }}>{item.count}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.25rem' }}>관계</div>
                      {reasoningStats.relationshipsByType.map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                          <span>{item.type}</span>
                          <span style={{ fontWeight: 500 }}>{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
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
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  width: '90%',
                  maxWidth: '900px',
                  maxHeight: '85vh',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div
                  style={{
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: '#f7fafc',
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                      추론 과정 분석
                    </h2>
                    <div style={{ fontSize: '0.875rem', color: '#718096', marginTop: '0.25rem' }}>
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
                        color: '#718096',
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Modal Body */}
                <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
                  {/* Summary */}
                  <div
                    style={{
                      padding: '1rem',
                      backgroundColor: '#f0fff4',
                      borderRadius: '8px',
                      marginBottom: '1.5rem',
                      border: '1px solid #9ae6b4',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#276749' }}>
                      📋 추론 결과 요약
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#2d3748' }}>
                      {reasoningTrace.summary}
                    </div>
                    {reasoningTrace.inferredCount > 0 && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#276749' }}>
                        새로 추론된 지식: <strong>{reasoningTrace.inferredCount}건</strong>
                      </div>
                    )}
                  </div>

                  {/* Timeline Steps */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                      🔄 추론 단계 ({reasoningTrace.steps.length}단계)
                    </h3>
                    <div style={{ position: 'relative' }}>
                      {/* Timeline line */}
                      <div
                        style={{
                          position: 'absolute',
                          left: '20px',
                          top: '30px',
                          bottom: '30px',
                          width: '2px',
                          backgroundColor: '#e2e8f0',
                        }}
                      />

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
                            {/* Step indicator */}
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

                            {/* Step content */}
                            <div
                              style={{
                                backgroundColor: stepStyle.bgColor,
                                borderRadius: '8px',
                                border: `1px solid ${stepStyle.color}30`,
                                overflow: 'hidden',
                              }}
                            >
                              {/* Step header */}
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
                                    <span
                                      style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                        color: stepStyle.color,
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      Step {step.stepNumber}: {step.type}
                                    </span>
                                    {step.dataCount > 0 && (
                                      <span
                                        style={{
                                          padding: '2px 6px',
                                          backgroundColor: stepStyle.color,
                                          color: 'white',
                                          borderRadius: '4px',
                                          fontSize: '0.7rem',
                                        }}
                                      >
                                        {step.dataCount}건
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontWeight: 500, marginTop: '0.25rem' }}>
                                    {step.description}
                                  </div>
                                  {step.resultSummary && (
                                    <div style={{ fontSize: '0.875rem', color: '#4a5568', marginTop: '0.25rem' }}>
                                      → {step.resultSummary}
                                    </div>
                                  )}
                                </div>
                                <span style={{ fontSize: '0.875rem', color: '#718096' }}>
                                  {isExpanded ? '▲' : '▼'}
                                </span>
                              </div>

                              {/* Step details (expanded) */}
                              {isExpanded && (
                                <div
                                  style={{
                                    padding: '0.75rem 1rem',
                                    borderTop: `1px solid ${stepStyle.color}30`,
                                    backgroundColor: 'white',
                                  }}
                                >
                                  {step.descriptionDetail && (
                                    <div style={{ marginBottom: '0.75rem' }}>
                                      <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.25rem' }}>
                                        상세 설명
                                      </div>
                                      <div style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                                        {step.descriptionDetail}
                                      </div>
                                    </div>
                                  )}

                                  {step.query && (
                                    <div style={{ marginBottom: '0.75rem' }}>
                                      <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.25rem' }}>
                                        쿼리
                                      </div>
                                      <code
                                        style={{
                                          display: 'block',
                                          padding: '0.5rem',
                                          backgroundColor: '#2d3748',
                                          color: '#e2e8f0',
                                          borderRadius: '4px',
                                          fontSize: '0.8rem',
                                          whiteSpace: 'pre-wrap',
                                          wordBreak: 'break-all',
                                        }}
                                      >
                                        {step.query}
                                      </code>
                                    </div>
                                  )}

                                  {step.data && step.data.length > 0 && (
                                    <div>
                                      <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.25rem' }}>
                                        데이터 ({step.data.length}건)
                                      </div>
                                      <div
                                        style={{
                                          maxHeight: '150px',
                                          overflow: 'auto',
                                          backgroundColor: '#f7fafc',
                                          borderRadius: '4px',
                                          padding: '0.5rem',
                                        }}
                                      >
                                        {step.data.slice(0, 5).map((item, i) => (
                                          <div
                                            key={i}
                                            style={{
                                              padding: '0.5rem',
                                              marginBottom: '0.25rem',
                                              backgroundColor: 'white',
                                              borderRadius: '4px',
                                              fontSize: '0.8rem',
                                              display: 'flex',
                                              flexWrap: 'wrap',
                                              gap: '0.5rem',
                                            }}
                                          >
                                            {Object.entries(item).map(([key, value]) => (
                                              <span
                                                key={key}
                                                style={{
                                                  padding: '2px 6px',
                                                  backgroundColor: '#e2e8f0',
                                                  borderRadius: '3px',
                                                }}
                                              >
                                                <strong>{key}:</strong> {String(value)}
                                              </span>
                                            ))}
                                          </div>
                                        ))}
                                        {step.data.length > 5 && (
                                          <div style={{ color: '#718096', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                                            ...외 {step.data.length - 5}건 더 있음
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
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
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                          gap: '0.75rem',
                        }}
                      >
                        {reasoningTrace.evidence.map((ev) => (
                          <div
                            key={ev.id}
                            style={{
                              padding: '0.75rem',
                              backgroundColor: '#f7fafc',
                              borderRadius: '6px',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <span
                                style={{
                                  padding: '2px 6px',
                                  backgroundColor: ev.type === 'PROPERTY' ? '#3498db' : ev.type === 'RELATIONSHIP' ? '#e67e22' : '#9b59b6',
                                  color: 'white',
                                  borderRadius: '4px',
                                  fontSize: '0.7rem',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {ev.type}
                              </span>
                              <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{ev.label}</span>
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#2d3748' }}>
                              {ev.description}
                            </div>
                            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#718096' }}>
                              <span style={{ backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '3px' }}>
                                {ev.propertyName}: {String(ev.propertyValue)}
                              </span>
                            </div>
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
                          <div
                            key={i}
                            style={{
                              padding: '0.75rem',
                              backgroundColor: '#fffaf0',
                              borderRadius: '6px',
                              border: '1px solid #ed8936',
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '0.5rem',
                            }}
                          >
                            {Object.entries(item).map(([key, value]) => (
                              <span
                                key={key}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: '#fed7aa',
                                  borderRadius: '4px',
                                  fontSize: '0.875rem',
                                }}
                              >
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
                <div
                  style={{
                    padding: '1rem 1.5rem',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '0.5rem',
                    backgroundColor: '#f7fafc',
                  }}
                >
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowTraceModal(false)}
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ontology Information */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 className="card-title">Ontology Information</h2>
        <div className="grid-2">
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Base Ontologies</h3>
            <ul style={{ paddingLeft: '1.5rem', color: '#4a5568' }}>
              <li><strong>SSN/SOSA</strong> - Semantic Sensor Network Ontology</li>
              <li><strong>SAREF</strong> - Smart Applications Reference Ontology</li>
              <li><strong>IOF-Maint</strong> - Industrial Ontologies Foundry - Maintenance</li>
            </ul>
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Namespaces</h3>
            <ul style={{ paddingLeft: '1.5rem', color: '#4a5568', fontSize: '0.875rem' }}>
              <li><code>upw:</code> http://example.org/upw#</li>
              <li><code>sosa:</code> http://www.w3.org/ns/sosa/</li>
              <li><code>saref:</code> https://saref.etsi.org/core/</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OntologyExplorer;
