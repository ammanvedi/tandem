import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  MAX_CARD_HEIGHT,
  MAX_CARD_WIDTH,
  MIN_CARD_HEIGHT,
  MIN_CARD_WIDTH,
  type CardSize,
  type InteractionKind,
  type InteractiveCard,
  type Point2D,
} from "../types/cards";
import type { ViewportState } from "./useEditorViewport";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type ActiveInteraction = {
  cardId: string;
  kind: InteractionKind;
  plane: "canvas" | "pinned";
  startClient: Point2D;
  startPos: Point2D;
  startSize: CardSize;
  scale: number;
  element: HTMLElement;
  baseTransform: string;
  lastScreenDx: number;
  lastScreenDy: number;
};

const toScreenPoint = (worldPos: Point2D, viewport: ViewportState): Point2D => [
  (worldPos[0] + viewport.origin[0]) * viewport.scale,
  (worldPos[1] + viewport.origin[1]) * viewport.scale,
];

export function useInteractiveCardsState(initialCards: InteractiveCard[]) {
  const interactionRef = useRef<ActiveInteraction | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const cardsRef = useRef<InteractiveCard[]>(initialCards);

  const [cards, setCards] = useState<InteractiveCard[]>(initialCards);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [activeInteractionKey, setActiveInteractionKey] = useState<string | null>(null);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  const stopInteraction = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    interactionRef.current = null;
    setIsDragging(false);
    setIsResizing(false);
    setActiveInteractionKey(null);
  };

  useEffect(() => stopInteraction, []);

  const startInteraction = (
    event: ReactMouseEvent<HTMLButtonElement>,
    cardId: string,
    kind: InteractionKind,
    viewportScale: number
  ) => {
    const card = cardsRef.current.find((c) => c.id === cardId);
    if (!card || card.mode === "fullscreen") return;

    const element = event.currentTarget.closest("[data-canvas-card]") as HTMLElement | null;
    if (!element) return;

    event.preventDefault();
    event.stopPropagation();
    stopInteraction();

    const plane = card.isPinned ? "pinned" : "canvas";
    const scale = plane === "canvas" ? Math.max(viewportScale, 0.05) : 1;
    const baseTransform = plane === "canvas" ? `scale(${viewportScale})` : "";

    element.style.transition = "none";

    interactionRef.current = {
      cardId,
      kind,
      plane,
      startClient: [event.clientX, event.clientY],
      startPos: plane === "canvas" ? [...card.canvasWorldPos] : [...card.pinnedPos],
      startSize: plane === "canvas" ? { ...card.canvasSize } : { ...card.pinnedSize },
      scale,
      element,
      baseTransform,
      lastScreenDx: 0,
      lastScreenDy: 0,
    };

    setActiveInteractionKey(`card:${cardId}`);
    setIsDragging(kind === "drag");
    setIsResizing(kind === "resize");

    const onMove = (e: MouseEvent) => {
      const active = interactionRef.current;
      if (!active) return;

      const dxScreen = e.clientX - active.startClient[0];
      const dyScreen = e.clientY - active.startClient[1];
      active.lastScreenDx = dxScreen;
      active.lastScreenDy = dyScreen;

      if (active.kind === "drag") {
        const translate = `translate(${dxScreen}px, ${dyScreen}px)`;
        active.element.style.transform = active.baseTransform
          ? `${translate} ${active.baseTransform}`
          : translate;
      } else {
        const dxWorld = dxScreen / active.scale;
        const dyWorld = dyScreen / active.scale;
        active.element.style.width = `${clamp(active.startSize.width + dxWorld, MIN_CARD_WIDTH, MAX_CARD_WIDTH)}px`;
        active.element.style.height = `${clamp(active.startSize.height + dyWorld, MIN_CARD_HEIGHT, MAX_CARD_HEIGHT)}px`;
      }
    };

    const onUp = () => {
      const active = interactionRef.current;
      if (!active) {
        stopInteraction();
        return;
      }

      const dxWorld = active.lastScreenDx / active.scale;
      const dyWorld = active.lastScreenDy / active.scale;

      if (active.kind === "drag") {
        const newLeft = parseFloat(active.element.style.left || "0") + active.lastScreenDx;
        const newTop = parseFloat(active.element.style.top || "0") + active.lastScreenDy;
        active.element.style.left = `${newLeft}px`;
        active.element.style.top = `${newTop}px`;
      }
      active.element.style.transform = active.baseTransform || "";
      active.element.style.transition = "";

      setCards((prev) =>
        prev.map((item) => {
          if (item.id !== active.cardId) return item;
          if (active.kind === "drag") {
            const newPos: Point2D = [active.startPos[0] + dxWorld, active.startPos[1] + dyWorld];
            return item.isPinned
              ? { ...item, pinnedPos: newPos }
              : { ...item, canvasWorldPos: newPos };
          }
          const newSize: CardSize = {
            width: clamp(active.startSize.width + dxWorld, MIN_CARD_WIDTH, MAX_CARD_WIDTH),
            height: clamp(active.startSize.height + dyWorld, MIN_CARD_HEIGHT, MAX_CARD_HEIGHT),
          };
          return item.isPinned
            ? { ...item, pinnedSize: newSize }
            : { ...item, canvasSize: newSize };
        })
      );

      stopInteraction();
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    cleanupRef.current = () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
    };
  };

  const togglePin = (cardId: string, viewport: ViewportState) => {
    stopInteraction();
    setCards((prev) =>
      prev.map((item) => {
        if (item.id !== cardId) return item;
        if (item.isPinned) return { ...item, isPinned: false, shadowOnCanvas: null };
        const [left, top] = toScreenPoint(item.canvasWorldPos, viewport);
        return {
          ...item,
          mode: "canvas",
          isPinned: true,
          pinnedPos: [left, top],
          pinnedSize: {
            width: item.canvasSize.width * viewport.scale,
            height: item.canvasSize.height * viewport.scale,
          },
          shadowOnCanvas: {
            worldPos: [item.canvasWorldPos[0], item.canvasWorldPos[1]],
            size: { ...item.canvasSize },
          },
        };
      })
    );
  };

  const toggleFullscreen = (cardId: string) => {
    stopInteraction();
    setCards((prev) => {
      const target = prev.find((item) => item.id === cardId);
      if (!target) return prev;
      const nextMode = target.mode === "fullscreen" ? "canvas" : "fullscreen";
      return prev.map((item) =>
        item.id === cardId ? { ...item, mode: nextMode } : { ...item, mode: "canvas" }
      );
    });
  };

  return {
    cards,
    isDragging,
    isResizing,
    activeInteractionKey,
    startInteraction,
    stopInteraction,
    togglePin,
    toggleFullscreen,
  };
}
