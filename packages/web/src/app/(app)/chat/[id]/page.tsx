"use client";

import { useParams } from "next/navigation";
import { Suspense, useMemo, useCallback, useRef } from "react";
import type { Editor } from "@dgmjs/core";
import { useChatWorkspace, type SessionSocketState } from "@/hooks/use-chat-workspace";
import { ClusterEditor, type ClusterDefinition } from "@/components/canvas";
import { IframeCard } from "@/components/canvas/components/IframeCard";
import { SandboxChatCard } from "@/components/canvas/components/SandboxChatCard";
import { getSafeExternalUrl } from "@/lib/urls";
import { useSidebarContext } from "@/components/sidebar-layout";
import { SidebarIcon } from "@/components/ui/icons";
import { SHORTCUT_LABELS } from "@/lib/keyboard-shortcuts";
import type { ChatCanvasState } from "@open-inspect/shared";

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageContent />
    </Suspense>
  );
}

function ChatPageContent() {
  const params = useParams();
  const chatId = params.id as string;
  const { isOpen, toggle } = useSidebarContext();

  const {
    chat,
    sessions,
    sessionStates,
    canvasState,
    updateCanvasState: _updateCanvasState,
    forkSession,
    isLoading,
  } = useChatWorkspace(chatId);

  const editorRef = useRef<Editor | null>(null);

  const handleEditorMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
  }, []);

  const clusters = useMemo(() => {
    return buildClustersFromSessions(sessions, sessionStates, canvasState);
  }, [sessions, sessionStates, canvasState]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Chat not found</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Workspace toolbar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 border-b border-border-muted bg-background">
        {!isOpen && (
          <button
            onClick={toggle}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition"
            title={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
          >
            <SidebarIcon className="w-4 h-4" />
          </button>
        )}
        <h2 className="text-sm font-medium text-foreground truncate">
          {chat.title || "Untitled Chat"}
        </h2>
        <span className="text-xs text-muted-foreground">
          {chat.repoOwner}/{chat.repoName}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => {
            if (sessions.length > 0) {
              forkSession(sessions[sessions.length - 1].id).catch(console.error);
            }
          }}
          disabled={sessions.length === 0}
          className="px-3 py-1 text-xs bg-surface-elevated hover:bg-muted text-foreground rounded transition disabled:opacity-30"
        >
          Fork Sandbox
        </button>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-hidden relative" data-canvas-area>
        <ClusterEditor
          clusters={clusters}
          showGrid={true}
          showPalette={false}
          className="relative w-full h-full overflow-hidden bg-background"
          onMount={handleEditorMount}
        />

        {/* Floating chat panels and iframes rendered as HTML overlays */}
        {sessions.map((session, idx) => {
          const state = sessionStates.get(session.id);
          if (!state) return null;

          const layout = canvasState?.clusters?.find((c) => c.sessionId === session.id);
          const baseX = layout?.position[0] ?? idx * 900;
          const baseY = layout?.position[1] ?? 0;

          const safeDevUrl = getSafeExternalUrl(state.sessionState?.devServerUrl);
          const safeVncUrl = getSafeExternalUrl(state.sessionState?.vncUrl);
          const vncSrc = safeVncUrl
            ? `${safeVncUrl}${safeVncUrl.includes("?") ? "&" : "?"}autoconnect=true`
            : null;

          return (
            <div key={session.id} className="absolute" style={{ left: baseX, top: baseY }}>
              {/* Cluster label */}
              <div className="absolute -top-6 left-0 text-xs text-muted-foreground truncate max-w-[300px]">
                {session.title || `Sandbox ${idx + 1}`}
              </div>

              {/* Dev server iframe */}
              <div
                className="absolute rounded-lg overflow-hidden border border-white/10"
                style={{ width: 400, height: 300, left: 0, top: 0 }}
              >
                <IframeCard
                  src={safeDevUrl}
                  title="App Preview"
                  emptyMessage="No dev server"
                  sessionId={session.id}
                />
              </div>

              {/* VNC iframe */}
              <div
                className="absolute rounded-lg overflow-hidden border border-white/10"
                style={{ width: 400, height: 300, left: 420, top: 0 }}
              >
                <IframeCard
                  src={vncSrc}
                  title="Agent View"
                  emptyMessage="No VNC session"
                  sessionId={session.id}
                />
              </div>

              {/* Floating chat panel */}
              <div className="absolute" style={{ left: 0, top: 320 }}>
                <SandboxChatCard
                  sessionId={session.id}
                  title={session.title || `Sandbox ${idx + 1}`}
                  socketState={state}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildClustersFromSessions(
  sessions: Array<{
    id: string;
    title: string | null;
    status: string;
  }>,
  sessionStates: Map<string, SessionSocketState>,
  canvasState: ChatCanvasState | null
): ClusterDefinition[] {
  return sessions.map((session, i) => {
    const layout = canvasState?.clusters?.find((c) => c.sessionId === session.id);
    const state = sessionStates.get(session.id);
    const devServerUrl = getSafeExternalUrl(state?.sessionState?.devServerUrl ?? null);
    const vncUrl = getSafeExternalUrl(state?.sessionState?.vncUrl ?? null);

    return {
      id: `cluster-${session.id}`,
      title: session.title || `Sandbox ${i + 1}`,
      worldOrigin: (layout?.position ?? [i * 900, 0]) as [number, number],
      items: [
        {
          id: `dev-${session.id}`,
          title: "App Preview",
          size: { width: 400, height: 300 },
          renderMode: "interactive" as const,
          content: (
            <IframeCard
              src={devServerUrl}
              title="App Preview"
              emptyMessage="No dev server"
              sessionId={session.id}
            />
          ),
        },
        {
          id: `vnc-${session.id}`,
          title: "Agent View",
          size: { width: 400, height: 300 },
          renderMode: "interactive" as const,
          content: (
            <IframeCard
              src={vncUrl ? `${vncUrl}${vncUrl.includes("?") ? "&" : "?"}autoconnect=true` : null}
              title="Agent View"
              emptyMessage="No VNC session"
              sessionId={session.id}
            />
          ),
        },
      ],
    };
  });
}
