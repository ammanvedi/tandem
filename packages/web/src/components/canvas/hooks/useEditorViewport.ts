import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@dgmjs/core";
import type { Point2D } from "../types/cards";

export type ViewportState = {
  origin: Point2D;
  scale: number;
};

export function useEditorViewport() {
  const viewportSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewport, setViewport] = useState<ViewportState>({
    origin: [0, 0],
    scale: 1,
  });
  const [isViewportSyncing, setIsViewportSyncing] = useState(false);

  const markViewportSyncing = () => {
    setIsViewportSyncing(true);
    if (viewportSyncTimeoutRef.current) {
      clearTimeout(viewportSyncTimeoutRef.current);
    }
    viewportSyncTimeoutRef.current = setTimeout(() => {
      setIsViewportSyncing(false);
      viewportSyncTimeoutRef.current = null;
    }, 120);
  };

  const syncViewportFromEditor = useCallback((editor: Editor) => {
    const [ox, oy] = editor.getOrigin();
    setViewport({
      origin: [ox, oy],
      scale: editor.getScale(),
    });
  }, []);

  const handleScroll = (origin: number[]) => {
    markViewportSyncing();
    setViewport((prev) => ({
      origin: [origin[0], origin[1]],
      scale: prev.scale,
    }));
  };

  const handleZoom = (scale: number) => {
    markViewportSyncing();
    setViewport((prev) => ({ ...prev, scale }));
  };

  useEffect(
    () => () => {
      if (viewportSyncTimeoutRef.current) {
        clearTimeout(viewportSyncTimeoutRef.current);
      }
    },
    []
  );

  return {
    viewport,
    isViewportSyncing,
    syncViewportFromEditor,
    handleScroll,
    handleZoom,
  };
}
