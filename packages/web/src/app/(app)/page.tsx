"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { mutate } from "swr";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { SessionCategory } from "@open-inspect/shared";
import { useSidebarContext } from "@/components/sidebar-layout";
import { formatModelNameLower } from "@/lib/format";
import { SHORTCUT_LABELS } from "@/lib/keyboard-shortcuts";
import { SIDEBAR_CHATS_KEY } from "@/lib/session-list";
import {
  DEFAULT_MODEL,
  getDefaultReasoningEffort,
  isValidReasoningEffort,
} from "@open-inspect/shared";
import { useEnabledModels } from "@/hooks/use-enabled-models";
import { useRepos } from "@/hooks/use-repos";
import { useBranches } from "@/hooks/use-branches";
import { ReasoningEffortPills } from "@/components/reasoning-effort-pills";
import {
  SidebarIcon,
  RepoIcon,
  BranchIcon,
  ChevronDownIcon,
  SendIcon,
  LightbulbIcon,
  AudioLinesIcon,
} from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";

const LAST_SELECTED_REPO_STORAGE_KEY = "open-inspect-last-selected-repo";
const LAST_SELECTED_MODEL_STORAGE_KEY = "open-inspect-last-selected-model";
const LAST_SELECTED_REASONING_EFFORT_STORAGE_KEY = "open-inspect-last-selected-reasoning-effort";

const VALID_CATEGORIES: SessionCategory[] = ["idea", "product", "chat"];

function generateBranchName(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return `tandem/${id}`;
}

