"use client";

import { useEffect } from "react";
import {
  useSyntaxHighlightPreferences,
  HLJS_THEME_REGISTRY,
  DARK_THEMES,
} from "@/hooks/use-syntax-highlight-preferences";

const LINK_ID = "hljs-theme-link";

export function SyntaxHighlightTheme() {
  const { colorSchemeMode, preferredDarkTheme } = useSyntaxHighlightPreferences();

  useEffect(() => {
    const themeId = preferredDarkTheme;
    const themeDef = HLJS_THEME_REGISTRY.find((t) => t.id === themeId) ?? DARK_THEMES[0];
    const href = themeDef.cssPath;

    let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
    if (link) {
      if (link.getAttribute("href") === href) return;
      link.href = href;
    } else {
      link = document.createElement("link");
      link.id = LINK_ID;
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }
  }, [colorSchemeMode, preferredDarkTheme]);

  return null;
}
