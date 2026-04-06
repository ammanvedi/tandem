import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@dgmjs/core";
import {
  Hand,
  MousePointer2,
  Square,
  Circle,
  Type,
  Minus,
  Pencil,
  Highlighter,
  Code,
  Sparkles,
} from "lucide-react";
import { DGMEditorCore } from "@dgmjs/react";
import { InspirationSearch } from "@/components/inspiration-search";
import { ClusterCanvas } from "./ClusterCanvas";
import { useEditorViewport } from "../hooks/useEditorViewport";
import { useInteractiveCardsState } from "../hooks/useInteractiveCardsState";
import { useYjsSync, type CollaborationConfig } from "../hooks/useYjsSync";
import type { InteractiveCard } from "../types/cards";
import type { ClusterDefinition, WorldRect } from "../types/clusters";
import { computeClusterLayouts } from "../utils/clusterLayout";

const TOOL_ICONS = {
  Hand,
  Select: MousePointer2,
  Rectangle: Square,
  Ellipse: Circle,
  Text: Type,
  Line: Minus,
  Freehand: Pencil,
  Highlighter,
  Embed: Code,
} as const;

type ToolId = keyof typeof TOOL_ICONS;

const TOOL_GROUPS: { id: ToolId; label: string }[][] = [
  [
    { id: "Hand", label: "Hand" },
    { id: "Select", label: "Select" },
  ],
  [
    { id: "Rectangle", label: "Rectangle" },
    { id: "Ellipse", label: "Ellipse" },
    { id: "Text", label: "Text" },
  ],
  [
    { id: "Line", label: "Line" },
    { id: "Freehand", label: "Freehand" },
    { id: "Highlighter", label: "Highlighter" },
  ],
  [{ id: "Embed", label: "Embed" }],
];

type ClusterEditorProps = {
  clusters: ClusterDefinition[];
  onMount?: (editor: Editor) => void;
  showGrid?: boolean;
  showPalette?: boolean;
  className?: string;
  activeClusterId?: string | null;
  onActiveClusterChange?: (id: string | null) => void;
  collaboration?: CollaborationConfig;
};

function ensureCurrentPage(editor: Editor) {
  const currentPage = editor.getCurrentPage();
  if (currentPage) return currentPage;

  const pages = editor.getPages();
  if (pages.length > 0) {
    editor.setCurrentPage(pages[0]);
    return pages[0];
  }

  const page = editor.actions.addPage({ name: "Page 1" });
  editor.setCurrentPage(page);
  return page;
}

