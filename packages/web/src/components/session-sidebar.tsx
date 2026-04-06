"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useMemo, useCallback, useEffect, useRef, type TouchEvent } from "react";
import { useSession, signOut } from "next-auth/react";
import useSWR, { mutate } from "swr";
import { AnimatePresence, motion } from "motion/react";
import { formatRelativeTime } from "@/lib/time";
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
  InspectIcon,
  PlusIcon,
  SettingsIcon,
  AutomationsIcon,
  BranchIcon,
  ChevronRightIcon,
  ArchiveIcon,
  RepoIcon,
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
import type { Session, SessionCategory } from "@open-inspect/shared";

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

const SECTION_CONFIG: {
  key: SessionCategory;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "idea",
    label: "Ideas",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
        />
      </svg>
    ),
  },
  {
    key: "product",
    label: "Product",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
        />
      </svg>
    ),
  },
  {
    key: "chat",
    label: "Chats",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
        />
      </svg>
    ),
  },
];

export function SessionSidebar({ onNewSession, onToggle, onSessionSelect }: SessionSidebarProps) {
  const { data: authSession } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [extraSessions, setExtraSessions] = useState<SessionItem[]>([]);
  const [hasMorePages, setHasMorePages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const isMobile = useIsMobile();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

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

  const { ideaSessions, productSessionsByRepo, chatSessions } = useMemo(() => {
    const filtered = sessions
      .filter((s) => s.status !== "archived")
      .filter((s) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        const title = s.title?.toLowerCase() || "";
        const repo = `${s.repoOwner}/${s.repoName}`.toLowerCase();
        return title.includes(query) || repo.includes(query);
      });

    const sorted = [...filtered].sort((a, b) => {
      const aTime = a.updatedAt || a.createdAt;
      const bTime = b.updatedAt || b.createdAt;
      return bTime - aTime;
    });

    const ideas: SessionItem[] = [];
    const productByRepo = new Map<string, SessionItem[]>();
    const chats: SessionItem[] = [];

    for (const s of sorted) {
      const cat = s.category ?? "chat";
      if (cat === "idea") {
        ideas.push(s);
      } else if (cat === "product") {
        const key = `${s.repoOwner}/${s.repoName}`;
        const group = productByRepo.get(key) ?? [];
        group.push(s);
        productByRepo.set(key, group);
      } else {
        chats.push(s);
      }
    }

    return { ideaSessions: ideas, productSessionsByRepo: productByRepo, chatSessions: chats };
  }, [sessions, searchQuery]);

  const currentSessionId = pathname?.startsWith("/session/") ? pathname.split("/")[2] : null;

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleNewSessionForCategory = useCallback(
    (category: SessionCategory) => {
      router.push(`/?category=${category}`);
    },
    [router]
  );

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

  const handleDispatchToProduct = useCallback(async (sessionId: string) => {
    const updateSessions = (data?: SessionsResponse): SessionsResponse => ({
      sessions: (data?.sessions ?? []).map((s) =>
        s.id === sessionId
          ? { ...s, category: "product" as SessionCategory, updatedAt: Date.now() }
          : s
      ),
    });

    try {
      await mutate<SessionsResponse>(
        SIDEBAR_SESSIONS_KEY,
        async (currentData?: SessionsResponse) => {
          const response = await fetch(`/api/sessions/${sessionId}/category`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category: "product" }),
          });
          if (!response.ok) throw new Error("Failed to dispatch to product");
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
      console.error("Failed to dispatch session to product");
    }
  }, []);

  return (
    <aside className="w-72 h-dvh flex flex-col border-r border-border-muted bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-muted">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            title={`Toggle sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
            aria-label={`Toggle sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
          >
            <SidebarIcon className="w-4 h-4" />
          </Button>
          <Link href="/" className="flex items-center gap-2">
            <InspectIcon className="w-5 h-5" />
            <span className="font-semibold text-foreground">Inspect</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewSession}
            title={`New session (${SHORTCUT_LABELS.NEW_SESSION})`}
            aria-label={`New session (${SHORTCUT_LABELS.NEW_SESSION})`}
          >
            <PlusIcon className="w-4 h-4" />
          </Button>
          <Link
            href="/settings"
            className={`p-1.5 transition ${
              pathname === "/settings"
                ? "text-foreground bg-muted"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            title="Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </Link>
          <UserMenu user={authSession?.user} />
        </div>
      </div>

      {/* Nav links */}
      <div className="px-3 pt-2 pb-1 flex flex-col gap-0.5">
        <Link
          href="/automations"
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition ${
            pathname?.startsWith("/automations")
              ? "text-foreground bg-muted"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <AutomationsIcon className="w-4 h-4" />
          Automations
        </Link>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <Input
          type="text"
          placeholder="Search sessions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Session Sections */}
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
            {SECTION_CONFIG.map(({ key, label, icon }) => {
              const isCollapsed = collapsedSections[key] ?? false;

              if (key === "idea") {
                return (
                  <SidebarSection
                    key={key}
                    sectionKey={key}
                    label={label}
                    icon={icon}
                    count={ideaSessions.length}
                    isCollapsed={isCollapsed}
                    onToggle={() => toggleSection(key)}
                    onAdd={() => handleNewSessionForCategory("idea")}
                  >
                    <AnimatePresence mode="popLayout">
                      {ideaSessions.map((session) => (
                        <motion.div
                          key={session.id}
                          layoutId={session.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <SessionListItem
                            session={session}
                            isActive={session.id === currentSessionId}
                            isMobile={isMobile}
                            onSessionSelect={onSessionSelect}
                            onArchive={handleArchive}
                            onDispatchToProduct={handleDispatchToProduct}
                            showTags
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </SidebarSection>
                );
              }

              if (key === "product") {
                const totalProductSessions = Array.from(productSessionsByRepo.values()).reduce(
                  (sum, arr) => sum + arr.length,
                  0
                );
                return (
                  <SidebarSection
                    key={key}
                    sectionKey={key}
                    label={label}
                    icon={icon}
                    count={totalProductSessions}
                    isCollapsed={isCollapsed}
                    onToggle={() => toggleSection(key)}
                    onAdd={() => handleNewSessionForCategory("product")}
                  >
                    <AnimatePresence mode="popLayout">
                      {Array.from(productSessionsByRepo.entries()).map(
                        ([repoKey, repoSessions]) => (
                          <RepoGroup
                            key={repoKey}
                            repoKey={repoKey}
                            sessions={repoSessions}
                            currentSessionId={currentSessionId}
                            isMobile={isMobile}
                            onSessionSelect={onSessionSelect}
                            onArchive={handleArchive}
                          />
                        )
                      )}
                    </AnimatePresence>
                  </SidebarSection>
                );
              }

              return (
                <SidebarSection
                  key={key}
                  sectionKey={key}
                  label={label}
                  icon={icon}
                  count={chatSessions.length}
                  isCollapsed={isCollapsed}
                  onToggle={() => toggleSection(key)}
                  onAdd={() => handleNewSessionForCategory("chat")}
                >
                  <AnimatePresence mode="popLayout">
                    {chatSessions.map((session) => (
                      <motion.div
                        key={session.id}
                        layoutId={session.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <SessionListItem
                          session={session}
                          isActive={session.id === currentSessionId}
                          isMobile={isMobile}
                          onSessionSelect={onSessionSelect}
                          onArchive={handleArchive}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </SidebarSection>
              );
            })}

            {loadingMore && (
              <div className="flex justify-center py-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-muted-foreground" />
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function SidebarSection({
  label,
  icon,
  count,
  isCollapsed,
  onToggle,
  onAdd,
  children,
}: {
  sectionKey: string;
  label: string;
  icon: React.ReactNode;
  count: number;
  isCollapsed: boolean;
  onToggle: () => void;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between px-3 py-1.5 group">
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 text-xs font-medium text-secondary-foreground uppercase tracking-wide hover:text-foreground transition flex-1 min-w-0"
        >
          <ChevronRightIcon
            className={`w-3 h-3 transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`}
          />
          {icon}
          <span>{label}</span>
          {count > 0 && (
            <span className="text-muted-foreground font-normal normal-case ml-0.5">{count}</span>
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition"
          title={`New ${label.toLowerCase().slice(0, -1)}`}
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RepoGroup({
  repoKey,
  sessions,
  currentSessionId,
  isMobile,
  onSessionSelect,
  onArchive,
}: {
  repoKey: string;
  sessions: SessionItem[];
  currentSessionId: string | null;
  isMobile: boolean;
  onSessionSelect?: () => void;
  onArchive: (id: string) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div>
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-1.5 px-5 py-1 text-xs text-muted-foreground hover:text-foreground transition w-full"
      >
        <ChevronRightIcon
          className={`w-2.5 h-2.5 transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`}
        />
        <RepoIcon className="w-3 h-3" />
        <span className="truncate">{repoKey}</span>
        <span className="text-muted-foreground/60 ml-auto">{sessions.length}</span>
      </button>
      {!isCollapsed &&
        sessions.map((session) => (
          <motion.div
            key={session.id}
            layoutId={session.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SessionListItem
              session={session}
              isActive={session.id === currentSessionId}
              isMobile={isMobile}
              onSessionSelect={onSessionSelect}
              onArchive={onArchive}
              showActiveIndicator
            />
          </motion.div>
        ))}
    </div>
  );
}

function UserMenu({ user }: { user?: { name?: string | null; image?: string | null } | null }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="w-7 h-7 rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary"
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
        <DropdownMenuItem onClick={() => signOut()}>
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3-3l3-3m0 0l-3-3m3 3H9"
            />
          </svg>
          Sign out
        </DropdownMenuItem>
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
  onDispatchToProduct,
  showTags,
  showActiveIndicator,
}: {
  session: SessionItem;
  isActive: boolean;
  isMobile: boolean;
  onSessionSelect?: () => void;
  onArchive?: (id: string) => void;
  onDispatchToProduct?: (id: string) => void;
  showTags?: boolean;
  showActiveIndicator?: boolean;
}) {
  const timestamp = session.updatedAt || session.createdAt;
  const relativeTime = formatRelativeTime(timestamp);
  const displayTitle = session.title || `${session.repoOwner}/${session.repoName}`;
  const repoInfo = `${session.repoOwner}/${session.repoName}`;
  const isOrphanChild = session.parentSessionId && session.spawnSource === "agent";
  const isAgentActive = (showActiveIndicator ?? true) && session.status === "active";
  const [isRenaming, setIsRenaming] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
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

  const tags = session.tags ?? [];

  return (
    <div
      className={`group relative block px-4 py-2.5 border-l-2 transition ${
        isActive ? "border-l-accent bg-accent-muted" : "border-l-transparent hover:bg-muted"
      }`}
    >
      {isRenaming ? (
        <>
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
            className="w-full text-sm bg-transparent text-foreground outline-none focus:ring-inset focus:ring-ring font-medium pr-8"
          />
          <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
            <span>{relativeTime}</span>
            <span>·</span>
            <span className="truncate">{repoInfo}</span>
          </div>
        </>
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
          className="block pr-8"
        >
          <div className="flex items-center gap-1.5">
            {isAgentActive && (
              <span className="w-2 h-2 rounded-full bg-success animate-pulse-glow flex-shrink-0" />
            )}
            <div className="truncate text-sm font-medium text-foreground">{displayTitle}</div>
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
            <span>{relativeTime}</span>
            <span>·</span>
            <span className="truncate">{repoInfo}</span>
            {isOrphanChild && (
              <>
                <span>·</span>
                <span className="text-accent">sub-task</span>
              </>
            )}
            {session.baseBranch && session.baseBranch !== "main" && (
              <>
                <span>·</span>
                <BranchIcon className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{session.baseBranch}</span>
              </>
            )}
          </div>
          {showTags && tags.length > 0 && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                    tag === "urgent"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </Link>
      )}

      <div className="absolute inset-y-0 right-2 flex items-start pt-2">
        <DropdownMenu open={isActionsOpen} onOpenChange={setIsActionsOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Session actions"
              className={`h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition data-[state=open]:opacity-100 ${
                isMobile
                  ? "pointer-events-none flex opacity-0"
                  : "flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              }`}
            >
              <MoreIcon className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleStartRename}>Rename</DropdownMenuItem>
            {onDispatchToProduct && (
              <DropdownMenuItem
                onClick={() => {
                  setIsActionsOpen(false);
                  onDispatchToProduct(session.id);
                }}
              >
                Dispatch to Product
              </DropdownMenuItem>
            )}
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
