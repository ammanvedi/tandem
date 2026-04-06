"use client";

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";

interface DockedPreviewProps {
  title: string;
  icon?: ReactNode;
  src: string | null;
  emptyMessage?: string;
  stackIndex?: number;
}

const DOCKED_WIDTH = 160;
const DOCKED_HEIGHT = 90;
const EXPANDED_WIDTH = 560;
const EXPANDED_HEIGHT = 340;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;
const DOCK_GAP = 8;
const DOCK_MARGIN = 16;

export function DockedPreview({
  title,
  icon,
  src,
  emptyMessage = "Not available",
  stackIndex = 0,
}: DockedPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: EXPANDED_WIDTH, height: EXPANDED_HEIGHT });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const windowRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const bottomOffset = DOCK_MARGIN + stackIndex * (DOCKED_HEIGHT + DOCK_GAP);

  const expand = useCallback(() => {
    if (!windowRef.current) return;
    const parent = windowRef.current.closest("[data-canvas-area]") as HTMLElement | null;
    const rect = parent?.getBoundingClientRect() ?? {
      width: window.innerWidth,
      height: window.innerHeight,
      left: 0,
      top: 0,
    };
    const x = rect.left + (rect.width - EXPANDED_WIDTH) / 2;
    const y = rect.top + (rect.height - EXPANDED_HEIGHT) / 2;
    setPos({ x: Math.max(0, x), y: Math.max(0, y) });
    setSize({ width: EXPANDED_WIDTH, height: EXPANDED_HEIGHT });
    setExpanded(true);
  }, []);

  const minimize = useCallback(() => {
    setExpanded(false);
  }, []);

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
      dragOffsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    },
    [pos, bringToFront]
  );

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      bringToFront();
      setResizing(true);
      resizeStartRef.current = { x: e.clientX, y: e.clientY, w: size.width, h: size.height };
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
        width: Math.max(MIN_WIDTH, w + (e.clientX - x)),
        height: Math.max(MIN_HEIGHT, h + (e.clientY - y)),
      });
    };
    const onUp = () => setResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing]);

  const containerStyle: React.CSSProperties = expanded
    ? {
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: size.height,
        zIndex: 1000,
        borderRadius: 8,
      }
    : {
        position: "absolute",
        right: DOCK_MARGIN,
        bottom: bottomOffset,
        width: DOCKED_WIDTH,
        height: DOCKED_HEIGHT,
        zIndex: 20,
        borderRadius: 8,
        cursor: "pointer",
      };

  return (
    <div
      ref={windowRef}
      data-floating-window={expanded || undefined}
      onMouseDown={expanded ? bringToFront : undefined}
      onClick={!expanded ? expand : undefined}
      className={`border border-border-muted bg-background flex flex-col overflow-hidden ${
        !dragging && !resizing ? "transition-[width,height] duration-200" : ""
      } ${expanded ? "shadow-2xl" : "hover:border-foreground/20"}`}
      style={containerStyle}
      title={!expanded ? `Open ${title}` : undefined}
    >
      {/* Title bar -- only shown when expanded */}
      {expanded && (
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
              onClick={minimize}
              className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded transition"
              title="Minimize"
            >
              <svg width="10" height="2" viewBox="0 0 10 2" fill="currentColor">
                <rect width="10" height="2" rx="1" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Content area -- always rendered to keep iframe alive */}
      <div className="flex-1 relative overflow-hidden bg-black">
        {expanded && (dragging || resizing) && <div className="absolute inset-0 z-10" />}
        {src ? (
          <iframe
            src={src}
            className="w-full h-full border-0"
            style={{ pointerEvents: expanded ? "auto" : "none" }}
            allow="clipboard-read; clipboard-write"
            tabIndex={expanded ? 0 : -1}
            title={title}
          />
        ) : (
          <div className="flex items-center justify-center h-full gap-1.5 text-muted-foreground">
            {icon && <span className="w-3 h-3">{icon}</span>}
            <span className="text-[10px] uppercase tracking-wide">{emptyMessage}</span>
          </div>
        )}

        {/* Docked label overlay */}
        {!expanded && (
          <div className="absolute bottom-0 inset-x-0 bg-black/60 backdrop-blur-sm px-2 py-1 flex items-center gap-1.5">
            {icon && <span className="w-3 h-3 text-muted-foreground">{icon}</span>}
            <span className="text-[10px] text-foreground uppercase tracking-wide">{title}</span>
          </div>
        )}

        {/* Resize grip -- only when expanded */}
        {expanded && (
          <div
            onMouseDown={onResizeStart}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-20"
            style={{
              background:
                "linear-gradient(135deg, transparent 50%, var(--color-muted-foreground) 50%)",
              opacity: 0.4,
            }}
          />
        )}
      </div>
    </div>
  );
}
