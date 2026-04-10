"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type DragEvent,
} from "react";
import type { SessionSocketState } from "@/hooks/use-chat-workspace";
import type { SandboxEvent } from "@/types/session";
import type { Attachment, CanvasReference } from "@open-inspect/shared";
import { SafeMarkdown } from "@/components/safe-markdown";
import { SendIcon } from "@/components/ui/icons";
import { CANVAS_REFERENCE_MIME } from "./IframeCard";

interface SandboxChatCardProps {
  sessionId: string;
  title: string;
  socketState: SessionSocketState;
  className?: string;
}

function getStatusColor(sandboxStatus: string | undefined): string {
  switch (sandboxStatus) {
    case "ready":
    case "running":
      return "bg-green-400";
    case "spawning":
    case "connecting":
    case "warming":
    case "syncing":
      return "bg-yellow-400";
    case "failed":
    case "stopped":
    case "stale":
      return "bg-red-400";
    default:
      return "bg-gray-400";
  }
}

export function SandboxChatCard({ title, socketState, className = "" }: SandboxChatCardProps) {
  const { sessionState, events, isProcessing, sendPrompt, stopExecution, sendTyping } = socketState;

  const [inputValue, setInputValue] = useState("");
  const [pendingRefs, setPendingRefs] = useState<CanvasReference[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  const handleSend = useCallback(() => {
    const content = inputValue.trim();
    if (!content && pendingRefs.length === 0) return;

    const attachments: Attachment[] = pendingRefs.map((ref) => ({
      type: "canvas_reference" as const,
      name: ref.metadata?.title ? String(ref.metadata.title) : `Canvas ${ref.elementType}`,
      canvasReference: ref,
    }));

    sendPrompt(
      content || "(canvas reference)",
      undefined,
      undefined,
      attachments.length ? attachments : undefined
    );
    setInputValue("");
    setPendingRefs([]);
  }, [inputValue, pendingRefs, sendPrompt]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      sendTyping();
    },
    [sendTyping]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes(CANVAS_REFERENCE_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);

    const data = e.dataTransfer.getData(CANVAS_REFERENCE_MIME);
    if (!data) return;

    try {
      const ref = JSON.parse(data) as CanvasReference;
      setPendingRefs((prev) => [...prev, ref]);
      inputRef.current?.focus();
    } catch {
      // invalid JSON — ignore
    }
  }, []);

  const removePendingRef = useCallback((index: number) => {
    setPendingRefs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const displayEvents = groupChatEvents(events);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col bg-slate-900/95 backdrop-blur rounded-xl border overflow-hidden transition-colors ${
        dragOver ? "border-blue-400/60 ring-1 ring-blue-400/30" : "border-white/10"
      } ${className}`}
      style={{ width: 380, height: 460 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <span
          className={`w-2 h-2 rounded-full ${getStatusColor(sessionState?.sandboxStatus)} flex-shrink-0`}
        />
        <span className="text-sm font-medium text-white truncate">{title}</span>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {displayEvents.map((group, i) => (
          <ChatEventGroup key={i} group={group} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending canvas references */}
      {pendingRefs.length > 0 && (
        <div className="px-3 pt-1 flex flex-wrap gap-1">
          {pendingRefs.map((ref, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-300 text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30"
            >
              <span className="opacity-60">◇</span>
              {ref.metadata?.title ? String(ref.metadata.title) : ref.elementType}
              <button
                onClick={() => removePendingRef(i)}
                className="ml-0.5 hover:text-white transition"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Drop zone indicator */}
      {dragOver && (
        <div className="px-3 py-2 text-center text-xs text-blue-300/80">
          Drop to attach as reference
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-1">
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={2}
            className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-[10px] text-white/30 uppercase tracking-wide">
              {sessionState?.model || ""}
            </span>
            <div className="flex items-center gap-2">
              {isProcessing && (
                <button
                  onClick={stopExecution}
                  className="text-[10px] text-red-400 hover:text-red-300 transition uppercase tracking-wide"
                >
                  Stop
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={(!inputValue.trim() && pendingRefs.length === 0) || isProcessing}
                className="w-6 h-6 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <SendIcon className="w-3 h-3 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ChatGroupItem {
  type: "user" | "agent" | "system";
  content: string;
  timestamp: number;
}

function groupChatEvents(events: SandboxEvent[]): ChatGroupItem[] {
  const items: ChatGroupItem[] = [];
  let currentAgentTokens: string[] = [];
  let lastTokenTimestamp = 0;

  for (const event of events) {
    if (event.type === "user_message") {
      if (currentAgentTokens.length > 0) {
        items.push({
          type: "agent",
          content: currentAgentTokens.join(""),
          timestamp: lastTokenTimestamp,
        });
        currentAgentTokens = [];
      }
      items.push({
        type: "user",
        content: event.content,
        timestamp: event.timestamp,
      });
    } else if (event.type === "token") {
      currentAgentTokens.push(event.content);
      lastTokenTimestamp = event.timestamp;
    } else if (event.type === "error") {
      if (currentAgentTokens.length > 0) {
        items.push({
          type: "agent",
          content: currentAgentTokens.join(""),
          timestamp: lastTokenTimestamp,
        });
        currentAgentTokens = [];
      }
      items.push({
        type: "system",
        content: event.error,
        timestamp: event.timestamp,
      });
    }
  }

  if (currentAgentTokens.length > 0) {
    items.push({
      type: "agent",
      content: currentAgentTokens.join(""),
      timestamp: lastTokenTimestamp,
    });
  }

  return items;
}

function ChatEventGroup({ group }: { group: ChatGroupItem }) {
  if (group.type === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-white/10 rounded-2xl px-3 py-2 max-w-[85%]">
          <p className="text-sm text-white whitespace-pre-wrap break-words">{group.content}</p>
        </div>
      </div>
    );
  }

  if (group.type === "agent") {
    return (
      <div className="max-w-[95%]">
        <div className="text-sm text-white/80 prose prose-invert prose-sm max-w-none">
          <SafeMarkdown content={group.content} />
        </div>
      </div>
    );
  }

  return <div className="text-xs text-red-400/80 px-2 py-1">{group.content}</div>;
}
