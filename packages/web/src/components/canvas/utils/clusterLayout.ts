import type { InteractiveCard } from "../types/cards";
import type { ClusterDefinition, ClusterLayoutOptions, WorldRect } from "../types/clusters";

const DEFAULT_LAYOUT: Required<ClusterLayoutOptions> = {
  padding: 28,
  gap: 18,
  maxRowWidth: 860,
  titleBandHeight: 30,
};

type LayoutItem = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ClusterComputedLayout = {
  clusterId: string;
  title: string;
  worldOrigin: [number, number];
  items: LayoutItem[];
  bounds: WorldRect;
};

const mergeLayout = (layout: ClusterLayoutOptions | undefined): Required<ClusterLayoutOptions> => ({
  ...DEFAULT_LAYOUT,
  ...layout,
});

export function computeClusterLayouts(clusters: ClusterDefinition[]): ClusterComputedLayout[] {
  return clusters.map((cluster) => {
    const cfg = mergeLayout(cluster.layout);
    const rowStart = cfg.padding;
    const contentLimit = rowStart + cfg.maxRowWidth;

    let cursorX = rowStart;
    let cursorY = cfg.padding + cfg.titleBandHeight;
    let rowHeight = 0;
    let contentMaxX = rowStart;
    const items: LayoutItem[] = [];

    for (const item of cluster.items) {
      const shouldWrap = cursorX > rowStart && cursorX + item.size.width > contentLimit;
      if (shouldWrap) {
        cursorX = rowStart;
        cursorY += rowHeight + cfg.gap;
        rowHeight = 0;
      }

      items.push({
        id: item.id,
        x: cursorX,
        y: cursorY,
        width: item.size.width,
        height: item.size.height,
      });

      contentMaxX = Math.max(contentMaxX, cursorX + item.size.width);
      cursorX += item.size.width + cfg.gap;
      rowHeight = Math.max(rowHeight, item.size.height);
    }

    const contentMaxY = items.length > 0 ? cursorY + rowHeight : cfg.padding + cfg.titleBandHeight;
    const bounds: WorldRect = {
      x: cluster.worldOrigin[0],
      y: cluster.worldOrigin[1],
      width: contentMaxX + cfg.padding,
      height: contentMaxY + cfg.padding,
    };

    return {
      clusterId: cluster.id,
      title: cluster.title,
      worldOrigin: cluster.worldOrigin,
      items,
      bounds,
    };
  });
}

export function getClusterBoundsByState(
  layouts: ClusterComputedLayout[],
  cards: InteractiveCard[]
): Record<string, WorldRect> {
  const boundsByClusterId = Object.fromEntries(
    layouts.map((layout) => [layout.clusterId, { ...layout.bounds }])
  ) as Record<string, WorldRect>;

  for (const card of cards) {
    const fallbackBounds = boundsByClusterId[card.clusterId];
    if (!fallbackBounds) continue;

    const source = card.shadowOnCanvas
      ? { worldPos: card.shadowOnCanvas.worldPos, size: card.shadowOnCanvas.size }
      : { worldPos: card.canvasWorldPos, size: card.canvasSize };
    const left = source.worldPos[0];
    const top = source.worldPos[1];
    const right = source.worldPos[0] + source.size.width;
    const bottom = source.worldPos[1] + source.size.height;

    const clusterRight = fallbackBounds.x + fallbackBounds.width;
    const clusterBottom = fallbackBounds.y + fallbackBounds.height;
    const nextLeft = Math.min(fallbackBounds.x, left - DEFAULT_LAYOUT.padding);
    const nextTop = Math.min(
      fallbackBounds.y,
      top - DEFAULT_LAYOUT.padding - DEFAULT_LAYOUT.titleBandHeight
    );
    const nextRight = Math.max(clusterRight, right + DEFAULT_LAYOUT.padding);
    const nextBottom = Math.max(clusterBottom, bottom + DEFAULT_LAYOUT.padding);

    boundsByClusterId[card.clusterId] = {
      x: nextLeft,
      y: nextTop,
      width: nextRight - nextLeft,
      height: nextBottom - nextTop,
    };
  }

  return boundsByClusterId;
}
