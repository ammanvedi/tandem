"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Editor } from "@dgmjs/core";
import { Search, X, Plus, Loader2 } from "lucide-react";

type Platform = "ios" | "web";

interface ScreenResult {
  id: string;
  title?: string;
  description?: string;
  app_name?: string;
  category?: string;
  thumbnail_url?: string;
  image_url?: string;
}

interface InspirationSearchProps {
  open: boolean;
  onClose: () => void;
  editorRef: React.RefObject<Editor | null>;
}

export function InspirationSearch({ open, onClose, editorRef }: InspirationSearchProps) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<Platform>("web");
  const [results, setResults] = useState<ScreenResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const doSearch = useCallback(async (q: string, p: Platform) => {
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      const params = new URLSearchParams({ query: q.trim(), platform: p });
      const res = await fetch(`/api/refero/screens?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const screens = Array.isArray(data) ? data : (data?.screens ?? data?.results ?? []);
      setResults(screens);
    } catch (err) {
      console.error("Inspiration search failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(value, platform), 400);
    },
    [doSearch, platform]
  );

  const handlePlatformChange = useCallback(
    (p: Platform) => {
      setPlatform(p);
      if (query.trim()) doSearch(query, p);
    },
    [doSearch, query]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(query, platform);
    },
    [doSearch, query, platform]
  );

  const addToCanvas = useCallback(
    async (screen: ScreenResult) => {
      const editor = editorRef.current;
      if (!editor) return;

      setAddingId(screen.id);

      try {
        const params = new URLSearchParams({ image_size: "full", include_similar: "false" });
        const res = await fetch(`/api/refero/screens/${screen.id}?${params}`);
        if (!res.ok) throw new Error("Failed to fetch screen details");
        const detail = await res.json();

        const imageUrl =
          detail?.image_url || detail?.image || screen.thumbnail_url || screen.image_url;
        if (!imageUrl) {
          console.warn("No image URL found for screen", screen.id);
          return;
        }

        const page = editor.getCurrentPage();
        if (!page) return;

        const origin = editor.getOrigin();
        const scale = editor.getScale();
        const [canvasW, canvasH] = editor.getSize();
        const worldX = canvasW / (2 * scale) - origin[0];
        const worldY = canvasH / (2 * scale) - origin[1];

        const imgWidth = 360;
        const imgHeight = 640;

        editor.actions.insert(
          {
            type: "Image",
            left: worldX - imgWidth / 2,
            top: worldY - imgHeight / 2,
            width: imgWidth,
            height: imgHeight,
            imageUrl,
          } as Record<string, unknown>,
          page
        );
      } catch (err) {
        console.error("Failed to add to canvas:", err);
      } finally {
        setAddingId(null);
      }
    },
    [editorRef]
  );

  if (!open) return null;

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[5] w-[420px] max-h-[480px] flex flex-col rounded-2xl border border-white/[0.08] bg-[#1e1e2e]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.55)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-xs font-medium text-white/70 uppercase tracking-wide">
          Inspiration
        </span>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-white/80 rounded transition"
        >
          <X size={14} />
        </button>
      </div>

      {/* Search input + platform toggle */}
      <form onSubmit={handleSubmit} className="px-3 pb-3">
        <div className="flex items-center gap-2 bg-white/[0.06] rounded-xl px-3 py-2">
          <Search size={14} className="text-white/40 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search for inspiration..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
          {loading && <Loader2 size={14} className="text-white/40 animate-spin shrink-0" />}
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          {(["web", "ios"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handlePlatformChange(p)}
              className={[
                "px-3 py-1 rounded-lg text-[11px] uppercase tracking-wide font-medium transition cursor-pointer",
                platform === p
                  ? "bg-white/[0.14] text-white"
                  : "text-white/40 hover:text-white/60 hover:bg-white/[0.06]",
              ].join(" ")}
            >
              {p}
            </button>
          ))}
        </div>
      </form>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {!hasSearched && (
          <div className="text-center text-white/30 text-xs py-8">
            Search for screens, patterns, or companies
          </div>
        )}

        {hasSearched && !loading && results.length === 0 && (
          <div className="text-center text-white/30 text-xs py-8">No results found</div>
        )}

        {loading && results.length === 0 && (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[9/16] rounded-lg bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {results.map((screen) => (
              <div
                key={screen.id}
                className="group relative rounded-lg overflow-hidden bg-white/[0.04] hover:bg-white/[0.08] transition cursor-pointer"
              >
                {screen.thumbnail_url || screen.image_url ? (
                  <img
                    src={screen.thumbnail_url || screen.image_url}
                    alt={screen.title || screen.description || "Screen"}
                    className="w-full aspect-[9/16] object-cover object-top"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full aspect-[9/16] flex items-center justify-center text-white/20 text-xs">
                    No preview
                  </div>
                )}

                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-0 inset-x-0 p-2">
                    <p className="text-[10px] text-white/80 font-medium truncate">
                      {screen.app_name || screen.title || "Unknown"}
                    </p>
                    {screen.description && (
                      <p className="text-[9px] text-white/50 truncate mt-0.5">
                        {screen.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      addToCanvas(screen);
                    }}
                    disabled={addingId === screen.id}
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md bg-white/20 hover:bg-white/30 text-white transition cursor-pointer disabled:opacity-50"
                    title="Add to canvas"
                  >
                    {addingId === screen.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Plus size={12} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
