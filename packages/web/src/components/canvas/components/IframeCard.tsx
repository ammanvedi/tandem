"use client";

import { useState, useRef, useCallback, type DragEvent } from "react";
import type { CanvasReference } from "@open-inspect/shared";

export const CANVAS_REFERENCE_MIME = "application/x-canvas-reference";

interface IframeCardProps {
  src: string | null | undefined;
  title: string;
  emptyMessage?: string;
  className?: string;
  sessionId?: string;
  elementType?: "iframe";
}

export function IframeCard({
  src,
  title,
  emptyMessage,
  className = "",
  sessionId,
}: IframeCardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!sessionId) return;
      const ref: CanvasReference = {
        type: "canvas_element",
        elementType: "iframe",
        sessionId,
        metadata: { title, src: src ?? undefined },
      };
      e.dataTransfer.setData(CANVAS_REFERENCE_MIME, JSON.stringify(ref));
      e.dataTransfer.setData("text/plain", `[${title}]`);
      e.dataTransfer.effectAllowed = "copy";
    },
    [sessionId, title, src]
  );

  if (!src) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center bg-slate-900/50 text-muted-foreground text-xs ${className}`}
      >
        {emptyMessage || `No ${title.toLowerCase()}`}
      </div>
    );
  }

  return (
    <div className={`w-full h-full relative bg-black ${className}`}>
      {/* Drag handle overlay */}
      {sessionId && (
        <div
          draggable
          onDragStart={handleDragStart}
          className="absolute top-1 right-1 z-20 w-6 h-6 flex items-center justify-center bg-black/60 hover:bg-black/80 rounded cursor-grab active:cursor-grabbing transition opacity-0 hover:opacity-100"
          title={`Drag ${title} as reference`}
        >
          <span className="text-white/60 text-[10px]">⊞</span>
        </div>
      )}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white/40" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
          <p className="text-xs text-red-400">Failed to load {title}</p>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        className="w-full h-full border-0"
        allow="clipboard-read; clipboard-write"
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
      />
    </div>
  );
}
