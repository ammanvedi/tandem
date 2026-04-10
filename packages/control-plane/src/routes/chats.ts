/**
 * Chat CRUD and workspace management routes.
 */

import type { Env } from "../types";
import { generateId, encryptToken } from "../auth/crypto";
import { SessionIndexStore } from "../db/session-index";
import { ChatIndexStore } from "../db/chat-index";
import { UserScmTokenStore, DEFAULT_TOKEN_LIFETIME_MS } from "../db/user-scm-tokens";
import { IntegrationSettingsStore } from "../db/integration-settings";
import { buildSessionInternalUrl, SessionInternalPaths } from "../session/contracts";
import {
  getValidModelOrDefault,
  isValidReasoningEffort,
  type SessionCategory,
  type CreateChatRequest,
  type CodeServerSettings,
} from "@open-inspect/shared";
import { createLogger } from "../logger";
import {
  type Route,
  type RequestContext,
  parsePattern,
  json,
  error,
  createRouteSourceControlProvider,
  resolveInstalledRepo,
} from "./shared";

const logger = createLogger("chat-routes");

const SESSION_CATEGORIES: SessionCategory[] = ["idea", "product", "chat"];

function parseSessionCategory(value: string | null | undefined): SessionCategory | undefined {
  if (!value) return undefined;
  return SESSION_CATEGORIES.includes(value as SessionCategory)
    ? (value as SessionCategory)
    : undefined;
}

async function resolveCodeServerEnabled(
  db: D1Database | undefined,
  repoOwner: string,
  repoName: string
): Promise<boolean> {
  if (!db) return false;
  const repo = `${repoOwner}/${repoName}`;
  try {
    const store = new IntegrationSettingsStore(db);
    const { enabledRepos, settings } = await store.getResolvedConfig("code-server", repo);
    const csSettings = settings as CodeServerSettings;
    if (csSettings.enabled !== true) return false;
    if (enabledRepos !== null && !enabledRepos.includes(repo)) return false;
    return true;
  } catch {
    return false;
  }
}

function internalRequest(url: string, init: RequestInit | undefined, ctx: RequestContext): Request {
  const headers = new Headers(init?.headers);
  headers.set("x-trace-id", ctx.trace_id);
  headers.set("x-request-id", ctx.request_id);
  return new Request(url, { ...init, headers });
}

