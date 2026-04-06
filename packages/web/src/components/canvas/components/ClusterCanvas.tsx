import { useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import type { InteractiveCard } from "../types/cards";
import type { ClusterDefinition, WorldRect } from "../types/clusters";
import type { ViewportState } from "../hooks/useEditorViewport";
import { CanvasCard, FullscreenCard, PinnedCard } from "./CardVariants";
import { computeClusterLayouts, getClusterBoundsByState } from "../utils/clusterLayout";

type ClusterCanvasProps = {
  clusters: ClusterDefinition[];
  cards: InteractiveCard[];
  viewport: ViewportState;
  isViewportSyncing: boolean;
  isDragging: boolean;
  isResizing: boolean;
  activeInteractionKey: string | null;
  startInteraction: (
    event: React.MouseEvent<HTMLButtonElement>,
    cardId: string,
    kind: "drag" | "resize",
    viewportScale: number
  ) => void;
  togglePin: (cardId: string, viewport: ViewportState) => void;
  toggleFullscreen: (cardId: string) => void;
  onClusterBoundsChange: (boundsByClusterId: Record<string, WorldRect>) => void;
};

const toCanvasStyle = (
  x: number,
  y: number,
  width: number,
  height: number,
  viewport: ViewportState
) => ({
  left: `${(x + viewport.origin[0]) * viewport.scale}px`,
  top: `${(y + viewport.origin[1]) * viewport.scale}px`,
  width: `${width}px`,
  height: `${height}px`,
  transform: `scale(${viewport.scale})`,
  transformOrigin: "top left",
});

const CARD_BASE =
  "z-[2] flex flex-col gap-2 px-[0.9rem] pt-[0.7rem] pb-[1.1rem] border border-indigo-500/80 rounded-xl bg-slate-900/[0.88] text-slate-200 origin-center shadow-[0_10px_25px_rgba(2,6,23,0.45)] backdrop-blur-[2px] overflow-hidden";

const TRANSITION_IDLE =
  "transition-[left,top,width,height,transform,border-color,background-color,box-shadow] duration-[220ms] ease-out";
const TRANSITION_ACTIVE =
  "transition-[border-color,background-color,box-shadow] duration-[220ms] ease-out";

export function ClusterCanvas({
  clusters,
  cards,
  viewport,
  isViewportSyncing,
  isDragging,
  isResizing,
  activeInteractionKey,
  startInteraction,
  togglePin,
  toggleFullscreen,
  onClusterBoundsChange,
}: ClusterCanvasProps) {
  const layouts = useMemo(() => computeClusterLayouts(clusters), [clusters]);

  const clusterBoundsById = useMemo(
    () => getClusterBoundsByState(layouts, cards),
    [layouts, cards]
  );

  useEffect(() => {
    onClusterBoundsChange(clusterBoundsById);
  }, [clusterBoundsById, onClusterBoundsChange]);

  const cardById = useMemo(() => new Map(cards.map((item) => [item.id, item])), [cards]);

  const getCardClassName = (card: InteractiveCard) => {
    const isActiveCard = activeInteractionKey === `card:${card.id}`;
    const cardIsDragging = isActiveCard && isDragging;
    const cardIsResizing = isActiveCard && isResizing;
    const isIdle =
      !cardIsDragging &&
      !cardIsResizing &&
      !(isViewportSyncing && card.mode === "canvas" && !card.isPinned);

    const parts = [CARD_BASE];

    if (card.mode === "fullscreen") {
      parts.push(
        "z-[7] border-indigo-400/95 bg-slate-900/[0.96] shadow-[0_20px_60px_rgba(2,6,23,0.7)] rounded-none"
      );
    } else if (card.isPinned) {
      parts.push("z-[6]");
    }

    parts.push(isIdle ? TRANSITION_IDLE : TRANSITION_ACTIVE);

    return parts.join(" ");
  };

  const isCardDragging = (card: InteractiveCard) =>
    activeInteractionKey === `card:${card.id}` && isDragging;

  const getCardStyle = (card: InteractiveCard): CSSProperties => {
    if (card.mode === "fullscreen") {
      return {
        left: "0px",
        top: "0px",
        width: "100vw",
        height: "100vh",
        transform: "none",
        position: "fixed",
      };
    }
    if (card.isPinned) {
      return {
        left: `${card.pinnedPos[0]}px`,
        top: `${card.pinnedPos[1]}px`,
        width: `${card.pinnedSize.width}px`,
        height: `${card.pinnedSize.height}px`,
        transform: "none",
        position: "fixed",
      };
    }
    return {
      ...toCanvasStyle(
        card.canvasWorldPos[0],
        card.canvasWorldPos[1],
        card.canvasSize.width,
        card.canvasSize.height,
        viewport
      ),
      position: "absolute",
    };
  };

  return (
    <>
      {layouts.map((layout) => {
        const bounds = clusterBoundsById[layout.clusterId];
        return (
          <section
            key={layout.clusterId}
            className="absolute z-[1] rounded-2xl border border-slate-400/[0.52] bg-[linear-gradient(180deg,rgba(30,41,59,0.24)_0%,rgba(15,23,42,0.14)_100%),rgba(15,23,42,0.1)] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.16)] pointer-events-none"
            style={toCanvasStyle(bounds.x, bounds.y, bounds.width, bounds.height, viewport)}
            aria-label={`${layout.title} boundary`}
          >
            <span className="absolute top-[10px] left-3 px-2 py-[3px] rounded-full border border-slate-400/55 bg-slate-900/[0.72] text-blue-100 text-[0.7rem] uppercase tracking-[0.04em]">
              {layout.title}
            </span>
          </section>
        );
      })}

      {cards.map((card) => {
        if (!card.isPinned || !card.shadowOnCanvas) return null;
        return (
          <div
            key={`${card.id}-shadow`}
            className="absolute z-[3] border border-dashed border-slate-400/95 rounded-xl bg-slate-900/[0.22] text-slate-200/85 flex items-start justify-start px-[0.7rem] py-[0.55rem] pointer-events-none"
            style={toCanvasStyle(
              card.shadowOnCanvas.worldPos[0],
              card.shadowOnCanvas.worldPos[1],
              card.shadowOnCanvas.size.width,
              card.shadowOnCanvas.size.height,
              viewport
            )}
          >
            <span className="text-[0.72rem]">{card.title} shadow</span>
          </div>
        );
      })}

      {layouts.map((layout) =>
        layout.items.map((layoutItem) => {
          const cluster = clusters.find((item) => item.id === layout.clusterId);
          const clusterItem = cluster?.items.find((item) => item.id === layoutItem.id);
          if (!clusterItem) return null;

          if (clusterItem.renderMode === "static") {
            const worldX = layout.worldOrigin[0] + layoutItem.x;
            const worldY = layout.worldOrigin[1] + layoutItem.y;
            return (
              <article
                key={layoutItem.id}
                className="absolute z-[2] rounded-xl border border-slate-400/60 bg-slate-900/80 text-slate-200 flex flex-col overflow-hidden shadow-[0_9px_20px_rgba(2,6,23,0.34)] pointer-events-none"
                style={toCanvasStyle(worldX, worldY, layoutItem.width, layoutItem.height, viewport)}
              >
                <header className="px-[0.72rem] py-[0.55rem] border-b border-slate-400/30 text-[0.74rem] text-slate-300">
                  {clusterItem.title}
                </header>
                <div className="flex flex-1 p-[0.72rem]">{clusterItem.content}</div>
              </article>
            );
          }

          const card = cardById.get(layoutItem.id);
          if (!card) return null;
          const commonProps = {
            className: getCardClassName(card),
            style: getCardStyle(card),
            title: card.title,
            pinLabel: card.isPinned ? "Unpin" : "Pin",
            fullscreenLabel: card.mode === "canvas" ? "Fullscreen" : "Back to canvas",
            disableInteractions: card.mode === "fullscreen",
            isDragging: isCardDragging(card),
            onDragStart: (event: React.MouseEvent<HTMLButtonElement>) =>
              startInteraction(event, card.id, "drag", viewport.scale),
            onResizeStart: (event: React.MouseEvent<HTMLButtonElement>) =>
              startInteraction(event, card.id, "resize", viewport.scale),
            onTogglePin: () => togglePin(card.id, viewport),
            onToggleFullscreen: () => toggleFullscreen(card.id),
            children: card.content,
          };
          if (card.mode === "fullscreen") return <FullscreenCard key={card.id} {...commonProps} />;
          if (card.isPinned) return <PinnedCard key={card.id} {...commonProps} />;
          return <CanvasCard key={card.id} {...commonProps} />;
        })
      )}
    </>
  );
}
