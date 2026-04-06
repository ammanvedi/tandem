import type { ReactNode } from "react";
import type { CardSize, Point2D } from "./cards";

export type ClusterItemRenderMode = "interactive" | "static";

export type ClusterLayoutOptions = {
  padding?: number;
  gap?: number;
  maxRowWidth?: number;
  titleBandHeight?: number;
};

export type ClusterItem = {
  id: string;
  title: string;
  size: CardSize;
  renderMode: ClusterItemRenderMode;
  content: ReactNode;
};

export type ClusterDefinition = {
  id: string;
  title: string;
  worldOrigin: Point2D;
  items: ClusterItem[];
  layout?: ClusterLayoutOptions;
};

export type WorldRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ClusterFocusOptions = {
  padding?: number;
};
