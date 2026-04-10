import type { Session, Chat } from "@open-inspect/shared";

export const SESSIONS_PAGE_SIZE = 50;
export const SIDEBAR_SESSIONS_KEY = buildSessionsPageKey({
  excludeStatus: "archived",
  limit: SESSIONS_PAGE_SIZE,
  offset: 0,
});

export interface SessionListResponse {
  sessions: Session[];
  hasMore: boolean;
}

export function buildSessionsPageKey({
  limit = SESSIONS_PAGE_SIZE,
  offset = 0,
  status,
  excludeStatus,
}: {
  limit?: number;
  offset?: number;
  status?: string;
  excludeStatus?: string;
}) {
  const searchParams = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (status) {
    searchParams.set("status", status);
  }

  if (excludeStatus) {
    searchParams.set("excludeStatus", excludeStatus);
  }

  return `/api/sessions?${searchParams.toString()}`;
}

export function mergeUniqueSessions(existing: Session[], incoming: Session[]) {
  const seen = new Set(existing.map((session) => session.id));
  const merged = [...existing];

  for (const session of incoming) {
    if (seen.has(session.id)) continue;
    seen.add(session.id);
    merged.push(session);
  }

  return merged;
}

// ─── Chat list helpers ────────────────────────────────────────────────────────

export const CHATS_PAGE_SIZE = 50;
export const SIDEBAR_CHATS_KEY = buildChatsPageKey({
  excludeStatus: "archived",
  limit: CHATS_PAGE_SIZE,
  offset: 0,
});

export interface ChatListResponse {
  chats: Chat[];
  hasMore: boolean;
}

export function buildChatsPageKey({
  limit = CHATS_PAGE_SIZE,
  offset = 0,
  status,
  excludeStatus,
}: {
  limit?: number;
  offset?: number;
  status?: string;
  excludeStatus?: string;
}) {
  const searchParams = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (status) searchParams.set("status", status);
  if (excludeStatus) searchParams.set("excludeStatus", excludeStatus);
  return `/api/chats?${searchParams.toString()}`;
}

export function mergeUniqueChats(existing: Chat[], incoming: Chat[]) {
  const seen = new Set(existing.map((c) => c.id));
  const merged = [...existing];
  for (const chat of incoming) {
    if (seen.has(chat.id)) continue;
    seen.add(chat.id);
    merged.push(chat);
  }
  return merged;
}
