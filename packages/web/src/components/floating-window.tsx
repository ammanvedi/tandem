"use client";

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";

interface FloatingWindowProps {
  title: string;
  icon?: ReactNode;
  src: string;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  onClose: () => void;
}

export function FloatingWindow({
  title,
  icon,
  src,
  defaultPosition,
  defaultSize = { width: 480, height: 360 },
  minSize = { width: 320, height: 200 },
  onClose,
}: FloatingWindowProps) {
  const [pos, setPos] = useState(defaultPosition ?? { x: 80, y: 80 });
  const [size, setSize] = useState(defaultSize);
  const [minimized, setMinimized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const windowRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // Bring to front on interaction
  const bringToFront = useCallback(() => {
    if (!windowRef.current) return;
    const allWindows = document.querySelectorAll("[data-floating-window]");
    let maxZ = 1000;
    allWindows.forEach((el) => {
      const z = parseInt((el as HTMLElement).style.zIndex || "1000", 10);
      if (z > maxZ) maxZ = z;
    });
    windowRef.current.style.zIndex = String(maxZ + 1);
  }, []);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      bringToFront();
      setDragging(true);
      dragOffsetRef.current = {
        x: e.clientX - pos.x,
        y: e.clientY - pos.y,
      };
    },
    [pos, bringToFront]
  );

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      bringToFront();
      setResizing(true);
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        w: size.width,
        h: size.height,
      };
    },
    [size, bringToFront]
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      setPos({
        x: Math.max(0, e.clientX - dragOffsetRef.current.x),
        y: Math.max(0, e.clientY - dragOffsetRef.current.y),
      });
    };
    const onUp = () => setDragging(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  useEffect(() => {
    if (!resizing) return;

    const onMove = (e: MouseEvent) => {
      const { x, y, w, h } = resizeStartRef.current;
      setSize({
        width: Math.max(minSize.width, w + (e.clientX - x)),
        height: Math.max(minSize.height, h + (e.clientY - y)),
      });
    };
    const onUp = () => setResizing(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing, minSize]);

  return (
    <div
      ref={windowRef}
      data-floating-window
      onMouseDown={bringToFront}
      className="fixed shadow-2xl border border-border-muted bg-background flex flex-col overflow-hidden"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: minimized ? "auto" : size.height,
        zIndex: 1000,
        borderRadius: 8,
      }}
    >
      {/* Title bar */}
      <div
        onMouseDown={onDragStart}
        className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/60 border-b border-border-muted select-none shrink-0"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="shrink-0 text-muted-foreground w-4 h-4">{icon}</span>}
          <span className="text-xs font-medium text-foreground truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setMinimized((v) => !v)}
            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded transition"
            title={minimized ? "Expand" : "Minimize"}
          >
            <svg width="10" height="2" viewBox="0 0 10 2" fill="currentColor">
              <rect width="10" height="2" rx="1" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition"
            title="Close"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M1 1l8 8M9 1l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      {!minimized && (
        <div className="flex-1 relative overflow-hidden bg-black">
          {(dragging || resizing) && <div className="absolute inset-0 z-10" />}
          <iframe
            src={src}
            className="w-full h-full border-0"
            allow="clipboard-read; clipboard-write"
            title={title}
          />
          {/* Resize handle */}
          <div
            onMouseDown={onResizeStart}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-20"
            style={{
              background:
                "linear-gradient(135deg, transparent 50%, var(--color-muted-foreground) 50%)",
              opacity: 0.4,
            }}
          />
        </div>
      )}
    </div>
  );
}
