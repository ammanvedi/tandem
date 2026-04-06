"use client";

import { useMemo } from "react";
import { DotMatrixGraph } from "@/components/dot-matrix-graph";
import { MarqueeText } from "@/components/marquee-text";

interface Participant {
  userId: string;
  name: string;
  status: string;
}

interface ChatStatusBarProps {
  participants: Participant[];
  sandboxStatus?: string;
  connected: boolean;
  connecting: boolean;
  className?: string;
}

const MOCK_MEMORY_VALUES = [1.2, 1.4, 1.3, 1.6, 1.5, 1.8, 1.6, 1.4, 1.7, 1.9, 1.6, 1.5];
const MAX_MEMORY_GB = 5;

function getStatusText(sandboxStatus?: string, connected?: boolean, connecting?: boolean): string {
  if (connecting) return "CONNECTING";
  if (!connected) return "DISCONNECTED";
  if (!sandboxStatus) return "READY";

  const statusMap: Record<string, string> = {
    pending: "GETTING READY",
    warming: "WARMING UP",
    syncing: "SYNCING",
    ready: "READY",
    running: "RUNNING",
    stopped: "STOPPED",
    failed: "FAILED",
  };

  return statusMap[sandboxStatus] ?? sandboxStatus.toUpperCase();
}

function getStatusColor(sandboxStatus?: string, connected?: boolean, connecting?: boolean): string {
  if (!connected && !connecting) return "bg-red-500";
  if (connecting) return "bg-yellow-500";
  if (sandboxStatus === "failed") return "bg-red-500";
  if (["pending", "warming", "syncing"].includes(sandboxStatus || "")) return "bg-yellow-500";
  return "bg-success";
}

export function ChatStatusBar({
  participants,
  sandboxStatus,
  connected,
  connecting,
  className = "",
}: ChatStatusBarProps) {
  const uniqueParticipants = useMemo(
    () => Array.from(new Map(participants.map((p) => [p.userId, p])).values()),
    [participants]
  );

  const statusText = getStatusText(sandboxStatus, connected, connecting);
  const statusColor = getStatusColor(sandboxStatus, connected, connecting);
  const currentMemory = MOCK_MEMORY_VALUES[MOCK_MEMORY_VALUES.length - 1] ?? 0;

  return (
    <div
      className={`flex items-center justify-between rounded-lg px-4 py-2 backdrop-blur-[4px] bg-black/12 ${className}`}
    >
      {/* Left: participant avatars */}
      <div className="flex items-center gap-1">
        {uniqueParticipants.slice(0, 4).map((p) => (
          <div
            key={p.userId}
            className="w-7 h-7 rounded bg-surface-button flex items-center justify-center text-[10px] font-medium text-foreground"
            title={p.name}
          >
            {p.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {uniqueParticipants.length > 4 && (
          <div className="w-7 h-7 rounded bg-surface-button flex items-center justify-center text-[10px] font-medium text-muted-foreground">
            +{uniqueParticipants.length - 4}
          </div>
        )}
      </div>

      {/* Right: status + memory */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${statusColor}`} />
            <div className="w-14">
              <MarqueeText
                text={statusText}
                className="text-[12px] text-muted-foreground tracking-[-0.24px] uppercase"
              />
            </div>
          </div>
          <span className="text-[12px] text-muted-foreground tracking-[-0.24px]">
            {currentMemory.toFixed(1)}/{MAX_MEMORY_GB}GB
          </span>
        </div>
        <DotMatrixGraph values={MOCK_MEMORY_VALUES} maxValue={MAX_MEMORY_GB} rows={5} cols={12} />
      </div>
    </div>
  );
}
