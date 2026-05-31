import React, { useRef, useEffect, useState, useMemo } from "react";
import { DocumentResponse } from "../types";
import { 
  Globe, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Sliders, 
  Trash2, 
  ExternalLink, 
  FileText, 
  Hash, 
  Calendar, 
  Clock, 
  Filter, 
  X,
  Play,
  RotateCcw,
  Cpu,
  Building2,
  User,
  FolderKanban
} from "lucide-react";

interface Node {
  id: string; // "doc_123", "kw_react", or "ent_google"
  label: string;
  type: "document" | "keyword" | "entity";
  url?: string;
  domain?: string;
  updatedAt?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  originalColor: string;
  visitCount?: number;
  entityType?: string; // Person, Company, Technology, Project
}

interface Link {
  source: string;
  target: string;
  value?: number;
  type?: "keyword" | "entity" | "co_occurs";
}

interface InteractiveKnowledgeGraphProps {
  documents: DocumentResponse[];
  onDocumentClick: (id: number) => void;
  onDeleteDocument: (id: number) => void;
}

// Domain-based coloring hashing helper
const getDomainColor = (domain: string): string => {
  if (!domain) return "#3b82f6";
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 75%, 55%)`;
};

// Entity type color mapping
const getEntityColor = (entityType: string): string => {
  const typeLower = entityType?.toLowerCase() || "";
  if (typeLower.includes("person")) return "#f59e0b"; // amber-500
  if (typeLower.includes("company") || typeLower.includes("organization")) return "#10b981"; // emerald-500
  if (typeLower.includes("technology") || typeLower.includes("language") || typeLower.includes("library")) return "#8b5cf6"; // violet-500
  if (typeLower.includes("project")) return "#ec4899"; // pink-500
  return "#6366f1"; // indigo-500 default
};

// Entity type icon helper
const getEntityIcon = (entityType: string) => {
  const typeLower = entityType?.toLowerCase() || "";
  if (typeLower.includes("person")) return User;
  if (typeLower.includes("company") || typeLower.includes("organization")) return Building2;
  if (typeLower.includes("technology") || typeLower.includes("language") || typeLower.includes("library")) return Cpu;
  if (typeLower.includes("project")) return FolderKanban;
  return Cpu;
};



export const InteractiveKnowledgeGraph: React.FC<InteractiveKnowledgeGraphProps> = ({
  documents,
  onDocumentClick,
  onDeleteDocument,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Layout and simulation states
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [draggedNode, setDraggedNode] = useState<Node | null>(null);

  // Zoom & Pan states
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [scale, setScale] = useState(1);
  const isDraggingCanvas = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Filtering configurations
  const [searchQuery, setSearchQuery] = useState("");
  const [maxDocs, setMaxDocs] = useState(50);
  const [minKwFrequency, setMinKwFrequency] = useState(2);
  const [colorMode, setColorMode] = useState<"type" | "domain" | "recency">("domain");
  const [timeFilter, setTimeFilter] = useState<"all" | "day" | "week" | "month">("all");
  
  // Physics parameters configurations
  const [physicsRepulsion, setPhysicsRepulsion] = useState(60);
  const [physicsLinkDist, setPhysicsLinkDist] = useState(55);
  const [physicsGravity, setPhysicsGravity] = useState(0.001);
  const [showPhysicsConfig, setShowPhysicsConfig] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Responsive dimensions
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Sidebar details state
  const selectedDocDetails = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "document") return null;
    const docId = parseInt(selectedNode.id.split("_")[1], 10);
    return documents.find((doc) => doc.id === docId) || null;
  }, [selectedNode, documents]);

  const selectedKwDetails = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "keyword") return null;
    const kw = selectedNode.label;
    
    // Find all documents connected to this keyword
    const relatedDocs = documents.filter((doc) =>
      doc.keywords.some((k) => k.keyword.toLowerCase() === kw.toLowerCase())
    );
    
    return {
      keyword: kw,
      count: relatedDocs.length,
      documents: relatedDocs,
    };
  }, [selectedNode, documents]);

  const selectedEntDetails = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "entity") return null;
    const entName = selectedNode.label;
    const entType = selectedNode.entityType || "";
    
    // Find all documents connected to this entity
    const relatedDocs = documents.filter((doc) =>
      doc.entities?.some((e) => e.name.toLowerCase() === entName.toLowerCase())
    );
    
    return {
      name: entName,
      type: entType,
      count: relatedDocs.length,
      documents: relatedDocs,
    };
  }, [selectedNode, documents]);

  // Adjust dimensions on mount and resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 550,
        });
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Filter documents based on time recency
  const filteredDocuments = useMemo(() => {
    if (!documents) return [];
    
    let docs = [...documents];

    // Time filter
    if (timeFilter !== "all") {
      const now = new Date();
      const cutoff = new Date();
      if (timeFilter === "day") cutoff.setDate(now.getDate() - 1);
      else if (timeFilter === "week") cutoff.setDate(now.getDate() - 7);
      else if (timeFilter === "month") cutoff.setMonth(now.getMonth() - 1);

      docs = docs.filter((doc) => new Date(doc.updated_at) >= cutoff);
    }

    // Limit document size
    return docs.slice(0, maxDocs);
  }, [documents, maxDocs, timeFilter]);

  // Build the network structures
  useEffect(() => {
    if (filteredDocuments.length === 0) {
      setNodes([]);
      setLinks([]);
      return;
    }

    const width = dimensions.width || 800;
    const height = dimensions.height || 600;

    // Count keywords frequency
    const keywordDocsMap: Record<string, string[]> = {};
    filteredDocuments.forEach((doc) => {
      const docId = `doc_${doc.id}`;
      doc.keywords.forEach((kw) => {
        const kwName = kw.keyword.toLowerCase().trim();
        if (!keywordDocsMap[kwName]) {
          keywordDocsMap[kwName] = [];
        }
        if (!keywordDocsMap[kwName].includes(docId)) {
          keywordDocsMap[kwName].push(docId);
        }
      });
    });

    // Count entities frequency
    const entityDocsMap: Record<string, { type: string; docIds: string[] }> = {};
    filteredDocuments.forEach((doc) => {
      const docId = `doc_${doc.id}`;
      doc.entities?.forEach((ent) => {
        const key = `${ent.type}:${ent.name}`.toLowerCase();
        if (!entityDocsMap[key]) {
          entityDocsMap[key] = { type: ent.type, docIds: [] };
        }
        if (!entityDocsMap[key].docIds.includes(docId)) {
          entityDocsMap[key].docIds.push(docId);
        }
      });
    });

    // Pick top keywords connected to at least `minKwFrequency` documents
    const activeKeywords = Object.entries(keywordDocsMap)
      .filter(([_, docIds]) => docIds.length >= minKwFrequency)
      .map(([name]) => name);

    // Pick entities connected to at least 1 document
    const activeEntities = Object.entries(entityDocsMap)
      .filter(([_, data]) => data.docIds.length >= 1)
      .map(([key, data]) => ({ key, ...data }));

    const newNodes: Node[] = [];
    const newLinks: Link[] = [];
    const nodeMap = new Map<string, Node>();

    // 1. Position documents in circular distribution initially
    filteredDocuments.forEach((doc, idx) => {
      const id = `doc_${doc.id}`;
      const angle = (idx / filteredDocuments.length) * Math.PI * 2;
      const radius = 130 + Math.random() * 40;
      
      let color = "#3b82f6"; // Default blue
      if (colorMode === "domain") {
        color = getDomainColor(doc.domain);
      } else if (colorMode === "recency") {
        // Color-code based on age (newer is brighter, older is darker steel blue)
        const ageInMs = Date.now() - new Date(doc.updated_at).getTime();
        const ageInDays = ageInMs / (1000 * 60 * 60 * 24);
        const intensity = Math.max(25, Math.min(75, 80 - ageInDays * 2));
        color = `hsl(217, 91%, ${intensity}%)`;
      }

      const node: Node = {
        id,
        label: doc.title || doc.url,
        type: "document",
        url: doc.url,
        domain: doc.domain,
        updatedAt: doc.updated_at,
        visitCount: doc.visit_history?.length || 1,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        radius: Math.min(15, 6 + Math.log2(doc.visit_history?.length || 1) * 2), // larger radius for highly visited docs
        color,
        originalColor: color,
      };

      newNodes.push(node);
      nodeMap.set(id, node);
    });

    // 2. Position keyword nodes and build links
    activeKeywords.forEach((kw) => {
      const kwId = `kw_${kw}`;
      const docIds = keywordDocsMap[kw];

      // Insert keyword node if not exists
      if (!nodeMap.has(kwId)) {
        const kwNode: Node = {
          id: kwId,
          label: kw,
          type: "keyword",
          x: width / 2 + (Math.random() - 0.5) * 220,
          y: height / 2 + (Math.random() - 0.5) * 220,
          vx: 0,
          vy: 0,
          radius: Math.min(10, 4 + Math.log2(docIds.length) * 1.5), // larger radius if connected to many docs
          color: "#71717a", // zinc-500
          originalColor: "#71717a",
        };
        newNodes.push(kwNode);
        nodeMap.set(kwId, kwNode);
      }

      // Link doc to keyword
      docIds.forEach((docId) => {
        if (nodeMap.has(docId)) {
          newLinks.push({
            source: docId,
            target: kwId,
            value: 1,
            type: "keyword",
          });
        }
      });
    });

    // 3. Position entity nodes and build links
    activeEntities.forEach((ent) => {
      const entId = `ent_${ent.key.replace(/[^a-z0-9]/g, "_")}`;
      const entityColor = getEntityColor(ent.type);

      // Insert entity node if not exists
      if (!nodeMap.has(entId)) {
        const entNode: Node = {
          id: entId,
          label: ent.key.split(":")[1] || ent.key, // Extract name from "type:name"
          type: "entity",
          entityType: ent.type,
          x: width / 2 + (Math.random() - 0.5) * 180,
          y: height / 2 + (Math.random() - 0.5) * 180,
          vx: 0,
          vy: 0,
          radius: Math.min(12, 5 + Math.log2(ent.docIds.length) * 2),
          color: entityColor,
          originalColor: entityColor,
        };
        newNodes.push(entNode);
        nodeMap.set(entId, entNode);
      }

      // Link doc to entity
      ent.docIds.forEach((docId) => {
        if (nodeMap.has(docId)) {
          newLinks.push({
            source: docId,
            target: entId,
            value: 1,
            type: "entity",
          });
        }
      });
    });

    setNodes(newNodes);
    setLinks(newLinks);
    
    // Clear selections if nodes went away
    if (selectedNode) {
      const stillExists = newNodes.some((n) => n.id === selectedNode.id);
      if (!stillExists) setSelectedNode(null);
    }
  }, [filteredDocuments, minKwFrequency, colorMode, dimensions.width, dimensions.height]);

  // Main Canvas render and simulation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const width = dimensions.width;
    const height = dimensions.height;

    // Simulation logic
    const runSimulation = () => {
      if (!isPaused) {
        // 1. Repulsion force between nodes (Charge)
        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            
            // Adjust threshold based on type
            const minDist = n1.type === "keyword" || n2.type === "keyword" ? physicsRepulsion - 15 : physicsRepulsion;

            if (dist < minDist) {
              const force = (minDist - dist) * 0.04;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;

              if (n1 !== draggedNode) { n1.vx -= fx; n1.vy -= fy; }
              if (n2 !== draggedNode) { n2.vx += fx; n2.vy += fy; }
            }
          }
        }

        // 2. Attraction force along links (Gravity pull between linked nodes)
        links.forEach((link) => {
          const n1 = nodes.find((n) => n.id === link.source);
          const n2 = nodes.find((n) => n.id === link.target);
          if (n1 && n2) {
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            
            // Hooke's Law attraction
            const force = (dist - physicsLinkDist) * 0.006;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (n1 !== draggedNode) { n1.vx += fx; n1.vy += fy; }
            if (n2 !== draggedNode) { n2.vx -= fx; n2.vy -= fy; }
          }
        });

        // 3. Central gravity and friction updates
        nodes.forEach((node) => {
          if (node === draggedNode) return;
          
          // Pull toward center of screen
          const dx = width / 2 - node.x;
          const dy = height / 2 - node.y;
          node.vx += dx * physicsGravity;
          node.vy += dy * physicsGravity;

          // Apply velocity and damping
          node.x += node.vx;
          node.y += node.vy;
          node.vx *= 0.82; // damping / drag
          node.vy *= 0.82;

          // Boundaries clamp
          node.x = Math.max(node.radius + 5, Math.min(width - node.radius - 5, node.x));
          node.y = Math.max(node.radius + 5, Math.min(height - node.radius - 5, node.y));
        });
      }

      // Drawing Logic
      ctx.clearRect(0, 0, width, height);

      // Save canvas state
      ctx.save();
      
      // Handle Pan & Zoom
      ctx.translate(panX, panY);
      ctx.scale(scale, scale);

      // Render subtle tech grid background
      drawGrid(ctx);

      // 4. Render Link Edges
      ctx.lineWidth = 0.8;
      links.forEach((link) => {
        const n1 = nodes.find((n) => n.id === link.source);
        const n2 = nodes.find((n) => n.id === link.target);
        if (!n1 || !n2) return;

        // Check highlight states
        const isHighlighted = getLinkHighlightState(n1, n2);
        const isFaded = isAnySelectedOrHovered() && !isHighlighted;

        ctx.beginPath();
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);
        
        if (isHighlighted) {
          ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
          ctx.lineWidth = 1.5;
        } else if (isFaded) {
          ctx.strokeStyle = "rgba(113, 113, 122, 0.03)";
          ctx.lineWidth = 0.5;
        } else {
          ctx.strokeStyle = "rgba(113, 113, 122, 0.12)";
          ctx.lineWidth = 0.8;
        }
        ctx.stroke();

        // 5. Draw flowing particle nodes along edge paths (Cool visual feature)
        if (!isPaused && !isFaded) {
          drawLinkParticles(ctx, n1, n2, isHighlighted);
        }
      });

      // 6. Render Nodes
      nodes.forEach((node) => {
        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredNode?.id === node.id;
        const isMatchingSearch = checkSearchMatch(node);
        
        // Highlight states
        const isRelated = isNodeRelated(node);
        const isFaded = isAnySelectedOrHovered() && !isHovered && !isSelected && !isRelated;

        // Node Opacity based on focus state
        let opacity = 1.0;
        if (searchQuery.trim().length > 0) {
          opacity = isMatchingSearch ? 1.0 : 0.15;
        } else if (isFaded) {
          opacity = 0.18;
        }

        ctx.save();
        ctx.globalAlpha = opacity;

        // Subtle glow filter for hovered/selected nodes
        if (isHovered || isSelected || (isMatchingSearch && searchQuery)) {
          ctx.shadowBlur = 15;
          ctx.shadowColor = node.color;
        }

        // Draw node body
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + (isHovered ? 2.5 : 0), 0, Math.PI * 2);
        
        if (node.type === "document") {
          ctx.fillStyle = node.color;
          ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
          ctx.lineWidth = isSelected ? 3.5 : 1.5;
          ctx.stroke();
        } else if (node.type === "entity") {
          // Entity nodes - diamond shape
          ctx.fillStyle = isSelected ? "#ffffff" : node.color;
          ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          // Keyword
          ctx.fillStyle = isSelected ? "#3b82f6" : node.color;
          ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.fill();
        ctx.restore();

        // 7. Render Node Text Labels
        const shouldShowLabel = 
          isHovered || 
          isSelected || 
          isRelated || 
          isMatchingSearch || 
          scale > 1.3 || 
          (node.type === "document" && node.radius > 11) ||
          (node.type === "entity");

        if (shouldShowLabel) {
          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.font = node.type === "document" 
            ? "500 10.5px Geist, sans-serif" 
            : node.type === "entity"
              ? "500 10px Geist, sans-serif"
              : "9.5px Geist Mono, monospace";
          
          if (isSelected) {
            ctx.fillStyle = "#fafafa";
            ctx.font = "bold 11px Geist, sans-serif";
          } else if (isHovered) {
            ctx.fillStyle = "#fafafa";
          } else {
            ctx.fillStyle = node.type === "document" 
              ? "rgba(250, 250, 250, 0.8)" 
              : node.type === "entity"
                ? "rgba(250, 250, 250, 0.75)"
                : "rgba(161, 161, 170, 0.7)";
          }

          let labelText = node.label;
          // Shorten document titles to fit visually
          if (node.type === "document" && labelText.length > 28) {
            labelText = labelText.substring(0, 25) + "...";
          }
          
          ctx.textAlign = "center";
          ctx.fillText(labelText, node.x, node.y - (node.radius + (isHovered ? 8 : 6)));
          ctx.restore();
        }
      });

      // Restore canvas state
      ctx.restore();

      animationId = requestAnimationFrame(runSimulation);
    };

    // Draw grid background helper
    const drawGrid = (ctx: CanvasRenderingContext2D) => {
      const gridSpacing = 48;
      
      // Back-calculate visible bounds
      const minX = -panX / scale;
      const maxX = (width - panX) / scale;
      const minY = -panY / scale;
      const maxY = (height - panY) / scale;

      const startX = Math.floor(minX / gridSpacing) * gridSpacing;
      const endX = Math.ceil(maxX / gridSpacing) * gridSpacing;
      const startY = Math.floor(minY / gridSpacing) * gridSpacing;
      const endY = Math.ceil(maxY / gridSpacing) * gridSpacing;

      ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
      for (let x = startX; x <= endX; x += gridSpacing) {
        for (let y = startY; y <= endY; y += gridSpacing) {
          ctx.beginPath();
          ctx.arc(x, y, 0.8 / scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    // Render animated moving particles along edge lines
    const drawLinkParticles = (
      ctx: CanvasRenderingContext2D,
      n1: Node,
      n2: Node,
      isHighlighted: boolean
    ) => {
      const t = Date.now();
      const speed = 0.0006;
      // Stagger index logic using nodes coord to get a reproducible index phase
      const phaseOffset = (n1.x + n2.y) % 1.0;
      
      // Calculate particle percentage
      const progress = (t * speed + phaseOffset) % 1.0;

      const px = n1.x + (n2.x - n1.x) * progress;
      const py = n1.y + (n2.y - n1.y) * progress;

      ctx.beginPath();
      ctx.arc(px, py, isHighlighted ? 2 : 1.2, 0, Math.PI * 2);
      ctx.fillStyle = isHighlighted ? "#60a5fa" : "rgba(255, 255, 255, 0.25)";
      ctx.fill();
    };

    // Helpers to evaluate highlights states
    const isAnySelectedOrHovered = () => hoveredNode !== null || selectedNode !== null;

    const getLinkHighlightState = (n1: Node, n2: Node) => {
      if (hoveredNode) {
        return n1.id === hoveredNode.id || n2.id === hoveredNode.id;
      }
      if (selectedNode) {
        return n1.id === selectedNode.id || n2.id === selectedNode.id;
      }
      return false;
    };

    const isNodeRelated = (node: Node) => {
      const active = hoveredNode || selectedNode;
      if (!active) return false;
      if (node.id === active.id) return true;
      
      return links.some(
        (l) => 
          (l.source === node.id && l.target === active.id) || 
          (l.target === node.id && l.source === active.id)
      );
    };

    const checkSearchMatch = (node: Node) => {
      if (!searchQuery.trim()) return false;
      const term = searchQuery.toLowerCase();
      return (
        node.label.toLowerCase().includes(term) ||
        (node.domain && node.domain.toLowerCase().includes(term))
      );
    };

    runSimulation();
    return () => cancelAnimationFrame(animationId);
  }, [nodes, links, hoveredNode, selectedNode, draggedNode, panX, panY, scale, searchQuery, isPaused, dimensions, physicsRepulsion, physicsLinkDist, physicsGravity]);

  // Event handler for canvas mouse moves (Hover check + canvas drag)
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert screen coordinates to world scale coordinates
    const worldX = (mouseX - panX) / scale;
    const worldY = (mouseY - panY) / scale;

    if (draggedNode) {
      draggedNode.x = worldX;
      draggedNode.y = worldY;
      return;
    }

    if (isDraggingCanvas.current) {
      const dx = mouseX - dragStart.current.x;
      const dy = mouseY - dragStart.current.y;
      setPanX((prev) => prev + dx);
      setPanY((prev) => prev + dy);
      dragStart.current = { x: mouseX, y: mouseY };
      return;
    }

    // Hover evaluation check
    let foundNode: Node | null = null;
    for (const node of nodes) {
      const dx = node.x - worldX;
      const dy = node.y - worldY;
      // Hitbox padding for easier hover action on small points
      if (Math.sqrt(dx * dx + dy * dy) < node.radius + 7) {
        foundNode = node;
        break;
      }
    }
    if (foundNode !== hoveredNode) setHoveredNode(foundNode);
  };

  // Mouse clicks handles
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hoveredNode) {
      setDraggedNode(hoveredNode);
    } else {
      isDraggingCanvas.current = true;
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        dragStart.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      }
    }
  };

  const handleMouseUp = () => {
    setDraggedNode(null);
    isDraggingCanvas.current = false;
  };

  const handleMouseLeave = () => {
    setHoveredNode(null);
    setDraggedNode(null);
    isDraggingCanvas.current = false;
  };

  // Click on a node triggers selection and focus
  const handleCanvasClick = () => {
    // Only process click if user didn't drag the canvas a lot
    if (isDraggingCanvas.current) return;
    
    if (hoveredNode) {
      setSelectedNode(hoveredNode);
      
      // Auto center the camera on the selected node
      const canvas = canvasRef.current;
      if (canvas) {
        const targetX = canvas.width / 2 - hoveredNode.x * scale;
        const targetY = canvas.height / 2 - hoveredNode.y * scale;
        
        // Smoothly adjust offset
        setPanX(targetX);
        setPanY(targetY);
      }
    } else {
      // Click on background clears selection
      setSelectedNode(null);
    }
  };

  // Zoom wheel logic
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Current mouse location in world coordinates
    const worldX = (mouseX - panX) / scale;
    const worldY = (mouseY - panY) / scale;

    const zoomIntensity = 0.12;
    const zoomFactor = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
    const newScale = Math.max(0.18, Math.min(4.0, scale * zoomFactor));

    // Recalculate offsets to preserve cursor center zoom focus
    const newPanX = mouseX - worldX * newScale;
    const newPanY = mouseY - worldY * newScale;

    setScale(newScale);
    setPanX(newPanX);
    setPanY(newPanY);
  };

  // Camera toolbar buttons
  const zoomIn = () => {
    setScale((prev) => Math.min(4.0, prev * 1.25));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(0.18, prev * 0.8));
  };

  const resetView = () => {
    setScale(1);
    setPanX(0);
    setPanY(0);
  };

  return (
    <div className="flex h-[calc(100vh-130px)] gap-4 overflow-hidden" ref={containerRef}>
      {/* Visualizer Area */}
      <div className="relative flex-1 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden flex flex-col">

        {/* Searching / Filtering Toolbar Top Header */}
        <div className="bg-zinc-950/70 border-b border-zinc-800/60 p-3 flex items-center gap-3 flex-wrap">
          {/* Live Search */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 space-x-2 flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents or keywords..."
              className="bg-transparent text-xs outline-none placeholder:text-zinc-600 text-zinc-200 w-full"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Domain / Recency Mode Selection */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-md p-0.5 text-xs text-zinc-400">
            <button
              onClick={() => setColorMode("domain")}
              className={`px-2.5 py-1 rounded transition-colors ${
                colorMode === "domain" ? "bg-zinc-800 text-zinc-100" : "hover:text-zinc-200"
              }`}
            >
              Domain Mode
            </button>
            <button
              onClick={() => setColorMode("type")}
              className={`px-2.5 py-1 rounded transition-colors ${
                colorMode === "type" ? "bg-zinc-800 text-zinc-100" : "hover:text-zinc-200"
              }`}
            >
              Classic Mode
            </button>
            <button
              onClick={() => setColorMode("recency")}
              className={`px-2.5 py-1 rounded transition-colors ${
                colorMode === "recency" ? "bg-zinc-800 text-zinc-100" : "hover:text-zinc-200"
              }`}
            >
              Recency Mode
            </button>
          </div>

          {/* Time range selection */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-md p-0.5 text-xs text-zinc-400">
            <button
              onClick={() => setTimeFilter("all")}
              className={`px-2.5 py-1 rounded transition-colors ${
                timeFilter === "all" ? "bg-zinc-800 text-zinc-100" : "hover:text-zinc-200"
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setTimeFilter("week")}
              className={`px-2.5 py-1 rounded transition-colors ${
                timeFilter === "week" ? "bg-zinc-800 text-zinc-100" : "hover:text-zinc-200"
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeFilter("month")}
              className={`px-2.5 py-1 rounded transition-colors ${
                timeFilter === "month" ? "bg-zinc-800 text-zinc-100" : "hover:text-zinc-200"
              }`}
            >
              30 Days
            </button>
          </div>

          {/* Max Documents Slider */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 space-x-2 text-[11px] text-zinc-400">
            <Filter className="w-3 h-3 text-zinc-500" />
            <span>Show:</span>
            <select
              value={maxDocs}
              onChange={(e) => setMaxDocs(parseInt(e.target.value))}
              className="bg-transparent border-none text-zinc-200 outline-none cursor-pointer"
            >
              <option value="25" className="bg-zinc-900">Top 25 docs</option>
              <option value="50" className="bg-zinc-900">Top 50 docs</option>
              <option value="75" className="bg-zinc-900">Top 75 docs</option>
              <option value="100" className="bg-zinc-900">Top 100 docs</option>
            </select>
          </div>

          {/* Min Keyword Frequency selection */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 space-x-2 text-[11px] text-zinc-400">
            <Hash className="w-3 h-3 text-zinc-500" />
            <span>Keyword Conn:</span>
            <select
              value={minKwFrequency}
              onChange={(e) => setMinKwFrequency(parseInt(e.target.value))}
              className="bg-transparent border-none text-zinc-200 outline-none cursor-pointer"
            >
              <option value="1" className="bg-zinc-900">&ge; 1 ref</option>
              <option value="2" className="bg-zinc-900">&ge; 2 refs</option>
              <option value="3" className="bg-zinc-900">&ge; 3 refs</option>
              <option value="4" className="bg-zinc-900">&ge; 4 refs</option>
            </select>
          </div>
        </div>

        {/* Canvas Frame */}
        <div className="flex-1 w-full relative">
          
          {/* Controls Toolbar Overlay */}
          <div className="absolute top-3 left-4 right-4 flex items-center justify-between select-none pointer-events-none z-10 gap-2 flex-wrap">
            {/* Legend and stats */}
            <div className="flex items-center space-x-2 bg-zinc-900/90 border border-zinc-800 px-3 py-1.5 rounded-md text-[10.5px] pointer-events-auto shadow-lg backdrop-blur-md">
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-zinc-300">Pages ({documents.length > maxDocs ? maxDocs : documents.length})</span>
              </span>
              <span className="text-zinc-800">|</span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-zinc-400" />
                <span className="text-zinc-300">Keywords ({nodes.filter(n => n.type === "keyword").length})</span>
              </span>
              <span className="text-zinc-800">|</span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-500" />
                <span className="text-zinc-300">Entities ({nodes.filter(n => n.type === "entity").length})</span>
              </span>
            </div>

            {/* Settings & Camera Actions */}
            <div className="flex items-center space-x-1.5 pointer-events-auto">
              <button
                onClick={() => setShowPhysicsConfig(!showPhysicsConfig)}
                className={`p-1.5 border rounded-md transition-colors ${
                  showPhysicsConfig 
                    ? "bg-blue-500/10 border-blue-500 text-blue-400" 
                    : "bg-zinc-900/90 border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                }`}
                title="Physics Controls"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={`p-1.5 border rounded-md transition-colors ${
                  isPaused 
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400" 
                    : "bg-zinc-900/90 border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                }`}
                title={isPaused ? "Resume Layout Physics" : "Pause Layout Physics"}
              >
                <Play className={`w-3.5 h-3.5 ${!isPaused && "fill-zinc-400"}`} />
              </button>
              <span className="w-[1px] h-5 bg-zinc-800" />
              <button
                onClick={zoomIn}
                className="p-1.5 bg-zinc-900/90 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={zoomOut}
                className="p-1.5 bg-zinc-900/90 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={resetView}
                className="p-1.5 bg-zinc-900/90 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                title="Recenter Canvas"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Physics Tuning Panel Overlay */}
          {showPhysicsConfig && (
            <div className="absolute top-14 right-4 w-64 bg-zinc-900/95 border border-zinc-800 rounded-lg p-3.5 text-xs text-zinc-300 z-10 shadow-xl backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="font-semibold text-zinc-100">Physics Engine Tuning</span>
                <button onClick={() => setShowPhysicsConfig(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-3 h-3" />
                </button>
              </div>
              
              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">Node Spacing (Charge)</span>
                    <span className="font-mono">{physicsRepulsion}</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="150"
                    value={physicsRepulsion}
                    onChange={(e) => setPhysicsRepulsion(parseInt(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">Link Gravity Distance</span>
                    <span className="font-mono">{physicsLinkDist}</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="120"
                    value={physicsLinkDist}
                    onChange={(e) => setPhysicsLinkDist(parseInt(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">Central Gravity Pull</span>
                    <span className="font-mono">{(physicsGravity * 1000).toFixed(1)}k</span>
                  </div>
                  <input
                    type="range"
                    min="0.0001"
                    max="0.005"
                    step="0.0002"
                    value={physicsGravity}
                    onChange={(e) => setPhysicsGravity(parseFloat(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800 flex justify-end">
                <button
                  onClick={() => {
                    setPhysicsRepulsion(60);
                    setPhysicsLinkDist(55);
                    setPhysicsGravity(0.001);
                  }}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-[10.5px] rounded-md transition-colors text-zinc-300"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Defaults</span>
                </button>
              </div>
            </div>
          )}
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-zinc-950">
              <Globe className="w-12 h-12 text-zinc-800 mb-3 animate-pulse" />
              <h3 className="text-zinc-200 text-sm font-semibold">Brain Graph Offline</h3>
              <p className="text-xs text-zinc-500 max-w-sm mt-1">
                MindCache has not indexed any pages yet. Keep browsing to start building your graph.
              </p>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              width={dimensions.width}
              height={dimensions.height}
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onClick={handleCanvasClick}
              onWheel={handleWheel}
              className="cursor-grab active:cursor-grabbing w-full h-full"
            />
          )}

          {/* Quick interactive zoom indicator */}
          <div className="absolute bottom-3 right-4 text-[10.5px] font-mono text-zinc-500 select-none bg-zinc-900/50 px-2 py-0.5 rounded border border-zinc-800/30">
            Zoom: {Math.round(scale * 100)}%
          </div>

          {/* Tips Overlay */}
          <div className="absolute bottom-3 left-4 text-[10.5px] text-zinc-500 select-none hidden md:block">
            Scroll to Zoom &bull; Drag to Pan &bull; Drag nodes to rearrange &bull; Click to inspect
          </div>
        </div>
      </div>

      {/* Node Info Sidebar Panel */}
      {selectedNode && (
        <div className="w-[320px] bg-zinc-900 border border-zinc-800 rounded-lg p-4 overflow-y-auto flex flex-col justify-between shadow-xl animate-in slide-in-from-right duration-250">
          
          {/* Content details based on node type */}
          <div>
            <div className="flex items-start justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center space-x-2">
                {selectedNode.type === "document" && <FileText className="w-4 h-4 text-blue-400" />}
                {selectedNode.type === "keyword" && <Hash className="w-4 h-4 text-zinc-400" />}
                {selectedNode.type === "entity" && (() => {
                  const Icon = getEntityIcon(selectedNode.entityType || "");
                  return <Icon className="w-4 h-4" style={{ color: selectedNode.color }} />;
                })()}
                <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400">
                  {selectedNode.type === "document" 
                    ? "Memory Page" 
                    : selectedNode.type === "entity" 
                      ? `${selectedNode.entityType || "Entity"}`
                      : "Topic Keyword"}
                </span>
              </div>
              <button 
                onClick={() => setSelectedNode(null)}
                className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded hover:bg-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Document Details Block */}
            {selectedNode.type === "document" && selectedDocDetails && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 leading-snug line-clamp-3">
                    {selectedDocDetails.title || "Untitled Document"}
                  </h3>
                  <div className="flex items-center space-x-1.5 mt-2 text-[10.5px] text-zinc-400">
                    <span className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 truncate max-w-[150px]">
                      {selectedDocDetails.domain}
                    </span>
                    <span>&bull;</span>
                    <span>{selectedDocDetails.source_type || "Generic"}</span>
                  </div>
                </div>

                {selectedDocDetails.summary && (
                  <div className="space-y-1.5">
                    <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">AI Summary</h4>
                    <p className="text-[11.5px] text-zinc-300 leading-relaxed bg-zinc-950 p-2.5 rounded border border-zinc-800/60 max-h-36 overflow-y-auto">
                      {selectedDocDetails.summary}
                    </p>
                  </div>
                )}

                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center justify-between text-zinc-400 border-b border-zinc-800/40 py-1">
                    <span className="flex items-center space-x-1"><Calendar className="w-3 h-3" /> <span>First Seen</span></span>
                    <span className="font-mono text-zinc-300">
                      {new Date(selectedDocDetails.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400 border-b border-zinc-800/40 py-1">
                    <span className="flex items-center space-x-1"><Clock className="w-3 h-3" /> <span>Last Visited</span></span>
                    <span className="font-mono text-zinc-300">
                      {new Date(selectedDocDetails.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400 py-1">
                    <span className="flex items-center space-x-1"><span>🎯</span> <span>Visit Count</span></span>
                    <span className="font-mono text-zinc-300">
                      {selectedDocDetails.visit_history?.length || 1}
                    </span>
                  </div>
                </div>

                {selectedDocDetails.keywords && selectedDocDetails.keywords.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Related Keywords</h4>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-0.5">
                      {selectedDocDetails.keywords.map((kw, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            // Find and highlight keyword node
                            const kwNode = nodes.find(n => n.type === "keyword" && n.label.toLowerCase() === kw.keyword.toLowerCase());
                            if (kwNode) {
                              setSelectedNode(kwNode);
                            }
                          }}
                          className="text-[10px] bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/30 px-2 py-0.5 rounded transition-colors"
                        >
                          {kw.keyword}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedDocDetails.entities && selectedDocDetails.entities.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Extracted Entities</h4>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-0.5">
                      {selectedDocDetails.entities.map((ent, i) => {
                        const entColor = getEntityColor(ent.type);
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              // Find and highlight entity node
                              const entKey = `${ent.type}:${ent.name}`.toLowerCase();
                              const entId = `ent_${entKey.replace(/[^a-z0-9]/g, "_")}`;
                              const entNode = nodes.find(n => n.id === entId);
                              if (entNode) {
                                setSelectedNode(entNode);
                              }
                            }}
                            className="text-[10px] border px-2 py-0.5 rounded transition-colors"
                            style={{
                              backgroundColor: `${entColor}15`,
                              borderColor: `${entColor}30`,
                              color: entColor,
                            }}
                          >
                            {ent.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Keyword Details Block */}
            {selectedNode.type === "keyword" && selectedKwDetails && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-zinc-100 flex items-center space-x-1.5">
                    <span>#{selectedKwDetails.keyword}</span>
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Associated with <span className="font-semibold text-blue-400">{selectedKwDetails.count}</span> indexed pages.
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Connected Pages</h4>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                    {selectedKwDetails.documents.map((doc) => (
                      <div 
                        key={doc.id}
                        onClick={() => {
                          const docNode = nodes.find(n => n.id === `doc_${doc.id}`);
                          if (docNode) {
                            setSelectedNode(docNode);
                          }
                        }}
                        className="p-2 rounded border border-zinc-800/80 hover:bg-zinc-800/60 hover:border-zinc-700/50 cursor-pointer transition-colors text-left space-y-1"
                      >
                        <div className="text-[11.5px] font-medium text-zinc-200 line-clamp-2 leading-tight">
                          {doc.title || doc.url}
                        </div>
                        <div className="text-[9.5px] text-zinc-400 font-mono truncate">
                          {doc.domain}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Entity Details Block */}
            {selectedNode.type === "entity" && selectedEntDetails && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-zinc-100 flex items-center space-x-1.5">
                    <span>{selectedEntDetails.name}</span>
                  </h3>
                  <div className="flex items-center space-x-2 mt-2">
                    <span 
                      className="px-2 py-0.5 rounded text-[10px] font-semibold"
                      style={{ 
                        backgroundColor: `${selectedNode.color}20`, 
                        color: selectedNode.color,
                        border: `1px solid ${selectedNode.color}40`
                      }}
                    >
                      {selectedEntDetails.type}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      Found in <span className="font-semibold" style={{ color: selectedNode.color }}>{selectedEntDetails.count}</span> pages
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Mentioned In</h4>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                    {selectedEntDetails.documents.map((doc) => (
                      <div 
                        key={doc.id}
                        onClick={() => {
                          const docNode = nodes.find(n => n.id === `doc_${doc.id}`);
                          if (docNode) {
                            setSelectedNode(docNode);
                          }
                        }}
                        className="p-2 rounded border border-zinc-800/80 hover:bg-zinc-800/60 hover:border-zinc-700/50 cursor-pointer transition-colors text-left space-y-1"
                      >
                        <div className="text-[11.5px] font-medium text-zinc-200 line-clamp-2 leading-tight">
                          {doc.title || doc.url}
                        </div>
                        <div className="text-[9.5px] text-zinc-400 font-mono truncate">
                          {doc.domain}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Footer controls */}
          <div className="pt-4 border-t border-zinc-800 mt-6 space-y-2">
            {selectedNode.type === "document" && selectedDocDetails && (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={() => onDocumentClick(selectedDocDetails.id)}
                    className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold rounded-md transition-colors text-zinc-200 border border-zinc-700/60"
                  >
                    <span>View Inspector</span>
                  </button>
                  <button
                    onClick={() => window.open(selectedDocDetails.url, "_blank")}
                    className="flex items-center justify-center p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors text-zinc-300 border border-zinc-700/60"
                    title="Open Page in Browser Tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => {
                    if (confirm("Delete this document from local memory? This will wipe keywords and vector indexes.")) {
                      onDeleteDocument(selectedDocDetails.id);
                      setSelectedNode(null);
                    }
                  }}
                  className="w-full flex items-center justify-center space-x-1.5 py-1.5 bg-red-950/20 hover:bg-red-950/40 text-[11px] font-medium rounded-md transition-colors text-red-400 border border-red-900/30 hover:border-red-900/50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Memory</span>
                </button>
              </>
            )}
            
            {(selectedNode.type === "keyword" || selectedNode.type === "entity") && (
              <button
                onClick={() => setSelectedNode(null)}
                className="w-full py-1.5 bg-zinc-850 hover:bg-zinc-800 text-[11px] font-medium rounded-md transition-colors text-zinc-300 border border-zinc-700/50"
              >
                Clear Selection
              </button>
            )}
          </div>
          
        </div>
      )}
    </div>
  );
};
