"use client";

import { getSafeExternalUrl } from "@/lib/urls";
import { BoxIcon } from "@/components/ui/icons";
import type { SandboxStatus } from "@open-inspect/shared";

interface MuxSectionProps {
  url: string;
  sandboxStatus: SandboxStatus;
  isWindowOpen?: boolean;
  onToggleWindow?: () => void;
}

const ACTIVE_STATUSES: Set<SandboxStatus> = new Set(["ready", "running", "snapshotting"]);
const STARTING_STATUSES: Set<SandboxStatus> = new Set([
  "pending",
  "spawning",
  "connecting",
  "warming",
  "syncing",
]);

export function MuxSection({ url, sandboxStatus, isWindowOpen, onToggleWindow }: MuxSectionProps) {
  const isActive = ACTIVE_STATUSES.has(sandboxStatus);
  const isStarting = STARTING_STATUSES.has(sandboxStatus);
  const safeUrl = getSafeExternalUrl(url);

  return (
    <div className="flex items-center gap-2 text-sm">
      <BoxIcon
        className={`w-4 h-4 shrink-0 ${isActive && safeUrl ? "text-muted-foreground" : "text-muted-foreground/50"}`}
      />
      {isActive && safeUrl ? (
        <div className="flex items-center gap-2 min-w-0">
          {onToggleWindow ? (
            <button
              type="button"
              onClick={onToggleWindow}
              className={`truncate ${isWindowOpen ? "text-accent font-medium" : "text-accent hover:underline"}`}
            >
              {isWindowOpen ? "Hide Mux" : "Show Mux"}
            </button>
          ) : (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline truncate"
            >
              Open Mux
            </a>
          )}
        </div>
      ) : (
        <span className="text-muted-foreground truncate">
          {isStarting ? "Mux starting\u2026" : "Mux unavailable"}
        </span>
      )}
    </div>
  );
}
