import type { ReactNode } from "react";

export type CardMode = "canvas" | "fullscreen";

export type CardSize = {
  width: number;
  height: number;
};

export type Point2D = [number, number];

export type CardShadow = {
  worldPos: Point2D;
  size: CardSize;
};

export type InteractiveCard = {
  id: string;
  clusterId: string;
  title: string;
  content: ReactNode;
  mode: CardMode;
  isPinned: boolean;
  canvasWorldPos: Point2D;
  canvasSize: CardSize;
  pinnedPos: Point2D;
  pinnedSize: CardSize;
  shadowOnCanvas: CardShadow | null;
};

export type InteractionPlane = "canvas" | "pinned";
export type InteractionKind = "drag" | "resize";

export const MIN_CARD_WIDTH = 180;
export const MIN_CARD_HEIGHT = 100;
export const MAX_CARD_WIDTH = 1200;
export const MAX_CARD_HEIGHT = 900;
