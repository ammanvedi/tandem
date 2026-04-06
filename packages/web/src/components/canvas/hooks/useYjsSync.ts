import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@dgmjs/core";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import {
  YjsDocSyncPlugin,
  YjsUserPresencePlugin,
  type UserIdentity,
  type UserState,
} from "@dgmjs/dgmjs-plugin-yjs";

export interface CollaborationConfig {
  wsUrl: string;
  roomName: string;
  authToken: string;
  user: UserIdentity;
}

export interface YjsSyncState {
  plugins: [YjsDocSyncPlugin, YjsUserPresencePlugin];
  connectionStatus: "connecting" | "connected" | "disconnected";
  connectedUsers: UserState[];
}

export function useYjsSync(
  editor: Editor | null,
  collaboration: CollaborationConfig | undefined
): YjsSyncState | null {
  const [connectionStatus, setConnectionStatus] =
    useState<YjsSyncState["connectionStatus"]>("connecting");
  const [connectedUsers, setConnectedUsers] = useState<UserState[]>([]);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const yDocRef = useRef<Y.Doc | null>(null);

  const plugins = useMemo(
    () =>
      [new YjsDocSyncPlugin(), new YjsUserPresencePlugin()] as [
        YjsDocSyncPlugin,
        YjsUserPresencePlugin,
      ],
    []
  );

  useEffect(() => {
    if (!editor || !collaboration) return;

    const yDoc = new Y.Doc();
    yDocRef.current = yDoc;

    const provider = new WebsocketProvider(collaboration.wsUrl, collaboration.roomName, yDoc, {
      connect: true,
      params: { token: collaboration.authToken },
      disableBc: true,
    });
    providerRef.current = provider;

    const [docPlugin, presencePlugin] = plugins;

    provider.on("status", (event: { status: string }) => {
      setConnectionStatus(event.status as YjsSyncState["connectionStatus"]);
    });

    provider.on("sync", (isSynced: boolean) => {
      if (!isSynced) return;

      docPlugin.start(yDoc);
      docPlugin.flush();
      presencePlugin.start(provider.awareness, collaboration.user);
    });

    presencePlugin.onUserEnter.addListener(() => {
      setConnectedUsers(presencePlugin.getRemoteUserStates());
    });
    presencePlugin.onUserLeave.addListener(() => {
      setConnectedUsers(presencePlugin.getRemoteUserStates());
    });
    presencePlugin.onUserIdentityUpdate.addListener(() => {
      setConnectedUsers(presencePlugin.getRemoteUserStates());
    });

    return () => {
      docPlugin.stop();
      presencePlugin.stop();
      provider.destroy();
      yDoc.destroy();
      providerRef.current = null;
      yDocRef.current = null;
      setConnectionStatus("disconnected");
      setConnectedUsers([]);
    };
  }, [editor, collaboration?.wsUrl, collaboration?.roomName, collaboration?.authToken]);

  if (!collaboration) return null;

  return { plugins, connectionStatus, connectedUsers };
}
