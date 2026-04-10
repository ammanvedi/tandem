import { beforeEach, describe, expect, it } from "vitest";
import { ChatIndexStore } from "./chat-index";
import type { ChatEntry } from "./chat-index";

interface ChatRow {
  id: string;
  title: string | null;
  repo_owner: string;
  repo_name: string;
  status: string;
  canvas_state: string | null;
  created_at: number;
  updated_at: number;
}

const QUERY_PATTERNS = {
  INSERT: /^INSERT OR IGNORE INTO chats/,
  SELECT_BY_ID: /^SELECT \* FROM chats WHERE id = \?$/,
  SELECT_COUNT: /^SELECT COUNT\(\*\) as count FROM chats\b/,
  SELECT_LIST: /^SELECT \* FROM chats\b.*ORDER BY updated_at DESC LIMIT/,
  UPDATE_TITLE: /^UPDATE chats SET title = \?/,
  UPDATE_CANVAS_STATE: /^UPDATE chats SET canvas_state = \?/,
  UPDATE_STATUS: /^UPDATE chats SET status = \?.*WHERE id = \? AND updated_at <= \?/,
  UPDATE_UPDATED_AT: /^UPDATE chats SET updated_at = \? WHERE id = \?$/,
  DELETE: /^DELETE FROM chats WHERE id = \?$/,
} as const;

function normalize(q: string) {
  return q.replace(/\s+/g, " ").trim();
}

class FakeD1Database {
  private rows = new Map<string, ChatRow>();

  prepare(query: string) {
    return new FakePreparedStatement(this, query);
  }

  first(query: string, args: unknown[]) {
    const q = normalize(query);
    if (QUERY_PATTERNS.SELECT_BY_ID.test(q)) {
      return this.rows.get(args[0] as string) ?? null;
    }
    if (QUERY_PATTERNS.SELECT_COUNT.test(q)) {
      const filtered = this.applyWhere(q, args);
      return { count: filtered.length };
    }
    throw new Error(`Unexpected first() query: ${query}`);
  }

  all(query: string, args: unknown[]) {
    const q = normalize(query);
    if (QUERY_PATTERNS.SELECT_LIST.test(q)) {
      const allArgs = [...args];
      const offset = allArgs.pop() as number;
      const limit = allArgs.pop() as number;
      const filtered = this.applyWhere(q, allArgs);
      const sorted = filtered.sort((a, b) => b.updated_at - a.updated_at);
      return { results: sorted.slice(offset, offset + limit) };
    }
    throw new Error(`Unexpected all() query: ${query}`);
  }

