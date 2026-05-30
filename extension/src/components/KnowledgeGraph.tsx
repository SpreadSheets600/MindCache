import React, { useRef, useEffect, useState } from "react";
import { DocumentResponse } from "../types";
import { Globe } from "lucide-react";

interface Node {
  id: string;
  label: string;
  type: "document" | "keyword";
  url?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface Link {
  source: string;
  target: string;
}

interface KnowledgeGraphProps {
  documents: DocumentResponse[];
  onDocumentClick: (id: number) => void;
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  documents,
  onDocumentClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [draggedNode, setDraggedNode] = useState<Node | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: 380,
      });
    }
  }, [documents]);

  useEffect(() => {
    if (!documents || documents.length === 0) {
      setNodes([]);
      setLinks([]);
      return;
    }

    const newNodes: Node[] = [];
    const newLinks: Link[] = [];
    const nodeMap = new Map<string, Node>();

    const width = dimensions.width || 600;
    const height = dimensions.height || 380;

    const keywordCounts: Record<string, number> = {};
    documents.forEach((doc) => {
      doc.keywords.forEach((kw) => {
        keywordCounts[kw.keyword] = (keywordCounts[kw.keyword] || 0) + 1;
      });
    });

    const frequentKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([kw]) => kw);

    documents.slice(0, 25).forEach((doc, idx) => {
      const id = `doc_${doc.id}`;
      const angle = (idx / 25) * Math.PI * 2;
      const r = 80 + Math.random() * 40;
      const node: Node = {
        id,
        label: doc.title || doc.url,
        type: "document",
        url: doc.url,
        x: width / 2 + Math.cos(angle) * r,
        y: height / 2 + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
        radius: 7,
        color: "#3b82f6",
      };
      newNodes.push(node);
      nodeMap.set(id, node);

      doc.keywords.forEach((kw) => {
        if (frequentKeywords.includes(kw.keyword)) {
          const kwId = `kw_${kw.keyword}`;
          if (!nodeMap.has(kwId)) {
            const kwNode: Node = {
              id: kwId,
              label: kw.keyword,
              type: "keyword",
              x: width / 2 + (Math.random() - 0.5) * 150,
              y: height / 2 + (Math.random() - 0.5) * 150,
              vx: 0,
              vy: 0,
              radius: 4,
              color: "#71717a",
            };
            newNodes.push(kwNode);
            nodeMap.set(kwId, kwNode);
          }
          newLinks.push({ source: id, target: kwId });
        }
      });
    });

    setNodes(newNodes);
    setLinks(newLinks);
  }, [documents, dimensions.width, dimensions.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const width = dimensions.width;
    const height = dimensions.height;

    const runSimulation = () => {
      for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = n1.type === "keyword" || n2.type === "keyword" ? 50 : 80;

          if (dist < minDist) {
            const force = (minDist - dist) * 0.05;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (n1 !== draggedNode) { n1.vx -= fx; n1.vy -= fy; }
            if (n2 !== draggedNode) { n2.vx += fx; n2.vy += fy; }
          }
        }
      }

      links.forEach((link) => {
        const n1 = nodes.find((n) => n.id === link.source);
        const n2 = nodes.find((n) => n.id === link.target);
        if (n1 && n2) {
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - 55) * 0.008;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (n1 !== draggedNode) { n1.vx += fx; n1.vy += fy; }
          if (n2 !== draggedNode) { n2.vx -= fx; n2.vy -= fy; }
        }
      });

      nodes.forEach((node) => {
        if (node === draggedNode) return;
        const dx = width / 2 - node.x;
        const dy = height / 2 - node.y;
        node.vx += dx * 0.0006;
        node.vy += dy * 0.0006;
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.85;
        node.vy *= 0.85;
        node.x = Math.max(node.radius, Math.min(width - node.radius, node.x));
        node.y = Math.max(node.radius, Math.min(height - node.radius, node.y));
      });

      ctx.clearRect(0, 0, width, height);

      ctx.lineWidth = 0.5;
      links.forEach((link) => {
        const n1 = nodes.find((n) => n.id === link.source);
        const n2 = nodes.find((n) => n.id === link.target);
        if (n1 && n2) {
          const isHighlighted = hoveredNode && (hoveredNode.id === n1.id || hoveredNode.id === n2.id);
          ctx.strokeStyle = isHighlighted ? "rgba(59, 130, 246, 0.3)" : "rgba(113, 113, 122, 0.08)";
          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(n2.x, n2.y);
          ctx.stroke();
        }
      });

      nodes.forEach((node) => {
        const isHovered = hoveredNode && hoveredNode.id === node.id;
        const isRelated = hoveredNode && (hoveredNode.id === node.id || links.some(
          (l) => (l.source === node.id && l.target === hoveredNode.id) || (l.target === node.id && l.source === hoveredNode.id)
        ));

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + (isHovered ? 2 : 0), 0, Math.PI * 2);

        if (node.type === "document") {
          ctx.fillStyle = isHovered ? "#3b82f6" : "#2563eb";
          ctx.strokeStyle = "rgba(59, 130, 246, 0.12)";
          ctx.lineWidth = isHovered ? 4 : 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = isHovered ? "#a1a1aa" : "#71717a";
        }
        ctx.fill();

        if (isHovered || isRelated) {
          ctx.font = node.type === "document" ? "500 10px Geist, sans-serif" : "9px Geist Mono, monospace";
          ctx.fillStyle = node.type === "document" ? "#fafafa" : "#a1a1aa";
          let text = node.label;
          if (text.length > 25) text = text.substring(0, 22) + "...";
          ctx.textAlign = "center";
          ctx.fillText(text, node.x, node.y - (node.radius + 6));
        }
      });

      animationId = requestAnimationFrame(runSimulation);
    };

    runSimulation();
    return () => cancelAnimationFrame(animationId);
  }, [nodes, links, hoveredNode, draggedNode, dimensions]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (draggedNode) {
      draggedNode.x = mouseX;
      draggedNode.y = mouseY;
      return;
    }

    let foundNode: Node | null = null;
    for (const node of nodes) {
      const dx = node.x - mouseX;
      const dy = node.y - mouseY;
      if (Math.sqrt(dx * dx + dy * dy) < node.radius + 6) {
        foundNode = node;
        break;
      }
    }
    if (foundNode !== hoveredNode) setHoveredNode(foundNode);
  };

  const handleMouseDown = () => { if (hoveredNode) setDraggedNode(hoveredNode); };
  const handleMouseUp = () => { setDraggedNode(null); };
  const handleMouseLeave = () => { setHoveredNode(null); setDraggedNode(null); };

  const handleCanvasClick = () => {
    if (hoveredNode && hoveredNode.type === "document") {
      const docId = parseInt(hoveredNode.id.split("_")[1], 10);
      if (!isNaN(docId)) onDocumentClick(docId);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative border border-border rounded-lg overflow-hidden p-2 flex flex-col items-center"
    >
      <div className="absolute top-3 left-4 select-none pointer-events-none">
        <h4 className="text-xs text-muted-foreground">Knowledge graph</h4>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[340px] text-center p-8">
          <Globe className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">
            No documents yet. Keep browsing to build your graph.
          </p>
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClick={handleCanvasClick}
            className="cursor-grab active:cursor-grabbing max-w-full"
          />
          {hoveredNode && hoveredNode.type === "document" && (
            <div className="absolute bottom-3 left-4 right-4 bg-background/95 border border-border px-3 py-1.5 rounded-md text-[11px] flex items-center justify-between pointer-events-none">
              <span className="truncate text-foreground max-w-[70%] font-medium">
                {hoveredNode.label}
              </span>
              <span className="text-primary text-[10px]">Click to inspect</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};