async function handleCreateChat(
  request: Request,
  env: Env,
  _match: RegExpMatchArray,
  ctx: RequestContext
): Promise<Response> {
  const body = (await request.json()) as CreateChatRequest & {
    scmToken?: string;
    scmRefreshToken?: string;
    scmTokenExpiresAt?: number;
    scmUserId?: string;
    userId?: string;
    scmLogin?: string;
    scmName?: string;
    scmEmail?: string;
  };

  if (!body.repoOwner || !body.repoName) {
    return error("repoOwner and repoName are required");
  }
  if (body.branch && !/^[\w.\-/]+$/.test(body.branch)) {
    return error("Invalid branch name");
  }

  const repoOwner = body.repoOwner.toLowerCase();
  const repoName = body.repoName.toLowerCase();

  let repoId: number;
  let defaultBranch: string;
  try {
    const provider = createRouteSourceControlProvider(env);
    const resolved = await resolveInstalledRepo(provider, repoOwner, repoName);
    if (!resolved) {
      return error("Repository is not installed for the GitHub App", 404);
    }
    repoId = resolved.repoId;
    defaultBranch = resolved.defaultBranch;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error("Failed to resolve repository", { error: message });
    return error("Failed to resolve repository", 500);
  }

  const userId = body.userId || "anonymous";
  const scmLogin = body.scmLogin;
  const scmName = body.scmName;
  const scmEmail = body.scmEmail;
  const scmToken = body.scmToken;
  const scmRefreshToken = body.scmRefreshToken;
  const scmTokenExpiresAt = body.scmTokenExpiresAt;
  const scmUserId = body.scmUserId;
  let scmTokenEncrypted: string | null = null;
  let scmRefreshTokenEncrypted: string | null = null;

  if (scmToken && env.TOKEN_ENCRYPTION_KEY) {
    try {
      scmTokenEncrypted = await encryptToken(scmToken, env.TOKEN_ENCRYPTION_KEY);
    } catch (e) {
      logger.error("Failed to encrypt SCM token", { error: e instanceof Error ? e : String(e) });
      return error("Failed to process SCM token", 500);
    }
  }
  if (scmRefreshToken && env.TOKEN_ENCRYPTION_KEY) {
    try {
      scmRefreshTokenEncrypted = await encryptToken(scmRefreshToken, env.TOKEN_ENCRYPTION_KEY);
    } catch {
      // Non-fatal
    }
  }

  const chatId = generateId();
  const sessionId = generateId();
  const autoBranchName = `inspect/${sessionId.slice(0, 8)}`;
  const model = getValidModelOrDefault(body.model);
  const reasoningEffort =
    body.reasoningEffort && isValidReasoningEffort(model, body.reasoningEffort)
      ? body.reasoningEffort
      : null;
  const codeServerEnabled = await resolveCodeServerEnabled(env.DB, repoOwner, repoName);
  const category = body.category
    ? parseSessionCategory(body.category)
    : ("chat" as SessionCategory);
  if (body.category && !category) {
    return error("Invalid category");
  }

  const now = Date.now();

  // 1. Create chat row in D1
  const chatStore = new ChatIndexStore(env.DB);
  await chatStore.create({
    id: chatId,
    title: body.title || null,
    repoOwner,
    repoName,
    status: "active",
    canvasState: { clusters: [{ sessionId, position: [0, 0] }] },
    createdAt: now,
    updatedAt: now,
  });

  // 2. Init session DO
  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  const initResponse = await stub.fetch(
    internalRequest(
      buildSessionInternalUrl(SessionInternalPaths.init),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionName: sessionId,
          repoOwner,
          repoName,
          repoId,
          defaultBranch,
          branch: body.branch,
          title: body.title,
          model,
          reasoningEffort,
          userId,
          scmLogin,
          scmName,
          scmEmail,
          scmTokenEncrypted,
          scmRefreshTokenEncrypted,
          scmTokenExpiresAt,
          scmUserId,
          codeServerEnabled,
          category,
          autoBranchName,
        }),
      },
      ctx
    )
  );

  if (!initResponse.ok) {
    return error("Failed to create session", 500);
  }

  // 3. Store session in D1 index
  const sessionStore = new SessionIndexStore(env.DB);
  await sessionStore.create({
    id: sessionId,
    title: body.title || null,
    repoOwner,
    repoName,
    model,
    reasoningEffort,
    baseBranch: body.branch || defaultBranch || "main",
    status: "created",
    category: category!,
    tags: [],
    chatId,
    createdAt: now,
    updatedAt: now,
  });

  // 4. Populate D1 with user SCM tokens (non-blocking)
  if (scmUserId && scmToken && scmRefreshToken && env.TOKEN_ENCRYPTION_KEY) {
    ctx.executionCtx?.waitUntil(
      new UserScmTokenStore(env.DB, env.TOKEN_ENCRYPTION_KEY)
        .upsertTokens(
          scmUserId,
          scmToken,
          scmRefreshToken,
          scmTokenExpiresAt ?? Date.now() + DEFAULT_TOKEN_LIFETIME_MS
        )
        .catch((e) =>
          logger.error("Failed to write tokens to D1", {
            error: e instanceof Error ? e : String(e),
          })
        )
    );
  }

  return json({ chatId, sessionId, status: "created" }, 201);
}

async function handleListChats(
  request: Request,
  env: Env,
  _match: RegExpMatchArray,
  _ctx: RequestContext
): Promise<Response> {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") as "active" | "archived" | null;
  const excludeStatus = url.searchParams.get("excludeStatus") as "active" | "archived" | null;
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  const chatStore = new ChatIndexStore(env.DB);
  const result = await chatStore.list({
    status: status || undefined,
    excludeStatus: excludeStatus || undefined,
    limit,
    offset,
  });

  return json({ chats: result.chats, hasMore: result.hasMore });
}

async function handleGetChat(
  _request: Request,
  env: Env,
  match: RegExpMatchArray,
  _ctx: RequestContext
): Promise<Response> {
  const chatId = match.groups?.id;
  if (!chatId) return error("Chat ID is required");

  const chatStore = new ChatIndexStore(env.DB);
  const chat = await chatStore.get(chatId);
  if (!chat) return error("Chat not found", 404);

  const sessionStore = new SessionIndexStore(env.DB);
  const sessions = await sessionStore.listByChatId(chatId);

  return json({ ...chat, sessions });
}

