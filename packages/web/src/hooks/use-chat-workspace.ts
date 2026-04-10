"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import type { Attachment, Chat, ChatCanvasState, SessionState } from "@open-inspect/shared";
import { useSessionSocket } from "./use-session-socket";
import type { SandboxEvent as LocalSandboxEvent } from "@/types/session";
import { SIDEBAR_CHATS_KEY } from "@/lib/session-list";

interface SessionEntry {
  id: string;
  title: string | null;
  repoOwner: string;
  repoName: string;
  status: string;
  model: string;
  createdAt: number;
  updatedAt: number;
}

interface ChatWithSessions extends Chat {
  sessions?: SessionEntry[];
}

export interface SessionSocketState {
  sessionId: string;
  connected: boolean;
  connecting: boolean;
  authError: string | null;
  connectionError: string | null;
  sessionState: SessionState | null;
  events: LocalSandboxEvent[];
  isProcessing: boolean;
  loadingHistory: boolean;
  sendPrompt: (
    content: string,
    model?: string,
    reasoningEffort?: string,
    attachments?: Attachment[]
  ) => void;
  stopExecution: () => void;
  sendTyping: () => void;
  reconnect: () => void;
  loadOlderEvents: () => void;
  participants: Array<{ participantId: string; name: string; avatar?: string; status: string }>;
  currentParticipantId: string | null;
  canvasSnapshotRequestRef: React.MutableRefObject<(() => unknown) | null>;
}

function useSessionSocketWrapper(sessionId: string): SessionSocketState {
  const socket = useSessionSocket(sessionId);
  return useMemo(
    () => ({
      sessionId,
      ...socket,
    }),
    [sessionId, socket]
  );
}

/**
 * Multi-session socket manager: manages WebSocket connections for each session
 * in a chat workspace.
 */
function useMultiSessionSockets(sessionIds: string[]): Map<string, SessionSocketState> {
  const socketStates = new Map<string, SessionSocketState>();

  // We use individual hooks per session. Since hooks can't be called
  // conditionally, we allocate a fixed number of "slots" and map sessions
  // into them. For now, support up to 8 concurrent sessions.
  const MAX_SESSIONS = 8;
  const slots: string[] = [];
  for (let i = 0; i < MAX_SESSIONS; i++) {
    slots.push(sessionIds[i] || "");
  }

  const s0 = useSessionSocketWrapper(slots[0] || "__noop_0");
  const s1 = useSessionSocketWrapper(slots[1] || "__noop_1");
  const s2 = useSessionSocketWrapper(slots[2] || "__noop_2");
  const s3 = useSessionSocketWrapper(slots[3] || "__noop_3");
  const s4 = useSessionSocketWrapper(slots[4] || "__noop_4");
  const s5 = useSessionSocketWrapper(slots[5] || "__noop_5");
  const s6 = useSessionSocketWrapper(slots[6] || "__noop_6");
  const s7 = useSessionSocketWrapper(slots[7] || "__noop_7");

  const allSockets = [s0, s1, s2, s3, s4, s5, s6, s7];
  for (let i = 0; i < sessionIds.length && i < MAX_SESSIONS; i++) {
    socketStates.set(sessionIds[i], allSockets[i]);
  }

  return socketStates;
}

const CANVAS_STATE_SAVE_DEBOUNCE_MS = 1000;

export function useChatWorkspace(chatId: string) {
  const { data: chatData, isLoading } = useSWR<ChatWithSessions>(
    chatId ? `/api/chats/${chatId}` : null
  );

  const chat = chatData ?? null;
  const sessions = useMemo(() => chatData?.sessions ?? [], [chatData?.sessions]);
  const sessionIds = useMemo(() => sessions.map((s) => s.id), [sessions]);

  const sessionStates = useMultiSessionSockets(sessionIds);

  const [canvasState, setCanvasState] = useState<ChatCanvasState | null>(null);

  useEffect(() => {
    if (chatData?.canvasState) {
      setCanvasState(chatData.canvasState);
    }
  }, [chatData?.canvasState]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateCanvasState = useCallback(
    (newState: ChatCanvasState) => {
      setCanvasState(newState);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          await fetch(`/api/chats/${chatId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ canvasState: newState }),
          });
        } catch (e) {
          console.error("Failed to save canvas state:", e);
        }
      }, CANVAS_STATE_SAVE_DEBOUNCE_MS);
    },
    [chatId]
  );

  const forkSession = useCallback(
    async (sourceSessionId: string) => {
      const res = await fetch(`/api/chats/${chatId}/fork/${sourceSessionId}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to fork session");
      const data = await res.json();
      mutate(`/api/chats/${chatId}`);
      mutate(SIDEBAR_CHATS_KEY);
      return data.sessionId as string;
    },
    [chatId]
  );

  const addSession = useCallback(
    async (prompt: string, model?: string, reasoningEffort?: string) => {
      const res = await fetch(`/api/chats/${chatId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model, reasoningEffort }),
      });
      if (!res.ok) throw new Error("Failed to add session");
      const data = await res.json();
      mutate(`/api/chats/${chatId}`);
      mutate(SIDEBAR_CHATS_KEY);
      return data.sessionId as string;
    },
    [chatId]
  );

  return {
    chat,
    sessions,
    sessionStates,
    canvasState,
    updateCanvasState,
    forkSession,
    addSession,
    isLoading,
  };
}