export function ClusterEditor({
  clusters,
  onMount,
  showGrid = true,
  showPalette = true,
  className,
  activeClusterId: controlledClusterId,
  onActiveClusterChange,
  collaboration,
}: ClusterEditorProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [activeHandler, setActiveHandler] = useState("Hand");
  const [inspirationOpen, setInspirationOpen] = useState(false);
  const isControlled = controlledClusterId !== undefined;
  const [internalClusterId, setInternalClusterId] = useState<string | null>(null);
  const activeClusterId = isControlled ? controlledClusterId : internalClusterId;
  const setActiveClusterId = (id: string | null) => {
    if (!isControlled) setInternalClusterId(id);
    onActiveClusterChange?.(id);
  };
  void setActiveClusterId;
  const lastCenteredClusterRef = useRef<string | null>(null);
  const [clusterBoundsById, setClusterBoundsById] = useState<Record<string, WorldRect>>({});
  const { viewport, isViewportSyncing, syncViewportFromEditor, handleScroll, handleZoom } =
    useEditorViewport();
  const yjsSync = useYjsSync(editorRef.current, collaboration);

  const computedLayouts = useMemo(() => computeClusterLayouts(clusters), [clusters]);
  const initialCards = useMemo<InteractiveCard[]>(() => {
    const cards: InteractiveCard[] = [];
    let index = 0;
    for (const layout of computedLayouts) {
      const cluster = clusters.find((item) => item.id === layout.clusterId);
      if (!cluster) continue;
      for (const item of cluster.items) {
        if (item.renderMode !== "interactive") continue;
        const layoutItem = layout.items.find((candidate) => candidate.id === item.id);
        if (!layoutItem) continue;
        cards.push({
          id: item.id,
          clusterId: cluster.id,
          title: item.title,
          content: item.content,
          mode: "canvas",
          isPinned: false,
          canvasWorldPos: [
            layout.worldOrigin[0] + layoutItem.x,
            layout.worldOrigin[1] + layoutItem.y,
          ],
          canvasSize: { ...item.size },
          pinnedPos: [120 + (index % 3) * 46, 120 + (index % 4) * 36],
          pinnedSize: { width: item.size.width * 1.12, height: item.size.height * 1.12 },
          shadowOnCanvas: null,
        });
        index += 1;
      }
    }
    return cards;
  }, [clusters, computedLayouts]);

  const {
    cards,
    isDragging,
    isResizing,
    activeInteractionKey,
    startInteraction,
    togglePin,
    toggleFullscreen,
  } = useInteractiveCardsState(initialCards);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      ensureCurrentPage(editor);
      onMount?.(editor);
      editor.fitToScreen();
      editor.activateHandler("Hand");
      setActiveHandler("Hand");
      syncViewportFromEditor(editor);
    },
    [onMount, syncViewportFromEditor]
  );

  const activateTool = (handlerId: string) => editorRef.current?.activateHandler(handlerId);

  useEffect(() => {
    if (!activeClusterId || activeClusterId === lastCenteredClusterRef.current) return;
    const editor = editorRef.current;
    const bounds = clusterBoundsById[activeClusterId];
    if (!editor || !bounds) return;

    const scale = editor.getScale();
    const [canvasWidth, canvasHeight] = editor.getSize();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const nextOriginX = canvasWidth / (2 * scale) - centerX;
    const nextOriginY = canvasHeight / (2 * scale) - centerY;
    editor.setOrigin(nextOriginX, nextOriginY);
    syncViewportFromEditor(editor);
    lastCenteredClusterRef.current = activeClusterId;
  }, [activeClusterId, clusterBoundsById, syncViewportFromEditor]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const editor = editorRef.current;
      if (!editor) return;
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          editor.setSize(width, height);
          syncViewportFromEditor(editor);
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [syncViewportFromEditor]);

  return (
    <main
      ref={containerRef}
      className={className ?? "relative w-screen h-screen overflow-hidden bg-background"}
    >
      {/* @ts-expect-error -- @dgmjs/react FC types compiled against React 18, incompatible with React 19 JSX constraints */}
      <DGMEditorCore
        className="absolute inset-0"
        options={{ defaultHandlerId: "Hand", canvasColor: "#0e0e0e", gridColor: "#1a1a1a" }}
        darkMode={true}
        plugins={yjsSync?.plugins}
        showGrid={showGrid}
        onMount={handleMount}
        onActiveHandlerChange={(handlerId: string) => setActiveHandler(handlerId)}
        onScroll={handleScroll}
        onZoom={handleZoom}
      />

      <ClusterCanvas
        clusters={clusters}
        cards={cards}
        viewport={viewport}
        isViewportSyncing={isViewportSyncing}
        isDragging={isDragging}
        isResizing={isResizing}
        activeInteractionKey={activeInteractionKey}
        startInteraction={startInteraction}
        togglePin={togglePin}
        toggleFullscreen={toggleFullscreen}
        onClusterBoundsChange={setClusterBoundsById}
      />

      {showPalette && (
        <>
          <aside
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[4] flex items-center gap-0.5 px-1.5 py-1.5 rounded-2xl border border-white/[0.08] bg-[#1e1e2e]/90 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
            aria-label="Canvas tools"
          >
            {TOOL_GROUPS.map((group, gi) => (
              <div key={gi} className="flex items-center">
                {gi > 0 && <div className="w-px h-6 mx-0.5 bg-white/[0.08]" />}
                {group.map((tool) => {
                  const isActive = tool.id === activeHandler;
                  const Icon = TOOL_ICONS[tool.id];
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      title={tool.label}
                      className={[
                        "relative flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-150 cursor-pointer",
                        isActive
                          ? "bg-white/[0.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                          : "text-white/50 hover:text-white/80 hover:bg-white/[0.06]",
                      ].join(" ")}
                      onClick={() => activateTool(tool.id)}
                    >
                      {/* @ts-expect-error -- lucide-react icon type mismatch */}
                      <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="w-px h-6 mx-0.5 bg-white/[0.08]" />
            <button
              type="button"
              title="Inspiration"
              className={[
                "relative flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-150 cursor-pointer",
                inspirationOpen
                  ? "bg-white/[0.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "text-white/50 hover:text-white/80 hover:bg-white/[0.06]",
              ].join(" ")}
              onClick={() => setInspirationOpen((v) => !v)}
            >
              {/* @ts-expect-error -- lucide-react icon type mismatch */}
              <Sparkles size={18} strokeWidth={inspirationOpen ? 2 : 1.5} />
            </button>
          </aside>

          <InspirationSearch
            open={inspirationOpen}
            onClose={() => setInspirationOpen(false)}
            editorRef={editorRef}
          />
        </>
      )}
    </main>
  );
}