async function handleUpdateChat(
  request: Request,
  env: Env,
  match: RegExpMatchArray,
  _ctx: RequestContext
): Promise<Response> {
  const chatId = match.groups?.id;
  if (!chatId) return error("Chat ID is required");

  const body = (await request.json()) as {
    title?: string;
    canvasState?: { clusters: Array<{ sessionId: string; position: [number, number] }> };
  };

  const chatStore = new ChatIndexStore(env.DB);
  const chat = await chatStore.get(chatId);
  if (!chat) return error("Chat not found", 404);

  if (body.title !== undefined) {
    await chatStore.updateTitle(chatId, body.title);
  }
  if (body.canvasState !== undefined) {
    await chatStore.updateCanvasState(chatId, body.canvasState);
  }

  const updated = await chatStore.get(chatId);
  return json(updated);
}

async function handleArchiveChat(
  _request: Request,
  env: Env,
  match: RegExpMatchArray,
  ctx: RequestContext
): Promise<Response> {
  const chatId = match.groups?.id;
  if (!chatId) return error("Chat ID is required");

  const chatStore = new ChatIndexStore(env.DB);
  const chat = await chatStore.get(chatId);
  if (!chat) return error("Chat not found", 404);

  await chatStore.archive(chatId);

  // Archive all sessions in this chat (background)
  const sessionStore = new SessionIndexStore(env.DB);
  const sessions = await sessionStore.listByChatId(chatId);
  ctx.executionCtx?.waitUntil(
    Promise.all(
      sessions.map(async (session) => {
        if (session.status !== "archived") {
          const doId = env.SESSION.idFromName(session.id);
          const stub = env.SESSION.get(doId);
          await stub
            .fetch(
              internalRequest(
                buildSessionInternalUrl(SessionInternalPaths.archive),
                { method: "POST" },
                ctx
              )
            )
            .catch((e) =>
              logger.error("Failed to archive session in chat", {
                session_id: session.id,
                chat_id: chatId,
                error: e instanceof Error ? e : String(e),
              })
            );
        }
      })
    )
  );

  return json({ ok: true });
}

async function handleListChatSessions(
  _request: Request,
  env: Env,
  match: RegExpMatchArray,
  _ctx: RequestContext
): Promise<Response> {
  const chatId = match.groups?.id;
  if (!chatId) return error("Chat ID is required");

  const sessionStore = new SessionIndexStore(env.DB);
  const sessions = await sessionStore.listByChatId(chatId);

  return json({ sessions });
}

async function handleAddSessionToChat(
  request: Request,
  env: Env,
  match: RegExpMatchArray,
  ctx: RequestContext
): Promise<Response> {
  const chatId = match.groups?.id;
  if (!chatId) return error("Chat ID is required");

  const chatStore = new ChatIndexStore(env.DB);
  const chat = await chatStore.get(chatId);
  if (!chat) return error("Chat not found", 404);

  const body = (await request.json()) as {
    prompt: string;
    model?: string;
    reasoningEffort?: string;
    branch?: string;
    userId?: string;
    scmLogin?: string;
    scmName?: string;
    scmEmail?: string;
    scmToken?: string;
    scmRefreshToken?: string;
    scmTokenExpiresAt?: number;
    scmUserId?: string;
  };

  if (!body.prompt) return error("prompt is required");

  const repoOwner = chat.repoOwner;
  const repoName = chat.repoName;

  let repoId: number;
  let defaultBranch: string;
  try {
    const provider = createRouteSourceControlProvider(env);
    const resolved = await resolveInstalledRepo(provider, repoOwner, repoName);
    if (!resolved) return error("Repository not found", 404);
    repoId = resolved.repoId;
    defaultBranch = resolved.defaultBranch;
  } catch {
    return error("Failed to resolve repository", 500);
  }

  const sessionId = generateId();
  const autoBranchName = `inspect/${sessionId.slice(0, 8)}`;
  const model = getValidModelOrDefault(body.model);
  const reasoningEffort =
    body.reasoningEffort && isValidReasoningEffort(model, body.reasoningEffort)
      ? body.reasoningEffort
      : null;
  const codeServerEnabled = await resolveCodeServerEnabled(env.DB, repoOwner, repoName);
  const now = Date.now();

  let scmTokenEncrypted: string | null = null;
  let scmRefreshTokenEncrypted: string | null = null;
  if (body.scmToken && env.TOKEN_ENCRYPTION_KEY) {
    try {
      scmTokenEncrypted = await encryptToken(body.scmToken, env.TOKEN_ENCRYPTION_KEY);
    } catch {
      return error("Failed to process SCM token", 500);
    }
  }
  if (body.scmRefreshToken && env.TOKEN_ENCRYPTION_KEY) {
    try {
      scmRefreshTokenEncrypted = await encryptToken(body.scmRefreshToken, env.TOKEN_ENCRYPTION_KEY);
    } catch {
      // Non-fatal
    }
  }

  // Init session DO
  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);
  const initResponse = await stub.fetch(
    internalRequest(
      buildSessionInternalUrl(SessionInternalPaths.init),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionName: sessionId,
          repoOwner,
          repoName,
          repoId,
          defaultBranch,
          branch: body.branch,
          model,
          reasoningEffort,
          userId: body.userId || "anonymous",
          scmLogin: body.scmLogin,
          scmName: body.scmName,
          scmEmail: body.scmEmail,
          scmTokenEncrypted,
          scmRefreshTokenEncrypted,
          scmTokenExpiresAt: body.scmTokenExpiresAt,
          scmUserId: body.scmUserId,
          codeServerEnabled,
          category: "chat" as SessionCategory,
          autoBranchName,
        }),
      },
      ctx
    )
  );

  if (!initResponse.ok) return error("Failed to create session", 500);

  // Store session in D1
  const sessionStore = new SessionIndexStore(env.DB);
  await sessionStore.create({
    id: sessionId,
    title: null,
    repoOwner,
    repoName,
    model,
    reasoningEffort,
    baseBranch: body.branch || defaultBranch || "main",
    status: "created",
    category: "chat",
    tags: [],
    chatId,
    createdAt: now,
    updatedAt: now,
  });

  // Enqueue the first prompt
  await stub.fetch(
    internalRequest(
      buildSessionInternalUrl(SessionInternalPaths.prompt),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: body.prompt, model, reasoningEffort }),
      },
      ctx
    )
  );

  // Update canvas state with the new cluster
  const canvasState = chat.canvasState ?? { clusters: [] };
  const existingPositions = canvasState.clusters.map((c) => c.position);
  const maxX = existingPositions.reduce((max, pos) => Math.max(max, pos[0]), 0);
  canvasState.clusters.push({
    sessionId,
    position: [maxX + 900, 0] as [number, number],
  });
  await chatStore.updateCanvasState(chatId, canvasState);

  return json({ sessionId, chatId, status: "created" }, 201);
}

