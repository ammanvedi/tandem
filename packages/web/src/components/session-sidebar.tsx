"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useMemo, useCallback, useEffect, useRef, type TouchEvent } from "react";
import { useSession, signOut } from "next-auth/react";
import useSWR, { mutate } from "swr";
import { AnimatePresence, motion } from "motion/react";
function formatSessionDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isThisYear = date.getFullYear() === now.getFullYear();
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const time = date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (isThisYear) return `${month} ${day}, ${time}`;
  return `${month} ${day}, ${date.getFullYear()}`;
}
import {
  buildSessionsPageKey,
  mergeUniqueSessions,
  SIDEBAR_SESSIONS_KEY,
  type SessionListResponse,
} from "@/lib/session-list";
import { SHORTCUT_LABELS } from "@/lib/keyboard-shortcuts";
import { useIsMobile } from "@/hooks/use-media-query";
import {
  MoreIcon,
  SidebarIcon,
  PlusIcon,
  SettingsIcon,
  ArchiveIcon,
  FolderIcon,
  SearchIcon,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Session } from "@open-inspect/shared";

export type SessionItem = Session;

type SessionsResponse = { sessions: SessionItem[] };

export const MOBILE_LONG_PRESS_MS = 450;
const MOBILE_LONG_PRESS_MOVE_THRESHOLD_PX = 10;

export function buildSessionHref(session: SessionItem) {
  return {
    pathname: `/session/${session.id}`,
    query: {
      repoOwner: session.repoOwner,
      repoName: session.repoName,
      ...(session.title ? { title: session.title } : {}),
    },
  };
}

interface SessionSidebarProps {
  onNewSession?: () => void;
  onToggle?: () => void;
  onSessionSelect?: () => void;
}

type SidebarTab = "my-work" | "organisation";

