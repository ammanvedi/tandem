import type { ChatStatus, ChatCanvasState } from "@open-inspect/shared";

export interface ChatEntry {
  id: string;
  title: string | null;
  repoOwner: string;
  repoName: string;
  status: ChatStatus;
  canvasState: ChatCanvasState | null;
  createdAt: number;
  updatedAt: number;
}

interface ChatRow {
  id: string;
  title: string | null;
  repo_owner: string;
  repo_name: string;
  status: ChatStatus;
  canvas_state: string | null;
  created_at: number;
  updated_at: number;
}

export interface ListChatsOptions {
  status?: ChatStatus;
  excludeStatus?: ChatStatus;
  repoOwner?: string;
  repoName?: string;
  limit?: number;
  offset?: number;
}

export interface ListChatsResult {
  chats: ChatEntry[];
  total: number;
  hasMore: boolean;
}

function parseCanvasState(raw: string | null): ChatCanvasState | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toEntry(row: ChatRow): ChatEntry {
  return {
    id: row.id,
    title: row.title,
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    status: row.status as ChatStatus,
    canvasState: parseCanvasState(row.canvas_state),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ChatIndexStore {
  constructor(private readonly db: D1Database) {}

  async create(chat: ChatEntry): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO chats (id, title, repo_owner, repo_name, status, canvas_state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        chat.id,
        chat.title,
        chat.repoOwner.toLowerCase(),
        chat.repoName.toLowerCase(),
        chat.status,
        chat.canvasState ? JSON.stringify(chat.canvasState) : null,
        chat.createdAt,
        chat.updatedAt
      )
      .run();
  }

  async get(id: string): Promise<ChatEntry | null> {
    const result = await this.db
      .prepare("SELECT * FROM chats WHERE id = ?")
      .bind(id)
      .first<ChatRow>();
    return result ? toEntry(result) : null;
  }

  async list(options: ListChatsOptions = {}): Promise<ListChatsResult> {
    const { status, excludeStatus, repoOwner, repoName, limit = 50, offset = 0 } = options;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }
    if (excludeStatus) {
      conditions.push("status != ?");
      params.push(excludeStatus);
    }
    if (repoOwner) {
      conditions.push("repo_owner = ?");
      params.push(repoOwner.toLowerCase());
    }
    if (repoName) {
      conditions.push("repo_name = ?");
      params.push(repoName.toLowerCase());
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await this.db
      .prepare(`SELECT COUNT(*) as count FROM chats ${where}`)
      .bind(...params)
      .first<{ count: number }>();

    const total = countResult?.count ?? 0;

    const result = await this.db
      .prepare(`SELECT * FROM chats ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
      .bind(...params, limit, offset)
      .all<ChatRow>();

    const chats = (result.results || []).map(toEntry);

    return {
      chats,
      total,
      hasMore: offset + chats.length < total,
    };
  }

  async updateTitle(id: string, title: string): Promise<boolean> {
    const result = await this.db
      .prepare("UPDATE chats SET title = ?, updated_at = ? WHERE id = ?")
      .bind(title, Date.now(), id)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async updateCanvasState(id: string, canvasState: ChatCanvasState): Promise<boolean> {
    const result = await this.db
      .prepare("UPDATE chats SET canvas_state = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(canvasState), Date.now(), id)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async updateStatus(id: string, status: ChatStatus, updatedAt = Date.now()): Promise<boolean> {
    const result = await this.db
      .prepare("UPDATE chats SET status = ?, updated_at = ? WHERE id = ? AND updated_at <= ?")
      .bind(status, updatedAt, id, updatedAt)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async archive(id: string): Promise<boolean> {
    return this.updateStatus(id, "archived");
  }

  async touchUpdatedAt(id: string): Promise<boolean> {
    const result = await this.db
      .prepare("UPDATE chats SET updated_at = ? WHERE id = ?")
      .bind(Date.now(), id)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM chats WHERE id = ?").bind(id).run();
    return (result.meta?.changes ?? 0) > 0;
  }
}