async function handleForkSession(
  _request: Request,
  env: Env,
  match: RegExpMatchArray,
  ctx: RequestContext
): Promise<Response> {
  const chatId = match.groups?.id;
  const sourceSessionId = match.groups?.sessionId;
  if (!chatId || !sourceSessionId) return error("Chat ID and session ID are required");

  const chatStore = new ChatIndexStore(env.DB);
  const chat = await chatStore.get(chatId);
  if (!chat) return error("Chat not found", 404);

  // Verify session belongs to this chat
  const sessionStore = new SessionIndexStore(env.DB);
  const sourceSession = await sessionStore.get(sourceSessionId);
  if (!sourceSession || sourceSession.chatId !== chatId) {
    return error("Session not found in this chat", 404);
  }

  // Trigger snapshot on source session
  const sourceDoId = env.SESSION.idFromName(sourceSessionId);
  const sourceStub = env.SESSION.get(sourceDoId);

  const snapshotResponse = await sourceStub.fetch(
    internalRequest(
      buildSessionInternalUrl(SessionInternalPaths.snapshot),
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      ctx
    )
  );

  if (!snapshotResponse.ok) {
    const text = await snapshotResponse.text();
    logger.error("Failed to snapshot source session for fork", {
      session_id: sourceSessionId,
      chat_id: chatId,
      error: text,
    });
    return error("Failed to snapshot session for fork", 500);
  }

  const snapshotResult = (await snapshotResponse.json()) as { imageId?: string };
  if (!snapshotResult.imageId) {
    return error("Snapshot did not return an image ID", 500);
  }

  // Create new session from snapshot
  const newSessionId = generateId();
  const autoBranchName = `inspect/${newSessionId.slice(0, 8)}`;
  const now = Date.now();

  // Get spawn context from source session
  const spawnCtxResponse = await sourceStub.fetch(
    internalRequest(
      buildSessionInternalUrl(SessionInternalPaths.spawnContext),
      { method: "GET" },
      ctx
    )
  );

  if (!spawnCtxResponse.ok) {
    return error("Failed to get spawn context from source session", 500);
  }

  const spawnContext = (await spawnCtxResponse.json()) as {
    repoOwner: string;
    repoName: string;
    repoId: number | null;
    model: string;
    reasoningEffort: string | null;
    baseBranch: string | null;
    owner: {
      userId: string;
      scmLogin: string | null;
      scmName: string | null;
      scmEmail: string | null;
      scmAccessTokenEncrypted: string | null;
      scmRefreshTokenEncrypted: string | null;
      scmTokenExpiresAt: number | null;
    };
  };

  const codeServerEnabled = await resolveCodeServerEnabled(
    env.DB,
    spawnContext.repoOwner,
    spawnContext.repoName
  );

  const newDoId = env.SESSION.idFromName(newSessionId);
  const newStub = env.SESSION.get(newDoId);

  const initResponse = await newStub.fetch(
    internalRequest(
      buildSessionInternalUrl(SessionInternalPaths.init),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionName: newSessionId,
          repoOwner: spawnContext.repoOwner,
          repoName: spawnContext.repoName,
          repoId: spawnContext.repoId,
          defaultBranch: spawnContext.baseBranch || "main",
          branch: spawnContext.baseBranch,
          model: spawnContext.model,
          reasoningEffort: spawnContext.reasoningEffort,
          userId: spawnContext.owner.userId,
          scmLogin: spawnContext.owner.scmLogin,
          scmName: spawnContext.owner.scmName,
          scmEmail: spawnContext.owner.scmEmail,
          scmTokenEncrypted: spawnContext.owner.scmAccessTokenEncrypted,
          scmRefreshTokenEncrypted: spawnContext.owner.scmRefreshTokenEncrypted,
          scmTokenExpiresAt: spawnContext.owner.scmTokenExpiresAt,
          codeServerEnabled,
          category: "chat",
          autoBranchName,
          snapshotId: snapshotResult.imageId,
        }),
      },
      ctx
    )
  );

  if (!initResponse.ok) {
    return error("Failed to create forked session", 500);
  }

  // Store in D1
  await sessionStore.create({
    id: newSessionId,
    title: sourceSession.title ? `Fork of ${sourceSession.title}` : null,
    repoOwner: spawnContext.repoOwner,
    repoName: spawnContext.repoName,
    model: spawnContext.model,
    reasoningEffort: spawnContext.reasoningEffort,
    baseBranch: spawnContext.baseBranch || "main",
    status: "created",
    category: "chat",
    tags: [],
    chatId,
    createdAt: now,
    updatedAt: now,
  });

  // Update canvas state
  const canvasState = chat.canvasState ?? { clusters: [] };
  const sourceCluster = canvasState.clusters.find((c) => c.sessionId === sourceSessionId);
  const newPosition: [number, number] = sourceCluster
    ? [sourceCluster.position[0] + 900, sourceCluster.position[1]]
    : [canvasState.clusters.length * 900, 0];

  canvasState.clusters.push({ sessionId: newSessionId, position: newPosition });
  await chatStore.updateCanvasState(chatId, canvasState);

  return json(
    {
      sessionId: newSessionId,
      chatId,
      forkedFrom: sourceSessionId,
      status: "created",
    },
    201
  );
}

