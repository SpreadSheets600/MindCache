import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { backendClient } from "../services/BackendClient";
import { X, Globe, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { getErrorMessage } from "../utils/error";

interface DocumentDetailsModalProps {
  documentId: number | null;
  onClose: () => void;
}

export const DocumentDetailsModal: React.FC<DocumentDetailsModalProps> = ({
  documentId,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const { data: doc, isLoading, error } = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => {
      if (!documentId) throw new Error("No document ID");
      return backendClient.getDocument(documentId);
    },
    enabled: documentId !== null,
  });

  const handleGenerateSummary = async () => {
    if (!documentId) return;
    setIsGenerating(true);
    try {
      await backendClient.summarizeDocument(documentId);
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (err) {
      console.error("Failed to generate summary:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!documentId) return null;

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-background animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs text-muted-foreground font-mono">
          #{documentId}
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-64 space-y-3">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            <p className="text-xs text-muted-foreground">Loading...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-64 text-center space-y-3">
            <p className="text-sm text-red-400">Failed to load document</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {getErrorMessage(error)}
            </p>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md bg-secondary text-xs hover:bg-secondary/80 transition-colors"
            >
              Go back
            </button>
          </div>
        )}

        {doc && (
          <>
            <div>
              <h2 className="text-base font-semibold leading-snug">
                {doc.title || "Untitled Page"}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-1 hover:text-primary transition-colors"
                >
                  <Globe className="w-3 h-3" />
                  <span>{doc.domain}</span>
                </a>
                {doc.author && (
                  <>
                    <span className="text-muted-foreground/30">-</span>
                    <span>{doc.author}</span>
                  </>
                )}
                {doc.published_date && (
                  <>
                    <span className="text-muted-foreground/30">-</span>
                    <span>{formatDate(doc.published_date)}</span>
                  </>
                )}
              </div>
            </div>

            {doc.summary ? (
              <div className="p-3 rounded-lg bg-primary/5 space-y-1">
                <div className="flex items-center space-x-1.5 text-[11px] text-primary font-medium">
                  <Sparkles className="w-3 h-3" />
                  <span>AI Summary</span>
                </div>
                <p className="text-xs text-foreground/90 leading-relaxed">
                  {doc.summary}
                </p>
              </div>
            ) : (
              <button
                onClick={handleGenerateSummary}
                disabled={isGenerating}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-lg border border-border hover:bg-secondary text-xs transition-colors disabled:opacity-50"
              >
                {isGenerating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                )}
                <span>{isGenerating ? "Generating summary..." : "Generate AI Summary"}</span>
              </button>
            )}

            {doc.keywords && doc.keywords.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs text-muted-foreground">Keywords</h4>
                <div className="flex flex-wrap gap-1.5">
                  {doc.keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-secondary text-[11px] text-muted-foreground"
                    >
                      {kw.keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-xs text-muted-foreground">Extracted content</h4>
              <div className="p-3 rounded-lg bg-secondary/50 max-h-48 overflow-y-auto text-xs text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">
                {doc.extracted_content || "No content extracted."}
              </div>
            </div>

            {doc.visit_history && doc.visit_history.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs text-muted-foreground">Visit history</h4>
                <div className="space-y-1">
                  {doc.visit_history.map((timestamp, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-muted-foreground/60 font-mono"
                    >
                      {formatDate(timestamp)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end px-4 py-2.5 border-t border-border">
        {doc?.url && (
          <button
            onClick={() => window.open(doc.url, "_blank")}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-secondary text-xs hover:bg-secondary/80 transition-colors focus:outline-none"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open page</span>
          </button>
        )}
      </div>
    </div>
  );
};
