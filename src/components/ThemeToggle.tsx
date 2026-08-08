"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // Reading localStorage/matchMedia is browser-only, so this can only run
    // post-mount. That means a first-paint flash of the system/default theme
    // before this syncs — a deliberate simplicity trade-off over a blocking
    // pre-hydration script, which fought this Next.js version's script-
    // hoisting internals for no real benefit at hackathon-demo scale.
    const initial = (localStorage.getItem("theme") as Theme | null) ?? systemTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="mono text-xs rounded-md border px-2.5 py-1 cursor-pointer transition-colors hover:border-[var(--accent-2)]"
      style={{ borderColor: "var(--border)", color: "var(--fg-dim)" }}
    >
      {theme === "dark" ? "☀ light" : theme === "light" ? "☾ dark" : " "}
    </button>
  );
}
