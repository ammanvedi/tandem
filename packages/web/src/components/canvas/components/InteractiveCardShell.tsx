import type { CSSProperties, ReactNode } from "react";

type InteractiveCardShellProps = {
  className: string;
  style: CSSProperties;
  title: string;
  pinLabel: string;
  fullscreenLabel: string;
  isDragging: boolean;
  onDragStart: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onTogglePin: () => void;
  onToggleFullscreen: () => void;
  disableInteractions: boolean;
  children: ReactNode;
};

export function InteractiveCardShell({
  className,
  style,
  title,
  pinLabel,
  fullscreenLabel,
  isDragging,
  onDragStart,
  onResizeStart,
  onTogglePin,
  onToggleFullscreen,
  disableInteractions,
  children,
}: InteractiveCardShellProps) {
  return (
    <div
      className={className}
      style={style}
      data-canvas-card
      onPointerDown={(event) => event.stopPropagation()}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="flex justify-between items-center gap-2">
        <button
          type="button"
          className={`border border-slate-400/50 rounded-lg bg-slate-800/85 text-slate-200 text-[0.75rem] leading-none px-[0.6rem] py-[0.4rem] select-none disabled:cursor-not-allowed disabled:opacity-55 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          draggable={false}
          onMouseDown={onDragStart}
          disabled={disableInteractions}
        >
          Drag
        </button>
        <div className="flex gap-[0.45rem]">
          <button
            type="button"
            className="border border-slate-400/50 rounded-lg bg-slate-800/85 text-slate-200 text-[0.75rem] leading-none px-[0.6rem] py-[0.4rem] cursor-pointer"
            onClick={onTogglePin}
          >
            {pinLabel}
          </button>
          <button
            type="button"
            className="border border-slate-400/50 rounded-lg bg-slate-800/85 text-slate-200 text-[0.75rem] leading-none px-[0.6rem] py-[0.4rem] cursor-pointer"
            onClick={onToggleFullscreen}
          >
            {fullscreenLabel}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-[0.3rem] w-full h-full">
        <strong>{title}</strong>
        {children}
      </div>

      <button
        type="button"
        className="absolute right-2 bottom-2 w-3.5 h-3.5 border-none rounded-[4px] bg-transparent cursor-nwse-resize select-none disabled:cursor-not-allowed disabled:opacity-55 before:block before:w-full before:h-full before:border-r-2 before:border-b-2 before:border-indigo-400/95 before:rounded-[2px]"
        aria-label={`Resize ${title}`}
        draggable={false}
        onMouseDown={onResizeStart}
        disabled={disableInteractions}
      />
    </div>
  );
}
