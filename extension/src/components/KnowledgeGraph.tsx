import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { SearchResult } from '../types';
import { 
  ZoomIn, ZoomOut, Maximize2, Play, Pause, Search, HelpCircle, 
  ExternalLink, FileText, Tag, BookOpen, ChevronRight,
  TrendingUp, Compass
} from 'lucide-react';

interface Node {
  id: string; // "Doc-{Id}" Or "Kw-{Keyword}"
  label: string;
  type: 'document' | 'keyword';
  radius: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number;
  fy?: number;
  doc?: SearchResult;
  score?: number;
  degree?: number;
}

interface Link {
  source: string;
  target: string;
}

interface KnowledgeGraphProps {
  docs: SearchResult[];
  loadDocuments: () => Promise<void>;
  docsLoading: boolean;
  onOpenInHistory: (doc: SearchResult) => void;
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  docs,
  loadDocuments,
  docsLoading,
  onOpenInHistory
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Viewport States For Panning And Zooming
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(0.95);
  
  // Interactive States
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [draggedNode, setDraggedNode] = useState<Node | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  
  // Settings & Ingestion Filters
  const [physicsEnabled, setPhysicsEnabled] = useState(true);
  const [minTagConnections, setMinTagConnections] = useState<number>(1);
  const [isStable, setIsStable] = useState(false);

  // Keep Track Of Positions Between Filter Toggles To Prevent Node Position Resets
  const positionCache = useRef<Record<string, { x: number; y: number; vx: number; vy: number }>>({});
  const nodeMap = useRef<Record<string, Node>>({});

  // 1. Refresh Documents On Mount
  useEffect(() => {
    loadDocuments();
  }, []);

  // 2. Generate Nodes And Links Based On Documents And Connectivity Filters
  const { nodes, links, stats } = useMemo(() => {
    const initNodes: Node[] = [];
    const initLinks: Link[] = [];
    
    // Map Keywords To Their Frequency And Connected Document IDs
    const kwConnections: Record<string, { keyword: string; docIds: string[]; maxScore: number }> = {};
    const platformDistribution: Record<string, number> = {
      YouTube: 0,
      GitHub: 0,
      Reddit: 0,
      Generic: 0
    };

    docs.forEach(doc => {
      // Track Platform Metrics
      const source = doc.source_type || 'Generic';
      if (source in platformDistribution) {
        platformDistribution[source]++;
      } else {
        platformDistribution.Generic++;
      }

      doc.keywords.forEach(kw => {
        if (!kwConnections[kw.keyword]) {
          kwConnections[kw.keyword] = {
            keyword: kw.keyword,
            docIds: [],
            maxScore: kw.score
          };
        }
        kwConnections[kw.keyword].docIds.push(`doc-${doc.id}`);
        kwConnections[kw.keyword].maxScore = Math.max(kwConnections[kw.keyword].maxScore, kw.score);
      });
    });

    const centerX = 280;
    const centerY = 230;
    let angle = 0;
    const radiusStep = 24;
    let currentRadius = 40;

    // Add Document Nodes
    docs.forEach((doc) => {
      const id = `doc-${doc.id}`;
      let x = centerX + Math.cos(angle) * currentRadius;
      let y = centerY + Math.sin(angle) * currentRadius;
      let vx = 0;
      let vy = 0;

      // Restore Position If Cached
      if (positionCache.current[id]) {
        x = positionCache.current[id].x;
        y = positionCache.current[id].y;
        vx = positionCache.current[id].vx;
        vy = positionCache.current[id].vy;
      }

      initNodes.push({
        id,
        label: doc.title || doc.url || 'Untitled Document',
        type: 'document',
        radius: 13,
        color: '#8b5cf6', // Indigo-Purple
        x,
        y,
        vx,
        vy,
        doc,
        degree: doc.keywords.length
      });

      angle += 0.45;
      currentRadius += radiusStep * 0.12;
    });

    // Reset Spiral Spiral Layout Variables For Keywords
    currentRadius = 60;
    angle = Math.PI / 6;

    // Add Keyword/Tag Nodes If They Pass Connectivity Limits
    Object.values(kwConnections).forEach((kwInfo) => {
      const count = kwInfo.docIds.length;
      if (count < minTagConnections) return; // Filter Out Low Frequency Keywords

      const id = `kw-${kwInfo.keyword}`;
      let x = centerX + Math.cos(angle) * currentRadius;
      let y = centerY + Math.sin(angle) * currentRadius;
      let vx = 0;
      let vy = 0;

      if (positionCache.current[id]) {
        x = positionCache.current[id].x;
        y = positionCache.current[id].y;
        vx = positionCache.current[id].vx;
        vy = positionCache.current[id].vy;
      }

      const nodeRadius = 6 + Math.min(count * 2.2, 15);

      initNodes.push({
        id,
        label: kwInfo.keyword,
        type: 'keyword',
        radius: nodeRadius,
        color: '#14b8a6', // Teal
        x,
        y,
        vx,
        vy,
        score: kwInfo.maxScore,
        degree: count
      });

      angle += 0.55;
      currentRadius += radiusStep * 0.16;
      
      // Establish Links
      kwInfo.docIds.forEach(docId => {
        initLinks.push({
          source: docId,
          target: id
        });
      });
    });

    // Rebuild NodeMap Lookup
    const map: Record<string, Node> = {};
    initNodes.forEach(node => {
      map[node.id] = node;
    });
    nodeMap.current = map;

    // Sort Popular Tags For Stats Panel
    const popularTags = Object.values(kwConnections)
      .sort((a, b) => b.docIds.length - a.docIds.length)
      .slice(0, 5)
      .map(t => ({ keyword: t.keyword, count: t.docIds.length }));

    return {
      nodes: initNodes,
      links: initLinks,
      stats: {
        docCount: docs.length,
        tagCount: Object.keys(kwConnections).length,
        connectionsCount: initLinks.length,
        popularTags,
        platformDistribution
      }
    };
  }, [docs, minTagConnections]);