async function handleUpdateChatTitle(
  request: Request,
  env: Env,
  match: RegExpMatchArray,
  _ctx: RequestContext
): Promise<Response> {
  const chatId = match.groups?.id;
  if (!chatId) return error("Chat ID is required");

  const body = (await request.json()) as { title?: string };
  if (!body.title) return error("title is required");

  const chatStore = new ChatIndexStore(env.DB);
  const chat = await chatStore.get(chatId);
  if (!chat) return error("Chat not found", 404);

  await chatStore.updateTitle(chatId, body.title);
  return json({ title: body.title });
}

export const chatRoutes: Route[] = [
  {
    method: "POST",
    pattern: parsePattern("/chats"),
    handler: handleCreateChat,
  },
  {
    method: "GET",
    pattern: parsePattern("/chats"),
    handler: handleListChats,
  },
  {
    method: "GET",
    pattern: parsePattern("/chats/:id"),
    handler: handleGetChat,
  },
  {
    method: "PATCH",
    pattern: parsePattern("/chats/:id"),
    handler: handleUpdateChat,
  },
  {
    method: "POST",
    pattern: parsePattern("/chats/:id/archive"),
    handler: handleArchiveChat,
  },
  {
    method: "GET",
    pattern: parsePattern("/chats/:id/sessions"),
    handler: handleListChatSessions,
  },
  {
    method: "POST",
    pattern: parsePattern("/chats/:id/sessions"),
    handler: handleAddSessionToChat,
  },
  {
    method: "POST",
    pattern: parsePattern("/chats/:id/fork/:sessionId"),
    handler: handleForkSession,
  },
  {
    method: "PATCH",
    pattern: parsePattern("/chats/:id/title"),
    handler: handleUpdateChatTitle,
  },
];