export function SessionSidebar({ onNewSession, onToggle, onSessionSelect }: SessionSidebarProps) {
  const { data: authSession } = useSession();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const [extraSessions, setExtraSessions] = useState<SessionItem[]>([]);
  const [hasMorePages, setHasMorePages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<SidebarTab>("my-work");
  const [collapsedRepos, setCollapsedRepos] = useState<Record<string, boolean>>({});

  const { data, isLoading: loading } = useSWR<SessionListResponse>(
    authSession ? SIDEBAR_SESSIONS_KEY : null
  );
  const firstPageSessions = useMemo(() => data?.sessions ?? [], [data?.sessions]);

  const prevDataRef = useRef(data);
  let effectiveExtraSessions = extraSessions;
  if (prevDataRef.current !== data) {
    prevDataRef.current = data;
    effectiveExtraSessions = [];
  }

  useEffect(() => {
    if (!data) return;
    setExtraSessions([]);
    setHasMorePages(data.hasMore);
    setLoadingMore(false);
    offsetRef.current = firstPageSessions.length;
    hasMoreRef.current = data.hasMore;
    loadingMoreRef.current = false;
  }, [data, firstPageSessions.length]);

  const loadMoreSessions = useCallback(async () => {
    if (!authSession || loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const response = await fetch(
        buildSessionsPageKey({ excludeStatus: "archived", offset: offsetRef.current })
      );
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      const page: SessionListResponse = await response.json();
      const fetched = page.sessions ?? [];
      setExtraSessions((prev) => mergeUniqueSessions(prev, fetched));
      setHasMorePages(page.hasMore);
      offsetRef.current += fetched.length;
      hasMoreRef.current = page.hasMore;
    } catch (error) {
      console.error("Failed to fetch additional sessions:", error);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [authSession]);

  const maybeLoadMoreSessions = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 96;
    if (nearBottom) void loadMoreSessions();
  }, [loadMoreSessions]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || loading || loadingMore || !hasMorePages) return;
    if (container.clientHeight > 0 && container.scrollHeight <= container.clientHeight) {
      void loadMoreSessions();
    }
  }, [
    hasMorePages,
    loading,
    loadingMore,
    loadMoreSessions,
    firstPageSessions.length,
    extraSessions.length,
  ]);

  const sessions = useMemo(
    () => mergeUniqueSessions(firstPageSessions, effectiveExtraSessions),
    [firstPageSessions, effectiveExtraSessions]
  );

  const sessionsByRepo = useMemo(() => {
    const filtered = sessions
      .filter((s) => s.status !== "archived")
      .filter((_s) => {
        if (activeTab === "my-work") {
          return true; // TODO: filter by current user's sessions when creator field is available
        }
        return true;
      })
      .filter((s) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        const title = s.title?.toLowerCase() || "";
        const repo = s.repoName?.toLowerCase() || "";
        return title.includes(query) || repo.includes(query);
      });

    const sorted = [...filtered].sort((a, b) => {
      const aTime = a.updatedAt || a.createdAt;
      const bTime = b.updatedAt || b.createdAt;
      return bTime - aTime;
    });

    const byRepo = new Map<string, SessionItem[]>();
    for (const s of sorted) {
      const key = s.repoName || "Unknown";
      const group = byRepo.get(key) ?? [];
      group.push(s);
      byRepo.set(key, group);
    }

    return byRepo;
  }, [sessions, searchQuery, activeTab]);

  const currentSessionId = pathname?.startsWith("/session/") ? pathname.split("/")[2] : null;

  const toggleRepo = useCallback((key: string) => {
    setCollapsedRepos((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleArchive = useCallback(async (sessionId: string) => {
    const updateSessions = (data?: SessionsResponse): SessionsResponse => ({
      sessions: (data?.sessions ?? []).filter((s) => s.id !== sessionId),
    });

    try {
      await mutate<SessionsResponse>(
        SIDEBAR_SESSIONS_KEY,
        async (currentData?: SessionsResponse) => {
          const response = await fetch(`/api/sessions/${sessionId}/archive`, { method: "POST" });
          if (!response.ok) throw new Error("Failed to archive session");
          return updateSessions(currentData);
        },
        {
          optimisticData: updateSessions,
          rollbackOnError: true,
          populateCache: true,
          revalidate: true,
        }
      );
    } catch {
      console.error("Failed to archive session");
    }
  }, []);

  return (
    <aside className="w-72 h-dvh flex flex-col border-r border-border-muted bg-background">
      {/* Logo */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <Link href="/" className="block">
          <h1
            className="text-[24px] font-bold tracking-tight text-foreground leading-none"
            style={{ fontFamily: "var(--font-logo)" }}
          >
            tandem
          </h1>
        </Link>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onNewSession}
            title={`New session (${SHORTCUT_LABELS.NEW_SESSION})`}
            aria-label={`New session (${SHORTCUT_LABELS.NEW_SESSION})`}
          >
            <PlusIcon className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggle}
            className="lg:hidden"
            title={`Toggle sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
            aria-label={`Toggle sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
          >
            <SidebarIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Tabs: My Work / Organisation */}
      <div className="px-6 pb-2 flex items-center gap-4">
        <button
          onClick={() => setActiveTab("my-work")}
          className={`text-xs uppercase tracking-wide transition ${
            activeTab === "my-work"
              ? "text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          My Work
        </button>
        <button
          onClick={() => setActiveTab("organisation")}
          className={`text-xs uppercase tracking-wide transition ${
            activeTab === "organisation"
              ? "text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Organisation
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-7 text-xs"
          />
        </div>
      </div>

      {/* Session list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={maybeLoadMoreSessions}
      >
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No sessions yet</div>
        ) : (
          <>
            {Array.from(sessionsByRepo.entries()).map(([repoName, repoSessions]) => (
              <RepoGroup
                key={repoName}
                repoName={repoName}
                sessions={repoSessions}
                currentSessionId={currentSessionId}
                isMobile={isMobile}
                isCollapsed={collapsedRepos[repoName] ?? false}
                onToggle={() => toggleRepo(repoName)}
                onSessionSelect={onSessionSelect}
                onArchive={handleArchive}
              />
            ))}
            {loadingMore && (
              <div className="flex justify-center py-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-muted-foreground" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border-muted flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserMenu user={authSession?.user} />
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/settings"
            className={`p-1.5 rounded-[3px] transition ${
              pathname === "/settings"
                ? "text-foreground bg-muted"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            title="Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

function RepoGroup({
  repoName,
  sessions,
  currentSessionId,
  isMobile,
  isCollapsed,
  onToggle,
  onSessionSelect,
  onArchive,
}: {
  repoName: string;
  sessions: SessionItem[];
  currentSessionId: string | null;
  isMobile: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  onSessionSelect?: () => void;
  onArchive: (id: string) => void;
}) {
  return (
    <div className="mb-0.5">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-6 py-1.5 text-xs text-muted-foreground hover:text-foreground transition w-full uppercase tracking-wide"
      >
        <FolderIcon className="w-3 h-3 flex-shrink-0" />
        <span className="truncate font-medium">{repoName}</span>
      </button>
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: "hidden" }}
          >
            {sessions.map((session) => (
              <SessionListItem
                key={session.id}
                session={session}
                isActive={session.id === currentSessionId}
                isMobile={isMobile}
                onSessionSelect={onSessionSelect}
                onArchive={onArchive}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu({ user }: { user?: { name?: string | null; image?: string | null } | null }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="w-7 h-7 rounded-full overflow-hidden focus:outline-none"
          title={`Signed in as ${user?.name || "User"}`}
        >
          {user?.image ? (
            <img
              src={user.image}
              alt={user.name || "User"}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="w-full h-full rounded-full bg-card flex items-center justify-center text-xs font-medium text-foreground">
              {user?.name?.charAt(0).toUpperCase() || "?"}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4}>
        <DropdownMenuLabel className="font-medium truncate">
          {user?.name || "User"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionListItem({
  session,
  isActive,
  isMobile,
  onSessionSelect,
  onArchive,
}: {
  session: SessionItem;
  isActive: boolean;
  isMobile: boolean;
  onSessionSelect?: () => void;
  onArchive?: (id: string) => void;
}) {
  const displayTitle = session.title || session.baseBranch || formatSessionDate(session.createdAt);
  const isAgentActive = session.status === "active";
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useState(displayTitle);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!isRenaming) setTitle(displayTitle);
  }, [displayTitle, isRenaming]);

  const handleStartRename = () => {
    setIsActionsOpen(false);
    setTitle(displayTitle);
    setIsRenaming(true);
  };

  const handleCancelRename = () => {
    setTitle(displayTitle);
    setIsRenaming(false);
  };

  const handleRenameSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === displayTitle) {
      setIsRenaming(false);
      return;
    }
    const previousTitle = displayTitle;
    setIsRenaming(false);

    const updateSessionsTitle = (data?: SessionsResponse): SessionsResponse => ({
      sessions: (data?.sessions ?? []).map((s) =>
        s.id === session.id ? { ...s, title: trimmed, updatedAt: Date.now() } : s
      ),
    });

    try {
      await mutate<SessionsResponse>(
        "/api/sessions",
        async (currentData?: SessionsResponse) => {
          const response = await fetch(`/api/sessions/${session.id}/title`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: trimmed }),
          });
          if (!response.ok) throw new Error("Failed to update session title");
          return updateSessionsTitle(currentData);
        },
        {
          optimisticData: updateSessionsTitle,
          rollbackOnError: true,
          populateCache: true,
          revalidate: true,
        }
      );
    } catch {
      setTitle(previousTitle);
      setIsRenaming(true);
    }
  };

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(
    (event: TouchEvent<HTMLAnchorElement>) => {
      if (!isMobile) return;
      const touch = event.touches[0];
      if (!touch) return;
      longPressTriggeredRef.current = false;
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true;
        setIsActionsOpen(true);
      }, MOBILE_LONG_PRESS_MS);
    },
    [clearLongPressTimer, isMobile]
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent<HTMLAnchorElement>) => {
      if (!isMobile) return;
      const start = touchStartRef.current;
      const touch = event.touches[0];
      if (!start || !touch) return;
      if (
        Math.hypot(touch.clientX - start.x, touch.clientY - start.y) >
        MOBILE_LONG_PRESS_MOVE_THRESHOLD_PX
      ) {
        clearLongPressTimer();
      }
    },
    [clearLongPressTimer, isMobile]
  );

  const handleTouchEnd = useCallback(() => {
    clearLongPressTimer();
    touchStartRef.current = null;
  }, [clearLongPressTimer]);

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  return (
    <div
      className={`group relative block px-6 py-1.5 transition ${
        isActive ? "text-foreground" : "text-text-warm-muted hover:text-foreground"
      }`}
    >
      {isRenaming ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              handleCancelRename();
            }
          }}
          className="w-full text-xs bg-transparent text-foreground outline-none pr-6"
        />
      ) : (
        <Link
          href={buildSessionHref(session)}
          onClick={(event) => {
            if (longPressTriggeredRef.current) {
              event.preventDefault();
              longPressTriggeredRef.current = false;
              return;
            }
            if (isMobile) onSessionSelect?.();
          }}
          onContextMenu={(event) => {
            if (isMobile) event.preventDefault();
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className="flex items-center gap-1.5 pr-6"
        >
          {isAgentActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-glow flex-shrink-0" />
          )}
          <span className="truncate text-xs">{displayTitle}</span>
        </Link>
      )}

      <div className="absolute inset-y-0 right-4 flex items-center">
        <DropdownMenu open={isActionsOpen} onOpenChange={setIsActionsOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Session actions"
              className={`h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground transition data-[state=open]:opacity-100 ${
                isMobile
                  ? "pointer-events-none flex opacity-0"
                  : "flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              }`}
            >
              <MoreIcon className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleStartRename}>Rename</DropdownMenuItem>
            {onArchive && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setIsActionsOpen(false);
                    onArchive(session.id);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <ArchiveIcon className="w-4 h-4" />
                  Archive
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