  // Restart Physics When Layout Changes Or User Toggles MinTagConnections
  useEffect(() => {
    setIsStable(false);
  }, [minTagConnections, docs]);

  // Center Pan Initially
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      setPanX(canvas.width / 2 - 280);
      setPanY(canvas.height / 2 - 230);
    }
  }, [canvasRef.current]);

  // 3. Animation And Force-Directed Physics Simulation Loop
  useEffect(() => {
    let animFrameId: number;

    const runPhysicsTick = () => {
      if (physicsEnabled && !isStable && nodes.length > 0) {
        let totalSpeed = 0;

        // Force A: Node-Node Repulsion (O(N^2))
        for (let i = 0; i < nodes.length; i++) {
          const nodeA = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const nodeB = nodes[j];
            const dx = nodeA.x - nodeB.x;
            const dy = nodeA.y - nodeB.y;
            const distSq = dx * dx + dy * dy + 0.1;
            const dist = Math.sqrt(distSq);

            // Run Repulsion Only If Nodes Are Close To Maintain Clustering
            if (dist < 260) {
              const repulsionStrength = nodeA.type === 'document' && nodeB.type === 'document' ? 450 : 350;
              const force = repulsionStrength / distSq;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;

              if (nodeA.fx === undefined) { nodeA.vx += fx; nodeA.vy += fy; }
              if (nodeB.fx === undefined) { nodeB.vx -= fx; nodeB.vy -= fy; }
            }
          }
        }

        // Force B: Link-Attraction Along Edges
        links.forEach(link => {
          const s = nodeMap.current[link.source];
          const t = nodeMap.current[link.target];
          if (!s || !t) return;

          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy + 0.1);

          // Spring Physics: Attractive Force Proportional To Distance Difference
          const targetDist = 75;
          const attractionStrength = 0.038;
          const force = (dist - targetDist) * attractionStrength;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (s.fx === undefined) { s.vx += fx; s.vy += fy; }
          if (t.fx === undefined) { t.vx -= fx; t.vy -= fy; }
        });

        // Center Constraints, Damping, And Integration
        const centerX = 280;
        const centerY = 230;
        const gravityStrength = 0.015;
        const damping = 0.81;

        nodes.forEach(node => {
          if (node.fx !== undefined && node.fy !== undefined) {
            node.x = node.fx;
            node.y = node.fy;
            node.vx = 0;
            node.vy = 0;
            return;
          }

          // Force C: Gentle Gravity Towards Virtual Center
          node.vx += (centerX - node.x) * gravityStrength;
          node.vy += (centerY - node.y) * gravityStrength;

          // Apply Friction Damping
          node.vx *= damping;
          node.vy *= damping;

          // Velocity Capping
          const velocity = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
          if (velocity > 8) {
            node.vx = (node.vx / velocity) * 8;
            node.vy = (node.vy / velocity) * 8;
          }

          // Move Node Position
          node.x += node.vx;
          node.y += node.vy;

          // Persist Coordinates In Cache
          positionCache.current[node.id] = {
            x: node.x,
            y: node.y,
            vx: node.vx,
            vy: node.vy
          };

          totalSpeed += Math.abs(node.vx) + Math.abs(node.vy);
        });

        // Stabilize Simulation Once Cumulative Velocities Fall Below Threshold
        if (totalSpeed < 0.12) {
          setIsStable(true);
        }
      }

      // Draw Onto Context
      renderCanvas();
      animFrameId = requestAnimationFrame(runPhysicsTick);
    };

    animFrameId = requestAnimationFrame(runPhysicsTick);
    return () => cancelAnimationFrame(animFrameId);
  }, [nodes, links, physicsEnabled, isStable, panX, panY, zoom, hoveredNode, selectedNode]);

  // 4. HTML5 Canvas Renderer
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Support Device Pixel Ratio For High DPI Displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.save();
    // Panning / Zoom Transformations
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Bipartite Styling Logic Based On Hovered Or Selected Nodes
    const activeFocus = hoveredNode || selectedNode;
    
    const isNodeConnected = (nodeId: string) => {
      if (!activeFocus) return true;
      if (activeFocus.id === nodeId) return true;
      return links.some(l => 
        (l.source === activeFocus.id && l.target === nodeId) ||
        (l.target === activeFocus.id && l.source === nodeId)
      );
    };

    // Draw Connection Lines
    links.forEach(link => {
      const source = nodeMap.current[link.source];
      const target = nodeMap.current[link.target];
      if (!source || !target) return;

      const sourceFocused = isNodeConnected(source.id);
      const targetFocused = isNodeConnected(target.id);
      
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);

      if (activeFocus && sourceFocused && targetFocused) {
        ctx.strokeStyle = activeFocus.type === 'document' ? 'rgba(167, 139, 250, 0.7)' : 'rgba(45, 212, 191, 0.7)';
        ctx.lineWidth = 2.0;
      } else if (activeFocus) {
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
        ctx.lineWidth = 0.8;
      } else {
        ctx.strokeStyle = 'rgba(75, 85, 99, 0.18)';
        ctx.lineWidth = 1.1;
      }
      ctx.stroke();
    });

    // Draw Nodes
    nodes.forEach(node => {
      const isFocused = isNodeConnected(node.id);
      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;

      let opacity = 1.0;
      if (activeFocus) {
        opacity = isFocused ? 1.0 : 0.12;
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);

      if (node.type === 'document') {
        const gradient = ctx.createRadialGradient(node.x, node.y, 2, node.x, node.y, node.radius);
        gradient.addColorStop(0, `rgba(167, 139, 250, ${opacity})`);
        gradient.addColorStop(1, `rgba(109, 40, 217, ${opacity})`);
        ctx.fillStyle = gradient;
        ctx.strokeStyle = isSelected 
          ? `rgba(255, 255, 255, ${opacity})` 
          : `rgba(139, 92, 246, ${opacity * 0.75})`;
        ctx.lineWidth = isSelected ? 3 : 1.5;
      } else {
        const gradient = ctx.createRadialGradient(node.x, node.y, 1, node.x, node.y, node.radius);
        gradient.addColorStop(0, `rgba(45, 212, 191, ${opacity})`);
        gradient.addColorStop(1, `rgba(13, 148, 136, ${opacity})`);
        ctx.fillStyle = gradient;
        ctx.strokeStyle = isSelected 
          ? `rgba(255, 255, 255, ${opacity})` 
          : `rgba(20, 184, 166, ${opacity * 0.65})`;
        ctx.lineWidth = isSelected ? 2.5 : 1.2;
      }

      // Add Soft Box Shadows For Active Nodes
      if (isHovered || isSelected) {
        ctx.shadowColor = node.type === 'document' ? '#a78bfa' : '#2dd4bf';
        ctx.shadowBlur = 14;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Document Symbol Dot
      if (node.type === 'document') {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.85})`;
        ctx.fill();
      }

      // Text Labels
      const showLabel = isHovered || isSelected || isFocused || zoom > 1.25 || node.type === 'document';
      if (showLabel) {
        ctx.fillStyle = node.type === 'document' 
          ? `rgba(243, 244, 246, ${opacity})` 
          : `rgba(156, 163, 175, ${opacity})`;
        ctx.font = isHovered || isSelected 
          ? 'bold 9px system-ui, sans-serif' 
          : '500 8.5px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const rawLabel = node.label;
        const textLabel = rawLabel.length > 20 ? rawLabel.slice(0, 17) + '...' : rawLabel;
        ctx.fillText(textLabel, node.x, node.y + node.radius + 4);
      }
    });

    ctx.restore();
  };

  // 5. Screen Space Coordinate Translation Helpers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const mouseWorldX = (clientX - panX) / zoom;
    const mouseWorldY = (clientY - panY) / zoom;

    // Detect If Clicking A Node
    let clicked: Node | null = null;
    for (const node of nodes) {
      const dx = node.x - mouseWorldX;
      const dy = node.y - mouseWorldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < (node.radius / zoom) + 8) {
        clicked = node;
        break;
      }
    }

    if (clicked) {
      setDraggedNode(clicked);
      setSelectedNode(clicked);
      clicked.fx = clicked.x;
      clicked.fy = clicked.y;
      
      // Pull Camera View To Focus Node Smoothly
      smoothFocusOnNode(clicked);
    } else {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const mouseWorldX = (clientX - panX) / zoom;
    const mouseWorldY = (clientY - panY) / zoom;

    if (draggedNode) {
      draggedNode.fx = mouseWorldX;
      draggedNode.fy = mouseWorldY;
      draggedNode.x = mouseWorldX;
      draggedNode.y = mouseWorldY;
      setIsStable(false); // Keep Physics Alive During Drag
    } else if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPanX(prev => prev + dx);
      setPanY(prev => prev + dy);
      setPanStart({ x: e.clientX, y: e.clientY });
    } else {
      // Find Hovered Node
      let hover: Node | null = null;
      for (const node of nodes) {
        const dx = node.x - mouseWorldX;
        const dy = node.y - mouseWorldY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < node.radius) {
          hover = node;
          break;
        }
      }
      setHoveredNode(hover);
    }
  };

  const handleMouseUp = () => {
    if (draggedNode) {
      draggedNode.fx = undefined;
      draggedNode.fy = undefined;
      setDraggedNode(null);
    }
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const zoomStep = 1.08;
    const nextZoom = e.deltaY < 0 ? zoom * zoomStep : zoom / zoomStep;
    const clampedZoom = Math.max(0.2, Math.min(nextZoom, 3.5));

    setPanX(prev => clientX - (clientX - prev) * (clampedZoom / zoom));
    setPanY(prev => clientY - (clientY - prev) * (clampedZoom / zoom));
    setZoom(clampedZoom);
  };

  // Smooth Focus (Panning Easing Transition)
  const smoothFocusOnNode = (node: Node) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const targetZoom = 1.25;
    const targetPanX = (canvas.width / (2 * (window.devicePixelRatio || 1))) - node.x * targetZoom;
    const targetPanY = (canvas.height / (2 * (window.devicePixelRatio || 1))) - node.y * targetZoom;

    let startFrame = 0;
    const frames = 18;

    const ease = () => {
      startFrame++;
      const t = startFrame / frames;
      // EaseInOutQuad
      const factor = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      setZoom(prev => prev + (targetZoom - prev) * factor);
      setPanX(prev => prev + (targetPanX - prev) * factor);
      setPanY(prev => prev + (targetPanY - prev) * factor);

      if (startFrame < frames) {
        requestAnimationFrame(ease);
      }
    };

    requestAnimationFrame(ease);
  };

  // Zoom Control Buttons
  const handleZoom = (direction: 'in' | 'out') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const centerWidth = canvas.width / (2 * (window.devicePixelRatio || 1));
    const centerHeight = canvas.height / (2 * (window.devicePixelRatio || 1));
    
    const factor = direction === 'in' ? 1.25 : 0.8;
    const nextZoom = zoom * factor;
    const clampedZoom = Math.max(0.2, Math.min(nextZoom, 3.5));

    setPanX(prev => centerWidth - (centerWidth - prev) * (clampedZoom / zoom));
    setPanY(prev => centerHeight - (centerHeight - prev) * (clampedZoom / zoom));
    setZoom(clampedZoom);
  };

  const handleResetView = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setZoom(0.95);
    setPanX(canvas.width / (2 * (window.devicePixelRatio || 1)) - 280);
    setPanY(canvas.height / (2 * (window.devicePixelRatio || 1)) - 230);
  };

  // Execute Graph Queries
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const queryLower = searchQuery.toLowerCase();
    const found = nodes.find(n => n.label.toLowerCase().includes(queryLower));

    if (found) {
      setSelectedNode(found);
      smoothFocusOnNode(found);
    }
  };

  // Click Handler From Node Lists
  const handleNodeClick = (nodeId: string) => {
    const node = nodeMap.current[nodeId];
    if (node) {
      setSelectedNode(node);
      smoothFocusOnNode(node);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden w-full h-full bg-[#07080c] select-none text-gray-200">
      {/* Graph Area */}
      <div className="flex-1 relative flex flex-col min-w-0 bg-[#07080c] border-r border-gray-900/60 h-full">
        {/* Loader */}
        {docsLoading && (
          <div className="absolute inset-0 bg-[#07080c]/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Syncing Knowledge Graph...</span>
            </div>
          </div>
        )}
        {/* Floating Toolbar and Search */}
        <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2 max-w-[calc(100%-2rem)]">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center shrink-0">
            <Search className="absolute left-2.5 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search graph..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 px-3 py-1.5 pl-8 text-xs bg-[#10111a]/95 border border-gray-800 rounded-lg text-gray-200 focus:outline-none focus:border-purple-500/85 transition-colors placeholder:text-gray-600"
            />
          </form>

          {/* Filtering options */}
          <div className="flex items-center gap-1.5 px-2 bg-[#10111a]/95 border border-gray-800 rounded-lg shrink-0">
            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Declutter</span>
            <button
              onClick={() => setMinTagConnections(prev => prev === 1 ? 2 : 1)}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded cursor-pointer transition-colors ${
                minTagConnections > 1 
                  ? 'bg-purple-900/50 border border-purple-500/30 text-purple-300' 
                  : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-gray-200'
              }`}
              title="Filter out tags connected to only a single document"
            >
              {minTagConnections > 1 ? 'Shared Tags Only' : 'Show All Tags'}
            </button>
          </div>

          <div className="flex items-center gap-1 bg-[#10111a]/95 border border-gray-800 rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => handleZoom('in')}
              className="p-1 text-gray-400 hover:text-white hover:bg-gray-900 rounded cursor-pointer transition-all"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleZoom('out')}
              className="p-1 text-gray-400 hover:text-white hover:bg-gray-900 rounded cursor-pointer transition-all"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetView}
              className="p-1 text-gray-400 hover:text-white hover:bg-gray-900 rounded cursor-pointer transition-all"
              title="Reset Zoom & Pan"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <div className="w-[1px] h-3.5 bg-gray-800 mx-0.5" />
            <button
              onClick={() => {
                setPhysicsEnabled(prev => !prev);
                setIsStable(false);
              }}
              className={`p-1 rounded cursor-pointer transition-all ${
                physicsEnabled 
                  ? 'text-teal-400 hover:bg-gray-900' 
                  : 'text-rose-400 hover:bg-gray-900'
              }`}
              title={physicsEnabled ? "Pause Simulation Physics" : "Resume Simulation Physics"}
            >
              {physicsEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Legend bar */}
        <div className="absolute bottom-4 left-4 z-10 flex gap-4 px-3 py-1.5 bg-[#10111a]/90 border border-gray-800/80 rounded-lg text-[9px] uppercase tracking-wider font-bold">
          <div className="flex items-center gap-1.5 text-purple-400">
            <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-purple-400 to-purple-600 border border-purple-500/40" />
            Documents
          </div>
          <div className="flex items-center gap-1.5 text-teal-400">
            <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-teal-400 to-teal-600 border border-teal-500/40" />
            Tags / Keywords
          </div>
        </div>

        {/* Physics calculation helper alert */}
        {!physicsEnabled && (
          <div className="absolute top-4 right-4 z-10 px-2 py-1 bg-yellow-950/20 border border-yellow-500/20 rounded text-[9px] font-semibold text-yellow-500/85">
            PHYSICS FROZEN
          </div>
        )}

        {/* Main interactive Graphics Canvas */}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full cursor-grab active:cursor-grabbing bg-[#07080c]"
        />
      </div>

      {/* Details Side panel */}
      <div className="w-80 border-l border-gray-900/60 bg-[#090a0f] p-4 flex flex-col overflow-y-auto shrink-0 select-none">
        {selectedNode ? (
          // Node Selected Pane
          <div className="space-y-5 h-full flex flex-col">
            <div className="flex items-start justify-between">
              <span className={`px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider rounded ${
                selectedNode.type === 'document' 
                  ? 'bg-purple-950/30 border border-purple-500/30 text-purple-400' 
                  : 'bg-teal-950/30 border border-teal-500/30 text-teal-400'
              }`}>
                {selectedNode.type === 'document' ? 'Document Node' : 'Tag Node'}
              </span>
              <button 
                onClick={() => setSelectedNode(null)}
                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors font-semibold"
              >
                Clear Selection
              </button>
            </div>

            {selectedNode.type === 'document' && selectedNode.doc ? (
              // Document Detail Card
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-gray-100 leading-normal line-clamp-3">
                      {selectedNode.doc.title || 'Untitled Webpage'}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-1.5 py-0.5 bg-gray-900 border border-gray-800 text-gray-400 font-mono text-[9px] rounded uppercase tracking-wider">
                        {selectedNode.doc.source_type || 'Generic'}
                      </span>
                      <span className="text-[10px] text-gray-500 truncate max-w-[150px]">
                        {selectedNode.doc.domain}
                      </span>
                    </div>
                  </div>

                  {selectedNode.doc.summary && (
                    <div className="p-3 bg-[#0d0e14] border border-gray-900 rounded-lg space-y-1">
                      <div className="flex items-center gap-1 text-[9px] font-bold text-purple-400 uppercase tracking-wider">
                        <BookOpen className="w-3 h-3" />
                        AI Summary
                      </div>
                      <p className="text-[10px] text-gray-400 leading-relaxed italic">
                        "{selectedNode.doc.summary}"
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <span className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                      <Tag className="w-3.5 h-3.5 text-gray-500" />
                      Extracted Tags
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedNode.doc.keywords.map((kw, i) => (
                        <button
                          key={i}
                          onClick={() => handleNodeClick(`kw-${kw.keyword}`)}
                          className="flex items-center gap-1 px-2 py-0.5 bg-gray-900 border border-gray-800 hover:border-teal-500/35 hover:bg-[#0c0d13] text-[9.5px] rounded transition-all cursor-pointer text-gray-400 hover:text-teal-400"
                        >
                          {kw.keyword}
                          <span className="text-[8px] opacity-50">{(kw.score * 100).toFixed(0)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-gray-900">
                  <a
                    href={selectedNode.doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-gray-900 border border-gray-800 hover:bg-gray-850 hover:text-white text-[10px] font-bold text-gray-300 rounded transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Visit Original Webpage
                  </a>

                  <button
                    onClick={() => selectedNode.doc && onOpenInHistory(selectedNode.doc)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-purple-600 hover:bg-purple-700 hover:border-purple-500 text-[10px] font-bold text-white rounded cursor-pointer transition-all active:scale-[0.98]"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Open in Document Memory
                  </button>
                </div>
              </div>
            ) : (
              // Keyword Detail Card
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-teal-400 flex items-center gap-1.5">
                      <Tag className="w-4 h-4" />
                      #{selectedNode.label}
                    </h3>
                    <p className="text-[10px] text-gray-500 leading-normal">
                      Connected to <span className="text-gray-300 font-bold">{selectedNode.degree}</span> document{selectedNode.degree !== 1 && 's'} in MindCache memory.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">
                      Connected Documents
                    </span>
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                      {links
                        .filter(l => l.target === selectedNode.id)
                        .map(l => nodeMap.current[l.source])
                        .filter(Boolean)
                        .map((docNode, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleNodeClick(docNode.id)}
                            className="w-full text-left p-2 bg-[#0c0d14] border border-gray-900 hover:border-purple-500/40 rounded flex items-start gap-2 group cursor-pointer transition-all"
                          >
                            <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform" />
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] font-semibold text-gray-300 group-hover:text-white transition-colors block line-clamp-2 leading-snug">
                                {docNode.label}
                              </span>
                              <span className="text-[8.5px] text-gray-600 block truncate mt-0.5">
                                {docNode.doc?.domain}
                              </span>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-gray-700 mt-1 shrink-0 group-hover:text-gray-400 transition-colors" />
                          </button>
                        ))}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-teal-950/15 border border-teal-900/30 rounded-lg text-[9px] text-teal-400/90 leading-normal">
                  <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-teal-400" />
                    Keyword Power
                  </div>
                  This node links multiple documents. Higher scores indicate strong semantic relevance in your search space.
                </div>
              </div>
            )}
          </div>
        ) : (
          // Default Stats Panel When No Node Is Selected
          <div className="space-y-5 flex-1 flex flex-col justify-between">
            <div className="space-y-5">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-gray-100 uppercase tracking-wider flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-purple-400" />
                  Graph Intelligence
                </h3>
                <span className="text-[10px] text-gray-500 block leading-tight">
                  Visual semantic relationship network of your local cognitive memory library.
                </span>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-[#0c0d14] border border-gray-900 rounded-lg">
                  <span className="text-[8px] font-bold text-gray-600 uppercase tracking-wider block">Documents</span>
                  <span className="text-sm font-extrabold text-purple-300 font-mono mt-0.5 block">{stats.docCount}</span>
                </div>
                <div className="p-2.5 bg-[#0c0d14] border border-gray-900 rounded-lg">
                  <span className="text-[8px] font-bold text-gray-600 uppercase tracking-wider block">Keywords</span>
                  <span className="text-sm font-extrabold text-teal-300 font-mono mt-0.5 block">{stats.tagCount}</span>
                </div>
              </div>

              {/* Popular Tags */}
              <div className="space-y-2">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">
                  Top Topics
                </span>
                <div className="space-y-1.5">
                  {stats.popularTags.length > 0 ? (
                    stats.popularTags.map((tag, i) => (
                      <button
                        key={i}
                        onClick={() => handleNodeClick(`kw-${tag.keyword}`)}
                        className="w-full flex items-center justify-between p-2 bg-[#0c0d14] border border-gray-900/60 hover:border-teal-500/30 rounded text-[9.5px] cursor-pointer transition-all text-gray-400 hover:text-teal-400 group"
                      >
                        <span className="font-semibold block truncate">#{tag.keyword}</span>
                        <span className="font-mono text-[9px] bg-teal-950/20 px-1.5 py-0.5 rounded text-teal-400 border border-teal-500/10 group-hover:border-teal-500/30">
                          {tag.count} link{tag.count !== 1 && 's'}
                        </span>
                      </button>
                    ))
                  ) : (
                    <span className="text-[10px] text-gray-600 italic block">No keywords generated yet.</span>
                  )}
                </div>
              </div>

              {/* Source breakdown distribution */}
              <div className="space-y-2">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">
                  Sources Breakdown
                </span>
                <div className="space-y-2 p-3 bg-[#0c0d14] border border-gray-900/70 rounded-lg text-[9.5px]">
                  {Object.entries(stats.platformDistribution).map(([platform, count], idx) => {
                    const pct = stats.docCount > 0 ? (count / stats.docCount) * 100 : 0;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-gray-400 text-[8.5px] font-semibold">
                          <span>{platform}</span>
                          <span className="font-mono text-gray-500">{count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-gray-900 h-1.5 rounded overflow-hidden">
                          <div 
                            className="bg-purple-600 h-full rounded transition-all duration-500" 
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#0d0e14] border border-gray-900 rounded-lg space-y-1.5">
              <span className="flex items-center gap-1 text-[9px] font-bold text-purple-400 uppercase tracking-wider">
                <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
                Exploration Tip
              </span>
              <p className="text-[9px] text-gray-500 leading-normal">
                Click a node to highlight its neighborhood and review summary content. Scroll to zoom and drag nodes to adjust the spring layout dynamics.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default KnowledgeGraph;