export default function Home() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category");
  const category: SessionCategory =
    categoryParam && VALID_CATEGORIES.includes(categoryParam as SessionCategory)
      ? (categoryParam as SessionCategory)
      : "chat";
  const { repos, loading: loadingRepos } = useRepos();
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  const [reasoningEffort, setReasoningEffort] = useState<string | undefined>(
    getDefaultReasoningEffort(DEFAULT_MODEL)
  );
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [autoBranch, setAutoBranch] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [pendingChatId, setPendingChatId] = useState<string | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const sessionCreationPromise = useRef<Promise<{
    chatId: string;
    sessionId: string;
  } | null> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingConfigRef = useRef<{ repo: string; model: string; branch: string } | null>(null);
  const [hasHydratedModelPreferences, setHasHydratedModelPreferences] = useState(false);
  const { enabledModels } = useEnabledModels();
  const selectedRepoOwner = selectedRepo.split("/")[0] ?? "";
  const selectedRepoName = selectedRepo.split("/")[1] ?? "";
  const { branches, loading: loadingBranches } = useBranches(selectedRepoOwner, selectedRepoName);

  useEffect(() => {
    if (repos.length > 0 && !selectedRepo) {
      const lastSelectedRepo = localStorage.getItem(LAST_SELECTED_REPO_STORAGE_KEY);
      const hasLastSelectedRepo = repos.some((repo) => repo.fullName === lastSelectedRepo);
      const defaultRepo =
        (hasLastSelectedRepo ? lastSelectedRepo : repos[0].fullName) ?? repos[0].fullName;
      setSelectedRepo(defaultRepo);
      const newBranch = generateBranchName();
      setAutoBranch(newBranch);
      setSelectedBranch(newBranch);
    }
  }, [repos, selectedRepo]);

  useEffect(() => {
    if (!selectedRepo) return;
    localStorage.setItem(LAST_SELECTED_REPO_STORAGE_KEY, selectedRepo);
  }, [selectedRepo]);

  useEffect(() => {
    if (enabledModels.length === 0 || hasHydratedModelPreferences) return;

    const storedModel = localStorage.getItem(LAST_SELECTED_MODEL_STORAGE_KEY);
    const selectedModelFromStorage =
      storedModel && enabledModels.includes(storedModel)
        ? storedModel
        : (enabledModels[0] ?? DEFAULT_MODEL);

    const storedReasoningEffort = localStorage.getItem(LAST_SELECTED_REASONING_EFFORT_STORAGE_KEY);
    const reasoningEffortFromStorage =
      storedReasoningEffort &&
      isValidReasoningEffort(selectedModelFromStorage, storedReasoningEffort)
        ? storedReasoningEffort
        : getDefaultReasoningEffort(selectedModelFromStorage);

    setSelectedModel(selectedModelFromStorage);
    setReasoningEffort(reasoningEffortFromStorage);
    setHasHydratedModelPreferences(true);
  }, [enabledModels, hasHydratedModelPreferences]);

  useEffect(() => {
    if (!hasHydratedModelPreferences) return;
    localStorage.setItem(LAST_SELECTED_MODEL_STORAGE_KEY, selectedModel);

    if (reasoningEffort) {
      localStorage.setItem(LAST_SELECTED_REASONING_EFFORT_STORAGE_KEY, reasoningEffort);
      return;
    }

    localStorage.removeItem(LAST_SELECTED_REASONING_EFFORT_STORAGE_KEY);
  }, [hasHydratedModelPreferences, selectedModel, reasoningEffort]);

  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setPendingChatId(null);
    setPendingSessionId(null);
    setIsCreatingSession(false);
    sessionCreationPromise.current = null;
    pendingConfigRef.current = null;
  }, [selectedRepo, selectedModel, selectedBranch]);

  const createChatForWarming = useCallback(async () => {
    if (pendingChatId && pendingSessionId)
      return { chatId: pendingChatId, sessionId: pendingSessionId };
    if (sessionCreationPromise.current) return sessionCreationPromise.current;
    if (!selectedRepo) return null;

    setIsCreatingSession(true);
    const [owner, name] = selectedRepo.split("/");
    const currentConfig = { repo: selectedRepo, model: selectedModel, branch: selectedBranch };
    pendingConfigRef.current = currentConfig;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const promise = (async () => {
      try {
        const res = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoOwner: owner,
            repoName: name,
            model: selectedModel,
            reasoningEffort,
            branch: selectedBranch || undefined,
            category,
            prompt: "",
          }),
          signal: abortController.signal,
        });

        if (res.ok) {
          const data = await res.json();
          if (
            pendingConfigRef.current?.repo === currentConfig.repo &&
            pendingConfigRef.current?.model === currentConfig.model &&
            pendingConfigRef.current?.branch === currentConfig.branch
          ) {
            setPendingChatId(data.chatId);
            setPendingSessionId(data.sessionId);
            return { chatId: data.chatId as string, sessionId: data.sessionId as string };
          }
          return null;
        }
        return null;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return null;
        }
        console.error("Failed to create chat for warming:", error);
        return null;
      } finally {
        if (abortControllerRef.current === abortController) {
          setIsCreatingSession(false);
          sessionCreationPromise.current = null;
          abortControllerRef.current = null;
        }
      }
    })();

    sessionCreationPromise.current = promise;
    return promise;
  }, [
    selectedRepo,
    selectedModel,
    reasoningEffort,
    selectedBranch,
    pendingChatId,
    pendingSessionId,
    category,
  ]);

  useEffect(() => {
    if (!hasHydratedModelPreferences) return;

    if (enabledModels.length > 0 && !enabledModels.includes(selectedModel)) {
      const fallback = enabledModels[0] ?? DEFAULT_MODEL;
      setSelectedModel(fallback);
      setReasoningEffort(getDefaultReasoningEffort(fallback));
      return;
    }

    if (reasoningEffort && !isValidReasoningEffort(selectedModel, reasoningEffort)) {
      setReasoningEffort(getDefaultReasoningEffort(selectedModel));
    }
  }, [hasHydratedModelPreferences, enabledModels, selectedModel, reasoningEffort]);

  const handleRepoChange = useCallback((repoFullName: string) => {
    setSelectedRepo(repoFullName);
    const newBranch = generateBranchName();
    setAutoBranch(newBranch);
    setSelectedBranch(newBranch);
  }, []);

  const handlePromptChange = (value: string) => {
    const wasEmpty = prompt.length === 0;
    setPrompt(value);
    if (wasEmpty && value.length > 0 && !pendingChatId && !isCreatingSession && selectedRepo) {
      createChatForWarming();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    if (!selectedRepo) {
      setError("Please select a repository");
      return;
    }

    setCreating(true);
    setError("");

    try {
      let ids =
        pendingChatId && pendingSessionId
          ? { chatId: pendingChatId, sessionId: pendingSessionId }
          : null;
      if (!ids) {
        ids = await createChatForWarming();
      }

      if (!ids) {
        setError("Failed to create chat");
        setCreating(false);
        return;
      }

      const res = await fetch(`/api/sessions/${ids.sessionId}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: prompt,
          model: selectedModel,
          reasoningEffort,
        }),
      });

      if (res.ok) {
        fetch(`/api/chats/${ids.chatId}/generate-title`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        }).catch(() => {});
        mutate(SIDEBAR_CHATS_KEY);
        router.push(`/chat/${ids.chatId}`);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to send prompt");
        setCreating(false);
      }
    } catch (_error) {
      setError("Failed to create chat");
      setCreating(false);
    }
  };

  const { isOpen, toggle } = useSidebarContext();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const selectedRepoObj = repos.find((r) => r.fullName === selectedRepo);
  const displayRepoName = selectedRepoObj ? selectedRepoObj.name : "Select repo";

  return (
    <div className="h-full flex flex-col">
      {!isOpen && (
        <header className="flex-shrink-0">
          <div className="px-4 py-3">
            <button
              onClick={toggle}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition"
              title={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
              aria-label={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
            >
              <SidebarIcon className="w-4 h-4" />
            </button>
          </div>
        </header>
      )}

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <h1
              className="text-4xl font-bold text-foreground mb-2"
              style={{ fontFamily: "var(--font-logo)" }}
            >
              tandem
            </h1>
            {session ? (
              <p className="text-muted-foreground text-sm">
                Ask a question or describe what you want to build
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">Sign in to start a new session</p>
            )}
          </div>

          {session && (
            <form onSubmit={handleSubmit}>
              {error && (
                <div className="mb-4 bg-red-900/20 text-red-400 px-4 py-3 border border-red-800 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="rounded-lg">
                {/* Text input */}
                <div className="bg-surface-elevated relative rounded-t-lg">
                  <textarea
                    ref={inputRef}
                    value={prompt}
                    onChange={(e) => handlePromptChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="What do you want to build?"
                    disabled={creating}
                    className="w-full resize-none bg-transparent px-4 pt-4 pb-3 focus:outline-none text-foreground placeholder:text-text-warm-muted disabled:opacity-50 text-[16px] tracking-[-0.8px]"
                    rows={3}
                  />
                  {/* Action buttons */}
                  <div className="flex items-center justify-between px-4 pb-3">
                    <Button type="button" variant="surface" size="compact">
                      <LightbulbIcon className="w-3 h-3" />
                      PLAN
                    </Button>
                    <div className="flex items-center gap-1.5">
                      {isCreatingSession && (
                        <span className="text-[11px] text-accent mr-2">Warming sandbox...</span>
                      )}
                      <Button type="button" variant="surface" size="icon-24" title="Voice input">
                        <AudioLinesIcon className="w-3 h-3" />
                      </Button>
                      <Button
                        type="submit"
                        variant="surface"
                        size="icon-24"
                        disabled={!prompt.trim() || creating || !selectedRepo}
                        title={`Send (${SHORTCUT_LABELS.SEND_PROMPT})`}
                      >
                        {creating ? (
                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <SendIcon className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-surface-footer flex flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-0 rounded-b-lg">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                    <Combobox
                      value={selectedRepo}
                      onChange={(value) => handleRepoChange(value)}
                      items={repos.map((repo) => ({
                        value: repo.fullName,
                        label: repo.name,
                        description: `${repo.owner}${repo.private ? " \u2022 private" : ""}`,
                      }))}
                      searchable
                      searchPlaceholder="Search repositories..."
                      filterFn={(option, query) =>
                        option.label.toLowerCase().includes(query) ||
                        (option.description?.toLowerCase().includes(query) ?? false) ||
                        String(option.value).toLowerCase().includes(query)
                      }
                      direction="up"
                      dropdownWidth="w-72"
                      disabled={creating || loadingRepos}
                      triggerClassName="flex max-w-full items-center gap-1.5 text-[12px] text-text-warm-muted tracking-[-0.24px] uppercase hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <RepoIcon className="w-3 h-3" />
                      <span className="truncate max-w-[10rem]">
                        {loadingRepos ? "Loading..." : displayRepoName}
                      </span>
                      <ChevronDownIcon className="w-3 h-3" />
                    </Combobox>

                    <Combobox
                      value={selectedBranch}
                      onChange={(value) => setSelectedBranch(value)}
                      items={[
                        ...(autoBranch
                          ? [{ value: autoBranch, label: `${autoBranch} (new)` }]
                          : []),
                        ...branches
                          .filter((b) => b.name !== selectedRepoObj?.defaultBranch)
                          .map((b) => ({ value: b.name, label: b.name })),
                      ]}
                      searchable
                      searchPlaceholder="Search branches..."
                      filterFn={(option, query) => option.label.toLowerCase().includes(query)}
                      direction="up"
                      dropdownWidth="w-56"
                      disabled={creating || !selectedRepo || loadingBranches}
                      triggerClassName="flex max-w-full items-center gap-1 text-[12px] text-text-warm-muted tracking-[-0.24px] uppercase hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <BranchIcon className="w-3 h-3" />
                      <span className="truncate max-w-[8rem]">
                        {loadingBranches ? "Loading..." : selectedBranch || "branch"}
                      </span>
                      <ChevronDownIcon className="w-3 h-3" />
                    </Combobox>

                    <span className="text-[12px] text-text-warm-muted tracking-[-0.24px] uppercase">
                      {formatModelNameLower(selectedModel).toUpperCase()}
                    </span>

                    <ReasoningEffortPills
                      selectedModel={selectedModel}
                      reasoningEffort={reasoningEffort}
                      onSelect={setReasoningEffort}
                      disabled={creating}
                    />
                  </div>
                </div>
              </div>

              {selectedRepoObj && (
                <div className="mt-3 text-center">
                  <Link
                    href="/settings"
                    className="text-xs text-muted-foreground hover:text-foreground transition"
                  >
                    Manage secrets and settings
                  </Link>
                </div>
              )}

              {repos.length === 0 && !loadingRepos && (
                <p className="mt-3 text-sm text-muted-foreground text-center">
                  No repositories found. Make sure you have granted access to your repositories.
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
