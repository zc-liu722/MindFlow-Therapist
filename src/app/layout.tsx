import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MindFlow Therapist",
  description: "隐私优先的 AI 心理咨询与督导工作台"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const themeInitScript = `
    (function () {
      var storageKey = "mindflow-theme-preference";
      var root = document.documentElement;
      var preference = "system";

      try {
        var saved = window.localStorage.getItem(storageKey);
        if (saved === "light" || saved === "dark" || saved === "system") {
          preference = saved;
        }
      } catch {}

      var resolvedTheme =
        preference === "system"
          ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
          : preference;

      root.dataset.theme = resolvedTheme;
      root.dataset.themePreference = preference;
      root.style.colorScheme = resolvedTheme;
    })();
  `;

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
