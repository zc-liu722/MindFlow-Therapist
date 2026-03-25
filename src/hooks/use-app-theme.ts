"use client";

import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

export function useAppTheme(storageKey: string) {
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const root = document.documentElement;
    const storedPreference = root.dataset.themePreference;

    if (
      storedPreference === "light" ||
      storedPreference === "dark" ||
      storedPreference === "system"
    ) {
      setThemePreference(storedPreference);
      return;
    }

    try {
      const savedPreference = window.localStorage.getItem(storageKey);
      if (
        savedPreference === "light" ||
        savedPreference === "dark" ||
        savedPreference === "system"
      ) {
        setThemePreference(savedPreference);
      }
    } catch {
      // Ignore storage failures and keep system mode.
    }
  }, [storageKey]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function applyTheme(preference: ThemePreference) {
      const resolvedTheme =
        preference === "system" ? (mediaQuery.matches ? "dark" : "light") : preference;

      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.dataset.themePreference = preference;
      document.documentElement.style.colorScheme = resolvedTheme;

      try {
        window.localStorage.setItem(storageKey, preference);
      } catch {
        // Ignore storage failures and still apply the in-memory preference.
      }
    }

    applyTheme(themePreference);

    const handleChange = () => {
      if (themePreference === "system") {
        applyTheme("system");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [storageKey, themePreference]);

  const nextThemePreference: Record<ThemePreference, ThemePreference> = {
    system: "light",
    light: "dark",
    dark: "system"
  };

  function cycleThemePreference() {
    setThemePreference((current) => nextThemePreference[current]);
  }

  function getThemeButtonLabel() {
    if (themePreference === "light") {
      return "切换主题，当前为白天模式";
    }
    if (themePreference === "dark") {
      return "切换主题，当前为黑夜模式";
    }
    return "切换主题，当前跟随系统";
  }

  return {
    themePreference,
    setThemePreference,
    cycleThemePreference,
    getThemeButtonLabel
  };
}