  run(query: string, args: unknown[]) {
    const q = normalize(query);
    if (QUERY_PATTERNS.INSERT.test(q)) {
      const [id, title, repoOwner, repoName, status, canvasState, createdAt, updatedAt] = args as [
        string,
        string | null,
        string,
        string,
        string,
        string | null,
        number,
        number,
      ];
      if (!this.rows.has(id)) {
        this.rows.set(id, {
          id,
          title,
          repo_owner: repoOwner,
          repo_name: repoName,
          status,
          canvas_state: canvasState,
          created_at: createdAt,
          updated_at: updatedAt,
        });
      }
      return { meta: { changes: 1 } };
    }

    if (QUERY_PATTERNS.UPDATE_TITLE.test(q)) {
      const [title, , id] = args as [string, number, string];
      const row = this.rows.get(id);
      if (row) {
        row.title = title;
        row.updated_at = Date.now();
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }

    if (QUERY_PATTERNS.UPDATE_CANVAS_STATE.test(q)) {
      const [canvasState, , id] = args as [string, number, string];
      const row = this.rows.get(id);
      if (row) {
        row.canvas_state = canvasState;
        row.updated_at = Date.now();
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }

    if (QUERY_PATTERNS.UPDATE_STATUS.test(q)) {
      const [status, updatedAt, id, maxUpdatedAt] = args as [string, number, string, number];
      const row = this.rows.get(id);
      if (row && row.updated_at <= maxUpdatedAt) {
        row.status = status;
        row.updated_at = updatedAt;
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }

    if (QUERY_PATTERNS.UPDATE_UPDATED_AT.test(q)) {
      const [, id] = args as [number, string];
      const row = this.rows.get(id);
      if (row) {
        row.updated_at = Date.now();
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }

    if (QUERY_PATTERNS.DELETE.test(q)) {
      const id = args[0] as string;
      const existed = this.rows.delete(id);
      return { meta: { changes: existed ? 1 : 0 } };
    }

    throw new Error(`Unexpected run() query: ${query}`);
  }

  private applyWhere(q: string, args: unknown[]): ChatRow[] {
    let rows = Array.from(this.rows.values());
    let argIndex = 0;

    if (q.includes("status = ?")) {
      const val = args[argIndex++] as string;
      rows = rows.filter((r) => r.status === val);
    }
    if (q.includes("status != ?")) {
      const val = args[argIndex++] as string;
      rows = rows.filter((r) => r.status !== val);
    }
    if (q.includes("repo_owner = ?")) {
      const val = args[argIndex++] as string;
      rows = rows.filter((r) => r.repo_owner === val);
    }
    if (q.includes("repo_name = ?")) {
      const val = args[argIndex++] as string;
      rows = rows.filter((r) => r.repo_name === val);
    }
    void argIndex;
    return rows;
  }
}

class FakePreparedStatement {
  private args: unknown[] = [];
  constructor(
    private db: FakeD1Database,
    private query: string
  ) {}

  bind(...args: unknown[]) {
    this.args = args;
    return this;
  }

  first<T>(): T {
    return this.db.first(this.query, this.args) as T;
  }

  all<T>() {
    return this.db.all(this.query, this.args) as T;
  }

  run() {
    return this.db.run(this.query, this.args);
  }
}

function makeChatEntry(overrides: Partial<ChatEntry> = {}): ChatEntry {
  const now = Date.now();
  return {
    id: "chat-1",
    title: "Test Chat",
    repoOwner: "owner",
    repoName: "repo",
    status: "active",
    canvasState: { clusters: [{ sessionId: "s1", position: [0, 0] }] },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("ChatIndexStore", () => {
  let store: ChatIndexStore;

  beforeEach(() => {
    const db = new FakeD1Database();
    store = new ChatIndexStore(db as unknown as D1Database);
  });

  describe("create and get", () => {
    it("creates a chat and retrieves it by id", async () => {
      const entry = makeChatEntry();
      await store.create(entry);
      const result = await store.get("chat-1");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("chat-1");
      expect(result!.title).toBe("Test Chat");
      expect(result!.repoOwner).toBe("owner");
      expect(result!.repoName).toBe("repo");
      expect(result!.status).toBe("active");
      expect(result!.canvasState).toEqual({
        clusters: [{ sessionId: "s1", position: [0, 0] }],
      });
    });

    it("returns null for nonexistent chat", async () => {
      const result = await store.get("nonexistent");
      expect(result).toBeNull();
    });

    it("normalizes repo owner and name to lowercase", async () => {
      await store.create(makeChatEntry({ repoOwner: "MyOrg", repoName: "MyRepo" }));
      const result = await store.get("chat-1");
      expect(result!.repoOwner).toBe("myorg");
      expect(result!.repoName).toBe("myrepo");
    });
  });

  describe("list", () => {
    it("lists chats ordered by updatedAt descending", async () => {
      const now = Date.now();
      await store.create(makeChatEntry({ id: "c1", updatedAt: now - 1000 }));
      await store.create(makeChatEntry({ id: "c2", updatedAt: now }));
      const result = await store.list();
      expect(result.chats).toHaveLength(2);
      expect(result.chats[0].id).toBe("c2");
      expect(result.chats[1].id).toBe("c1");
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it("filters by status", async () => {
      await store.create(makeChatEntry({ id: "c1", status: "active" }));
      await store.create(makeChatEntry({ id: "c2", status: "archived" }));
      const result = await store.list({ status: "active" });
      expect(result.chats).toHaveLength(1);
      expect(result.chats[0].id).toBe("c1");
    });

    it("filters by excludeStatus", async () => {
      await store.create(makeChatEntry({ id: "c1", status: "active" }));
      await store.create(makeChatEntry({ id: "c2", status: "archived" }));
      const result = await store.list({ excludeStatus: "archived" });
      expect(result.chats).toHaveLength(1);
      expect(result.chats[0].id).toBe("c1");
    });

    it("supports pagination", async () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        await store.create(makeChatEntry({ id: `c${i}`, updatedAt: now + i * 100 }));
      }
      const result = await store.list({ limit: 2, offset: 0 });
      expect(result.chats).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(true);
    });
  });

  describe("updateTitle", () => {
    it("updates the title of an existing chat", async () => {
      await store.create(makeChatEntry());
      const updated = await store.updateTitle("chat-1", "New Title");
      expect(updated).toBe(true);
      const result = await store.get("chat-1");
      expect(result!.title).toBe("New Title");
    });

    it("returns false for nonexistent chat", async () => {
      const updated = await store.updateTitle("nonexistent", "Title");
      expect(updated).toBe(false);
    });
  });

  describe("updateCanvasState", () => {
    it("updates the canvas state", async () => {
      await store.create(makeChatEntry());
      const newState = {
        clusters: [{ sessionId: "s2", position: [100, 200] as [number, number] }],
      };
      const updated = await store.updateCanvasState("chat-1", newState);
      expect(updated).toBe(true);
      const result = await store.get("chat-1");
      expect(result!.canvasState).toEqual(newState);
    });
  });

  describe("archive", () => {
    it("archives a chat", async () => {
      await store.create(makeChatEntry());
      const archived = await store.archive("chat-1");
      expect(archived).toBe(true);
      const result = await store.get("chat-1");
      expect(result!.status).toBe("archived");
    });
  });

  describe("delete", () => {
    it("deletes a chat", async () => {
      await store.create(makeChatEntry());
      const deleted = await store.delete("chat-1");
      expect(deleted).toBe(true);
      const result = await store.get("chat-1");
      expect(result).toBeNull();
    });

    it("returns false for nonexistent chat", async () => {
      const deleted = await store.delete("nonexistent");
      expect(deleted).toBe(false);
    });
  });
});
