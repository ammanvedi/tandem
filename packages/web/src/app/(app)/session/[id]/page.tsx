"use client";

import { useParams } from "next/navigation";
import { Suspense, useState, useCallback, useRef } from "react";
import type { Editor } from "@dgmjs/core";
import { useSessionSocket } from "@/hooks/use-session-socket";
import { ChatPanel } from "@/components/chat-panel";
import { ClusterEditor } from "@/components/canvas";
import { DockedPreview } from "@/components/docked-preview";
import { getSafeExternalUrl } from "@/lib/urls";

export default function SessionPage() {
  return (
    <Suspense>
      <SessionPageContent />
    </Suspense>
  );
}

function SessionPageContent() {
  const params = useParams();
  const sessionId = params.id as string;

  const {
    connected,
    connecting,
    authError,
    connectionError,
    sessionState,
    events,
    participants,
    currentParticipantId,
    isProcessing,
    loadingHistory,
    sendPrompt,
    stopExecution,
    sendTyping,
    reconnect,
    loadOlderEvents,
    canvasSnapshotRequestRef,
  } = useSessionSocket(sessionId);

  const editorRef = useRef<Editor | null>(null);

  const handleEditorMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
  }, []);

  // Wire up the canvas snapshot callback so the socket hook can request snapshots
  canvasSnapshotRequestRef.current = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return null;
    try {
      return editor.store.toJSON();
    } catch {
      return null;
    }
  }, []);

  const safeVncUrl = getSafeExternalUrl(sessionState?.vncUrl);
  const safeDevServerUrl = getSafeExternalUrl(sessionState?.devServerUrl);

  const [mobileTab, setMobileTab] = useState<"center" | "chat">("chat");

  const chatPanelProps = {
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
  };

  const vncSrc = safeVncUrl
    ? `${safeVncUrl}${safeVncUrl.includes("?") ? "&" : "?"}autoconnect=true`
    : null;

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Desktop layout */}
      <div className="hidden lg:flex lg:flex-1 lg:h-full">
        {/* Center view -- full-bleed canvas with docked previews */}
        <div className="flex-1 flex flex-col overflow-hidden relative" data-canvas-area>
          {(authError || connectionError) && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-900/20 border border-red-800 rounded-lg px-6 py-4 max-w-md">
              <p className="text-sm text-red-400 mb-3">{authError || connectionError}</p>
              <button
                onClick={reconnect}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded transition"
              >
                Reconnect
              </button>
            </div>
          )}

          <ClusterEditor
            clusters={[]}
            showGrid={true}
            showPalette={true}
            className="relative w-full h-full overflow-hidden bg-background"
            onMount={handleEditorMount}
          />

          {/* Right-edge gradient feathering into chat panel */}
          <div className="absolute inset-y-0 right-0 w-24 pointer-events-none bg-gradient-to-r from-transparent to-background z-10" />

          <DockedPreview
            title="App"
            src={safeDevServerUrl}
            emptyMessage="No dev server"
            stackIndex={1}
          />
          <DockedPreview title="Agent" src={vncSrc} emptyMessage="No VNC session" stackIndex={0} />
        </div>

        {/* Chat panel -- right side desktop */}
        <div className="w-[628px] flex-shrink-0 p-6 pl-0">
          <div className="h-full rounded-xl border border-border-muted bg-surface-chat overflow-hidden">
            <ChatPanel {...chatPanelProps} />
          </div>
        </div>
      </div>

      {/* Mobile layout */}
      <div className="lg:hidden flex flex-col h-full">
        <div className="flex-1 overflow-hidden">
          {mobileTab === "chat" ? (
            <ChatPanel {...chatPanelProps} />
          ) : (
            <div className="flex items-center justify-center h-full">
              {(authError || connectionError) && (
                <div className="bg-red-900/20 border border-red-800 rounded-lg px-6 py-4 max-w-md mx-auto">
                  <p className="text-sm text-red-400 mb-3">{authError || connectionError}</p>
                  <button
                    onClick={reconnect}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded transition"
                  >
                    Reconnect
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile tab bar */}
        <div className="border-t border-border-muted bg-background flex">
          <button
            onClick={() => setMobileTab("center")}
            className={`flex-1 py-3 text-xs uppercase tracking-wide text-center transition ${
              mobileTab === "center"
                ? "text-foreground border-t-2 border-accent"
                : "text-muted-foreground"
            }`}
          >
            Workspace
          </button>
          <button
            onClick={() => setMobileTab("chat")}
            className={`flex-1 py-3 text-xs uppercase tracking-wide text-center transition ${
              mobileTab === "chat"
                ? "text-foreground border-t-2 border-accent"
                : "text-muted-foreground"
            }`}
          >
            Chat
          </button>
        </div>
      </div>
    </div>
  );
}
