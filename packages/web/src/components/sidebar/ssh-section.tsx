"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/format";
import { TerminalIcon, CheckIcon, CopyIcon, LinkIcon } from "@/components/ui/icons";
import type { SandboxStatus } from "@open-inspect/shared";

interface SshSectionProps {
  host: string;
  port: number;
  password: string;
  repoName: string;
  sandboxStatus: SandboxStatus;
}

const ACTIVE_STATUSES: Set<SandboxStatus> = new Set(["ready", "running", "snapshotting"]);
const STARTING_STATUSES: Set<SandboxStatus> = new Set([
  "pending",
  "spawning",
  "connecting",
  "warming",
  "syncing",
]);

export function SshSection({ host, port, password, repoName, sandboxStatus }: SshSectionProps) {
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const isActive = ACTIVE_STATUSES.has(sandboxStatus);
  const isStarting = STARTING_STATUSES.has(sandboxStatus);
  const sshCommand = `ssh -p ${port} root@${host}`;
  const cursorUrl = `cursor://vscode-remote/ssh-remote+root@${host}:${port}/workspace/${repoName}`;

  const handleCopyCommand = async () => {
    const success = await copyToClipboard(sshCommand);
    if (success) {
      setCopiedCommand(true);
      setTimeout(() => setCopiedCommand(false), 2000);
    }
  };

  const handleCopyPassword = async () => {
    const success = await copyToClipboard(password);
    if (success) {
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm">
        <TerminalIcon
          className={`w-4 h-4 shrink-0 ${isActive ? "text-muted-foreground" : "text-muted-foreground/50"}`}
        />
        {isActive ? (
          <>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[180px]">
              {sshCommand}
            </code>
            <button
              onClick={handleCopyCommand}
              className="p-1 hover:bg-muted transition-colors shrink-0"
              title={copiedCommand ? "Copied!" : "Copy SSH command"}
            >
              {copiedCommand ? (
                <CheckIcon className="w-3.5 h-3.5 text-success" />
              ) : (
                <CopyIcon className="w-3.5 h-3.5 text-secondary-foreground" />
              )}
            </button>
          </>
        ) : (
          <span className="text-muted-foreground truncate">
            {isStarting ? "SSH starting\u2026" : "SSH unavailable"}
          </span>
        )}
      </div>
      {isActive && (
        <>
          <div className="flex items-center gap-2 text-sm pl-6">
            <span className="text-muted-foreground text-xs">Password:</span>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[120px]">
              {password}
            </code>
            <button
              onClick={handleCopyPassword}
              className="p-1 hover:bg-muted transition-colors shrink-0"
              title={copiedPassword ? "Copied!" : "Copy password"}
            >
              {copiedPassword ? (
                <CheckIcon className="w-3.5 h-3.5 text-success" />
              ) : (
                <CopyIcon className="w-3.5 h-3.5 text-secondary-foreground" />
              )}
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm pl-6">
            <a
              href={cursorUrl}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Open in Cursor"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              Open in Cursor
            </a>
          </div>
        </>
      )}
    </div>
  );
}
