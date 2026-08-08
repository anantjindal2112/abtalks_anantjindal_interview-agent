"use client";

import Link from "next/link";

/**
 * A real, always-visible way back to the dashboard — distinct from a
 * TerminalShell's minimize button (which just hides/restores that one
 * window's own content, on purpose, and shouldn't be the only way to
 * navigate). Pass `onClick` on the home route itself (resets in-page stage
 * state instead of a no-op same-URL navigation); omit it elsewhere to fall
 * back to a real `Link` to "/".
 */
export function DashboardButton({ onClick }: { onClick?: () => void }) {
  const className =
    "mono text-xs rounded-full border px-3 py-1.5 flex items-center gap-1.5 cursor-pointer transition-colors hover:border-[var(--accent-2)] hover:text-[var(--accent-2)]";
  const style = { borderColor: "var(--border)", color: "var(--fg-dim)", background: "var(--bg-inset)" } as const;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} style={style} title="Back to dashboard">
        <span aria-hidden>⌂</span> Dashboard
      </button>
    );
  }
  return (
    <Link href="/" className={className} style={style} title="Back to dashboard">
      <span aria-hidden>⌂</span> Dashboard
    </Link>
  );
}
