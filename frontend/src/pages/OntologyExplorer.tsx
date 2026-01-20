import React, { useEffect, useState, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { ontologyApi } from '../services/api';
import type { OntologyClass } from '../types';

// Node colors by type
const NODE_COLORS: Record<string, string> = {
  'equipment': '#3498db',
  'sensor': '#2ecc71',
  'area': '#9b59b6',
  'maintenance': '#e67e22',
  'anomaly': '#e74c3c',
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
  source: string;
  target: string;
  type: string;
}

interface ForceGraphData {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
}

const OntologyExplorer: React.FC = () => {
  const [classes, setClasses] = useState<OntologyClass[]>([]);
  const [graphData, setGraphData] = useState<ForceGraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<ForceGraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set());
  const [hoverNode, setHoverNode] = useState<ForceGraphNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const graphRef = useRef<any>();
  const graphContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [classesRes, graphRes] = await Promise.all([
          ontologyApi.getClasses(),
          ontologyApi.getGraph(),
        ]);

        if (classesRes.status === 'success' && classesRes.data) {
          setClasses(classesRes.data);
        }
        if (graphRes.status === 'success' && graphRes.data) {
          // Transform data for force graph
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

          setGraphData({ nodes, links });
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

  // Handle node click
  const handleNodeClick = useCallback((node: ForceGraphNode) => {
    setSelectedNode(node);

    // Highlight connected nodes and links
    const connectedNodes = new Set<string>();
    const connectedLinks = new Set<string>();

    connectedNodes.add(node.id);

    graphData.links.forEach((link) => {
      const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
      const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;

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

    // Center on node
    if (graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 500);
      graphRef.current.zoom(2, 500);
    }
  }, [graphData.links]);

  // Handle node hover
  const handleNodeHover = useCallback((node: ForceGraphNode | null) => {
    setHoverNode(node);
  }, []);

  // Handle background click to clear selection
  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
  }, []);

  // Node canvas drawing
  const drawNode = useCallback((node: ForceGraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.name || node.id;
    const fontSize = 12 / globalScale;
    const nodeColor = NODE_COLORS[node.nodeType] || NODE_COLORS.other;
    const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
    const isHovered = hoverNode?.id === node.id;
    const isSelected = selectedNode?.id === node.id;

    // Node circle
    const radius = isHovered ? 12 : (isSelected ? 11 : 9);

    // Draw shadow for depth
    ctx.beginPath();
    ctx.arc(node.x!, node.y!, radius + 2, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fill();

    // Main node circle
    ctx.beginPath();
    ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);
    ctx.fillStyle = isHighlighted ? nodeColor : `${nodeColor}60`;
    ctx.fill();

    // Node border
    ctx.strokeStyle = isSelected ? '#e74c3c' : (isHovered ? '#2c3e50' : nodeColor);
    ctx.lineWidth = (isSelected || isHovered) ? 3 / globalScale : 2 / globalScale;
    ctx.stroke();

    // Label background for readability
    if (globalScale > 0.5 || isHovered || isSelected) {
      const labelText = label.substring(0, 18);
      ctx.font = `bold ${fontSize}px Sans-Serif`;
      const textWidth = ctx.measureText(labelText).width;

      // Background rectangle
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(
        node.x! - textWidth / 2 - 3,
        node.y! + radius + 2,
        textWidth + 6,
        fontSize + 4
      );

      // Label text
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isHighlighted ? '#2c3e50' : '#7f8c8d';
      ctx.fillText(labelText, node.x!, node.y! + radius + 4);
    }
  }, [highlightNodes, hoverNode, selectedNode]);

  // Link canvas drawing
  const drawLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    const linkId = `${sourceId}-${targetId}`;
    const isHighlighted = highlightLinks.size === 0 || highlightLinks.has(linkId);

    // Draw link line
    ctx.strokeStyle = isHighlighted ? '#5a6c7d' : '#bdc3c7';
    ctx.lineWidth = isHighlighted ? 2 : 1;

    ctx.beginPath();
    ctx.moveTo(link.source.x, link.source.y);
    ctx.lineTo(link.target.x, link.target.y);
    ctx.stroke();

    // Draw arrow
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
    ctx.lineTo(arrowX + arrowSize * Math.cos(angle + 2.5), arrowY + arrowSize * Math.sin(angle + 2.5));
    ctx.lineTo(arrowX + arrowSize * Math.cos(angle - 2.5), arrowY + arrowSize * Math.sin(angle - 2.5));
    ctx.closePath();
    ctx.fill();

    // Link label
    if (isHighlighted && globalScale > 0.8) {
      const midX = (link.source.x + link.target.x) / 2;
      const midY = (link.source.y + link.target.y) / 2;
      const fontSize = 10 / globalScale;

      // Label background
      ctx.font = `${fontSize}px Sans-Serif`;
      const textWidth = ctx.measureText(link.type).width;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(midX - textWidth / 2 - 2, midY - fontSize / 2 - 1, textWidth + 4, fontSize + 2);

      // Label text
      ctx.fillStyle = '#5a6c7d';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(link.type, midX, midY);
    }
  }, [highlightLinks]);

  // Group classes by category
  const groupedClasses = classes.reduce((acc, cls) => {
    let category = 'Other';
    const name = cls.name.toLowerCase();
    if (name.includes('sensor') || name.includes('meter')) {
      category = 'Sensors';
    } else if (name.includes('equipment') || name.includes('pump') || name.includes('filter') ||
               name.includes('osmosis') || name.includes('sterilizer') || name.includes('tank')) {
      category = 'Equipment';
    } else if (name.includes('maintenance') || name.includes('failure')) {
      category = 'Maintenance';
    } else if (name.includes('area') || name.includes('process')) {
      category = 'Process Areas';
    } else if (name.includes('observation')) {
      category = 'Observations';
    } else if (name.includes('anomaly')) {
      category = 'Anomalies';
    }

    if (!acc[category]) acc[category] = [];
    acc[category].push(cls);
    return acc;
  }, {} as Record<string, OntologyClass[]>);

  // Zoom controls
  const handleZoomIn = () => graphRef.current?.zoom(graphRef.current.zoom() * 1.5, 300);
  const handleZoomOut = () => graphRef.current?.zoom(graphRef.current.zoom() / 1.5, 300);
  const handleZoomReset = () => {
    graphRef.current?.zoomToFit(400, 50);
    setSelectedNode(null);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
  };

  // Fullscreen toggle (CSS-based for better compatibility)
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      const newState = !prev;
      // Re-center graph after state change
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 80);
      }, 100);
      return newState;
    });
  }, []);

  // Listen for ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        setTimeout(() => {
          graphRef.current?.zoomToFit(400, 80);
        }, 100);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Center graph when data loads
  useEffect(() => {
    if (graphData.nodes.length > 0 && graphRef.current) {
      // Wait for simulation to settle, then center
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 80);
      }, 500);
    }
  }, [graphData.nodes.length]);

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

      {/* Stats Overview */}
      <div className="grid-4">
        <div className="stat-card">
          <div className="stat-value">{classes.length}</div>
          <div className="stat-label">Node Types</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{graphData.nodes.length}</div>
          <div className="stat-label">Graph Nodes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{graphData.links.length}</div>
          <div className="stat-label">Relationships</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Object.keys(groupedClasses).length}</div>
          <div className="stat-label">Categories</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem' }}>
        {/* Left Sidebar - Node Types & Selected Node Info */}
        <div>
          {/* Legend */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2 className="card-title">Node Types</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {Object.entries(NODE_COLORS).map(([type, color]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor: color,
                  }} />
                  <span style={{ textTransform: 'capitalize', fontSize: '0.875rem' }}>{type}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Node Info */}
          {selectedNode && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <h2 className="card-title">Selected Node</h2>
              <div style={{ fontSize: '0.875rem' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Name:</strong> {selectedNode.name}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Type:</strong>{' '}
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: NODE_COLORS[selectedNode.nodeType] || NODE_COLORS.other,
                    color: 'white',
                    fontSize: '0.75rem',
                    textTransform: 'capitalize',
                  }}>
                    {selectedNode.nodeType}
                  </span>
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Labels:</strong> {selectedNode.labels.join(', ')}
                </div>
                {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                  <div>
                    <strong>Properties:</strong>
                    <div style={{
                      marginTop: '0.25rem',
                      padding: '0.5rem',
                      backgroundColor: '#f7fafc',
                      borderRadius: '4px',
                      maxHeight: '200px',
                      overflow: 'auto',
                    }}>
                      {Object.entries(selectedNode.properties).slice(0, 10).map(([key, value]) => (
                        <div key={key} style={{ marginBottom: '0.25rem' }}>
                          <span style={{ color: '#718096' }}>{key}:</span>{' '}
                          <span>{String(value).substring(0, 30)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="card">
            <h2 className="card-title">Controls</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.5rem' }}>Zoom</div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={handleZoomIn} className="btn btn-sm" title="Zoom In">+</button>
                  <button onClick={handleZoomOut} className="btn btn-sm" title="Zoom Out">-</button>
                  <button onClick={handleZoomReset} className="btn btn-sm" title="Fit to View">Fit</button>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.5rem' }}>View</div>
                <button
                  onClick={toggleFullscreen}
                  className="btn btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                  title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                </button>
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
              <div>- Drag nodes to move</div>
              <div>- Click node to select</div>
              <div>- Scroll to zoom</div>
              <div>- Drag background to pan</div>
            </div>
          </div>
        </div>

        {/* Graph Visualization */}
        <div
          ref={graphContainerRef}
          style={{
            position: isFullscreen ? 'fixed' : 'relative',
            top: isFullscreen ? 0 : 'auto',
            left: isFullscreen ? 0 : 'auto',
            overflow: 'hidden',
            backgroundColor: '#f8fafc',
            borderRadius: isFullscreen ? '0' : '12px',
            padding: isFullscreen ? '0' : '1.5rem',
            boxShadow: isFullscreen ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.08)',
            height: isFullscreen ? '100vh' : 'auto',
            width: isFullscreen ? '100vw' : 'auto',
            zIndex: isFullscreen ? 9999 : 'auto',
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: isFullscreen ? '0.75rem 1rem' : '0',
            marginBottom: isFullscreen ? '0' : '0.5rem',
            backgroundColor: isFullscreen ? 'rgba(255,255,255,0.98)' : 'transparent',
            borderBottom: isFullscreen ? '1px solid #e2e8f0' : 'none',
            position: isFullscreen ? 'absolute' : 'relative',
            top: 0,
            left: 0,
            right: 0,
            zIndex: isFullscreen ? 10 : 'auto',
          }}>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Graph Visualization</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {isFullscreen && (
                <>
                  <button onClick={handleZoomIn} className="btn btn-sm" title="Zoom In">+</button>
                  <button onClick={handleZoomOut} className="btn btn-sm" title="Zoom Out">-</button>
                  <button onClick={handleZoomReset} className="btn btn-sm" title="Fit to View">Fit</button>
                  <button
                    onClick={toggleFullscreen}
                    className="btn btn-sm"
                    style={{ background: '#e53e3e', color: 'white', marginLeft: '1rem' }}
                  >
                    Exit Fullscreen (ESC)
                  </button>
                </>
              )}
            </div>
          </div>
          <div style={{
            height: isFullscreen ? '100vh' : '600px',
            width: isFullscreen ? '100vw' : '100%',
            backgroundColor: '#f8fafc',
            borderRadius: isFullscreen ? '0' : '8px',
            overflow: 'hidden',
            border: isFullscreen ? 'none' : '1px solid #e2e8f0',
          }}>
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
                onEngineStop={() => {
                  // Center graph after simulation settles
                  graphRef.current?.zoomToFit(400, 80);
                }}
              />
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#718096',
              }}>
                No graph data available
              </div>
            )}
          </div>
        </div>
      </div>

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
