"use client";

import { memo, useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import type { SandboxEvent } from "@/types/session";
import { SafeMarkdown } from "@/components/safe-markdown";
import { ToolCallGroup } from "@/components/tool-call-group";
import { ChatStatusBar } from "@/components/chat-status-bar";
import { DotMatrixWaveform } from "@/components/dot-matrix-waveform";
import { copyToClipboard, formatModelNameLower } from "@/lib/format";
import type { useSessionSocket } from "@/hooks/use-session-socket";
import {
  CheckIcon,
  CopyIcon,
  ErrorIcon,
  LightbulbIcon,
  AudioLinesIcon,
  SendIcon,
  StopIcon,
  BranchIcon,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { SHORTCUT_LABELS } from "@/lib/keyboard-shortcuts";
import { DEFAULT_MODEL, getDefaultReasoningEffort } from "@open-inspect/shared";
import { useEnabledModels } from "@/hooks/use-enabled-models";
import { ReasoningEffortPills } from "@/components/reasoning-effort-pills";

type ToolCallEvent = Extract<SandboxEvent, { type: "tool_call" }>;

type EventGroup =
  | { type: "tool_group"; events: ToolCallEvent[]; id: string }
  | { type: "single"; event: SandboxEvent; id: string };

function groupEvents(events: SandboxEvent[]): EventGroup[] {
  const groups: EventGroup[] = [];
  let currentToolGroup: ToolCallEvent[] = [];
  let groupIndex = 0;

  const flushToolGroup = () => {
    if (currentToolGroup.length > 0) {
      groups.push({
        type: "tool_group",
        events: [...currentToolGroup],
        id: `tool-group-${groupIndex++}`,
      });
      currentToolGroup = [];
    }
  };

  for (const event of events) {
    if (event.type === "tool_call") {
      if (currentToolGroup.length > 0 && currentToolGroup[0].tool === event.tool) {
        currentToolGroup.push(event);
      } else {
        flushToolGroup();
        currentToolGroup = [event];
      }
    } else {
      flushToolGroup();
      groups.push({
        type: "single",
        event,
        id: `single-${event.type}-${("messageId" in event ? event.messageId : undefined) || event.timestamp}-${groupIndex++}`,
      });
    }
  }

  flushToolGroup();
  return groups;
}

function dedupeAndGroupEvents(events: SandboxEvent[]): EventGroup[] {
  const filteredEvents: Array<SandboxEvent | null> = [];
  const seenToolCalls = new Map<string, number>();
  const seenCompletions = new Set<string>();
  const seenTokens = new Map<string, number>();
  const seenUserMessages = new Set<string>();

  for (const event of events) {
    if (event.type === "tool_call" && event.callId) {
      const existingIdx = seenToolCalls.get(event.callId);
      if (existingIdx !== undefined) {
        filteredEvents[existingIdx] = event;
      } else {
        seenToolCalls.set(event.callId, filteredEvents.length);
        filteredEvents.push(event);
      }
    } else if (event.type === "execution_complete" && event.messageId) {
      if (!seenCompletions.has(event.messageId)) {
        seenCompletions.add(event.messageId);
        filteredEvents.push(event);
      }
    } else if (event.type === "token" && event.messageId) {
      const existingIdx = seenTokens.get(event.messageId);
      if (existingIdx !== undefined) {
        filteredEvents[existingIdx] = null;
      }
      seenTokens.set(event.messageId, filteredEvents.length);
      filteredEvents.push(event);
    } else if (event.type === "user_message" && event.messageId) {
      if (!seenUserMessages.has(event.messageId)) {
        seenUserMessages.add(event.messageId);
        filteredEvents.push(event);
      }
    } else {
      filteredEvents.push(event);
    }
  }

  return groupEvents(filteredEvents.filter((event): event is SandboxEvent => event !== null));
}

interface ChatPanelProps {
  sessionState: ReturnType<typeof useSessionSocket>["sessionState"];
  connected: boolean;
  connecting: boolean;
  events: SandboxEvent[];
  participants: ReturnType<typeof useSessionSocket>["participants"];
  currentParticipantId: string | null;
  isProcessing: boolean;
  loadingHistory: boolean;
  sendPrompt: (content: string, model?: string, reasoningEffort?: string) => void;
  stopExecution: () => void;
  sendTyping: () => void;
  loadOlderEvents: () => void;
  className?: string;
}

export function ChatPanel({
  sessionState,
  connected,
  connecting,
  events,
  participants,
  currentParticipantId,
  isProcessing,
  loadingHistory,
  sendPrompt,
  stopExecution,
  sendTyping,
  loadOlderEvents,
  className = "",
}: ChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  const [reasoningEffort, setReasoningEffort] = useState<string | undefined>(
    getDefaultReasoningEffort(DEFAULT_MODEL)
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const { scrollRef, contentRef } = useStickToBottom();

  const { enabledModels } = useEnabledModels();

  useEffect(() => {
    if (enabledModels.length > 0 && !enabledModels.includes(selectedModel)) {
      const fallback = enabledModels[0] ?? DEFAULT_MODEL;
      setSelectedModel(fallback);
      setReasoningEffort(getDefaultReasoningEffort(fallback));
    }
  }, [enabledModels, selectedModel]);

  useEffect(() => {
    if (sessionState?.model) {
      setSelectedModel(sessionState.model);
      setReasoningEffort(
        sessionState.reasoningEffort ?? getDefaultReasoningEffort(sessionState.model)
      );
    }
  }, [sessionState?.model, sessionState?.reasoningEffort]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isProcessing) return;
    sendPrompt(prompt, selectedModel, reasoningEffort);
    setPrompt("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTyping(), 300);
  };

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry.isIntersecting &&
          hasScrolledRef.current &&
          container.scrollHeight > container.clientHeight
        ) {
          loadOlderEvents();
        }
      },
      { root: container, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadOlderEvents, scrollRef]);

  const groupedEvents = useMemo(() => dedupeAndGroupEvents(events), [events]);

  const branchName = sessionState?.branchName || sessionState?.baseBranch || null;

  return (
    <div className={`flex flex-col h-full bg-surface-chat ${className}`}>
      {/* Messages area with sticky status bar */}
      <div
        ref={scrollRef}
        onScroll={() => {
          hasScrolledRef.current = true;
        }}
        className="flex-1 overflow-y-auto"
      >
        {/* Sticky floating status bar */}
        <div className="sticky top-0 z-10 px-6 pt-6 pb-2 backdrop-blur-md bg-surface-chat/80">
          <ChatStatusBar
            participants={participants}
            sandboxStatus={sessionState?.sandboxStatus}
            connected={connected}
            connecting={connecting}
          />
        </div>

        <div ref={contentRef} className="space-y-3 px-6 pt-4 pb-12">
          <div ref={topSentinelRef} className="h-1" />
          {loadingHistory && (
            <div className="text-center text-muted-foreground text-xs py-2">Loading...</div>
          )}
          {events.length === 0 && connecting && <ChatSkeleton />}
          {groupedEvents.map((group) =>
            group.type === "tool_group" ? (
              <ToolCallGroup key={group.id} events={group.events} groupId={group.id} />
            ) : (
              <ChatEventItem
                key={group.id}
                event={group.event}
                currentParticipantId={currentParticipantId}
              />
            )
          )}
          <div />
        </div>
      </div>

      {/* Input area with floating waveform */}
      <div className="px-6 pb-6 relative">
        {isProcessing && (
          <div className="absolute bottom-[calc(100%+4px)] left-6">
            <DotMatrixWaveform />
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="rounded-lg overflow-hidden">
            {/* Text input */}
            <div className="bg-surface-elevated relative">
              <textarea
                ref={inputRef}
                value={prompt}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={isProcessing ? "Type your next message..." : "Ask or build anything"}
                className="w-full resize-none bg-transparent px-4 pt-4 pb-3 focus:outline-none text-foreground placeholder:text-text-warm-muted text-[16px] tracking-[-0.8px]"
                rows={3}
              />
              {/* Action buttons row */}
              <div className="flex items-center justify-between px-4 pb-3">
                <Button type="button" variant="surface" size="compact">
                  <LightbulbIcon className="w-3 h-3" />
                  PLAN
                </Button>
                <div className="flex items-center gap-1.5">
                  {isProcessing && (
                    <Button
                      type="button"
                      variant="surface"
                      size="icon-24"
                      onClick={stopExecution}
                      title="Stop"
                    >
                      <StopIcon className="w-3 h-3" />
                    </Button>
                  )}
                  <Button type="button" variant="surface" size="icon-24" title="Voice input">
                    <AudioLinesIcon className="w-3 h-3" />
                  </Button>
                  <Button
                    type="submit"
                    variant="surface"
                    size="icon-24"
                    disabled={!prompt.trim() || isProcessing}
                    title={`Send (${SHORTCUT_LABELS.SEND_PROMPT})`}
                  >
                    <SendIcon className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Footer row */}
            <div className="bg-surface-footer flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[12px] text-text-warm-muted tracking-[-0.24px] uppercase whitespace-nowrap">
                  {formatModelNameLower(selectedModel).toUpperCase()}
                </span>
                <ReasoningEffortPills
                  selectedModel={selectedModel}
                  reasoningEffort={reasoningEffort}
                  onSelect={setReasoningEffort}
                  disabled={isProcessing}
                />
              </div>
              {branchName && (
                <div className="flex items-center gap-1 text-[12px] text-text-warm-muted tracking-[-0.24px]">
                  <BranchIcon className="w-3 h-3" />
                  <span className="truncate max-w-[160px]">{branchName}</span>
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-3 py-2 animate-pulse">
      <div className="bg-surface-elevated rounded-lg p-4 space-y-2 ml-auto w-3/4">
        <div className="h-2 w-20 bg-muted rounded" />
        <div className="h-2 w-full bg-muted rounded" />
      </div>
      <div className="bg-surface-elevated rounded-lg p-4 space-y-2 w-3/4">
        <div className="h-2 w-16 bg-muted rounded" />
        <div className="h-2 w-4/5 bg-muted rounded" />
      </div>
    </div>
  );
}

const ChatEventItem = memo(function ChatEventItem({
  event,
  currentParticipantId,
}: {
  event: SandboxEvent;
  currentParticipantId: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const time = new Date(event.timestamp * 1000).toLocaleTimeString();

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopyContent = useCallback(async (content: string) => {
    const success = await copyToClipboard(content);
    if (!success) return;
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => {
      setCopied(false);
      copyTimeoutRef.current = null;
    }, 1500);
  }, []);

  switch (event.type) {
    case "user_message": {
      if (!event.content) return null;
      const messageContent = event.content;
      const isCurrentUser =
        event.author?.participantId && currentParticipantId
          ? event.author.participantId === currentParticipantId
          : !event.author;
      const authorName = isCurrentUser ? "You" : event.author?.name || "Unknown User";

      return (
        <div className="group bg-surface-user-message rounded-lg p-4 ml-auto max-w-[85%]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {!isCurrentUser && event.author?.avatar && (
                <img src={event.author.avatar} alt={authorName} className="w-5 h-5 rounded" />
              )}
              <span className="text-[12px] text-text-warm-muted tracking-[-0.24px] uppercase">
                {authorName}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleCopyContent(messageContent)}
                className="p-1 text-text-warm-muted hover:text-foreground opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-colors"
                title={copied ? "Copied" : "Copy"}
                aria-label={copied ? "Copied" : "Copy"}
              >
                {copied ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
              </button>
              <span className="text-[12px] text-text-warm-muted tracking-[-0.24px]">{time}</span>
            </div>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-foreground">{messageContent}</pre>
        </div>
      );
    }

    case "token": {
      if (!event.content) return null;
      const messageContent = event.content;
      return (
        <div className="group bg-surface-elevated rounded-lg p-4 mr-auto max-w-[85%]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-text-warm-muted tracking-[-0.24px] uppercase">
              Assistant
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleCopyContent(messageContent)}
                className="p-1 text-text-warm-muted hover:text-foreground opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-colors"
                title={copied ? "Copied" : "Copy"}
                aria-label={copied ? "Copied" : "Copy"}
              >
                {copied ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
              </button>
              <span className="text-[12px] text-text-warm-muted tracking-[-0.24px]">{time}</span>
            </div>
          </div>
          <SafeMarkdown content={messageContent} className="text-sm" />
        </div>
      );
    }

    case "tool_call":
      return null;

    case "tool_result":
      if (!event.error) return null;
      return (
        <div className="flex items-center gap-2 text-sm text-red-400 py-1">
          <ErrorIcon className="w-4 h-4" />
          <span className="truncate">{event.error}</span>
          <span className="text-[12px] text-text-warm-muted ml-auto">{time}</span>
        </div>
      );

    case "git_sync":
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          Git sync: {event.status}
          <span className="text-[11px]">{time}</span>
        </div>
      );

    case "error":
      return (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Error{event.error ? `: ${event.error}` : ""}
          <span className="text-[12px] text-text-warm-muted">{time}</span>
        </div>
      );

    case "execution_complete":
      if (event.success === false) {
        return (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            Execution failed{event.error ? `: ${event.error}` : ""}
            <span className="text-[12px] text-text-warm-muted">{time}</span>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 text-sm text-success">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          Execution complete
          <span className="text-[12px] text-text-warm-muted">{time}</span>
        </div>
      );

    default:
      return null;
  }
});
