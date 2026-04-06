import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { InteractiveCardShell } from "./InteractiveCardShell";

type CardVariantProps = {
  className: string;
  style: CSSProperties;
  title: string;
  pinLabel: string;
  fullscreenLabel: string;
  disableInteractions: boolean;
  isDragging: boolean;
  onDragStart: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onTogglePin: () => void;
  onToggleFullscreen: () => void;
  children: ReactNode;
};

export function CanvasCard(props: CardVariantProps) {
  return <InteractiveCardShell {...props} />;
}

export function PinnedCard(props: CardVariantProps) {
  return <InteractiveCardShell {...props} />;
}

export function FullscreenCard(props: CardVariantProps) {
  return <InteractiveCardShell {...props} />;
}
