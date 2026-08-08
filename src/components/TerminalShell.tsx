"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DURATION } from "@/lib/motion";

/**
 * The traffic-light dots are functional, not just decorative window chrome:
 * red closes (reversibly — never destroys interview state, just hides the
 * window behind a reopen affordance), yellow minimizes to a small floating
 * bubble, green requests true browser fullscreen (falls back to a fixed
 * viewport-covering overlay if the Fullscreen API is unavailable/blocked,
 * e.g. inside a sandboxed preview iframe without `allow="fullscreen"`).
 */
export function TerminalShell({
  title,
  children,
  footer,
  action,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [windowState, setWindowState] = useState<"normal" | "closed" | "minimized">("normal");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  async function toggleFullscreen() {
    if (!rootRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    try {
      await rootRef.current.requestFullscreen();
    } catch {
      // Fullscreen API blocked (e.g. sandboxed iframe without allow="fullscreen")
      // — fall back to a CSS full-viewport overlay so the button still does
      // something sensible instead of silently failing.
      setIsFullscreen(true);
    }
  }

  if (windowState === "closed") {
    return (
      <button
        type="button"
        onClick={() => setWindowState("normal")}
        className="mono text-xs rounded-lg border px-4 py-2.5 cursor-pointer w-full text-left"
        style={{ borderColor: "var(--border)", color: "var(--fg-dim)", background: "var(--bg-elevated)" }}
      >
        <span className="inline-block size-2.5 rounded-full mr-2 align-middle" style={{ background: "var(--danger)", opacity: 0.7 }} />
        {title} — closed, click to reopen
      </button>
    );
  }

  return (
    <>
      <AnimatePresence>
        {windowState === "minimized" && (
          <motion.button
            type="button"
            onClick={() => setWindowState("normal")}
            initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduceMotion ? undefined : { scale: 0, opacity: 0 }}
            transition={{ duration: DURATION.card }}
            className="fixed bottom-5 right-5 z-50 rounded-full cursor-pointer flex items-center gap-2 pl-2 pr-3.5 py-2"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}
            title={`Reopen ${title}`}
          >
            <span className="flex gap-1">
              <span className="size-2 rounded-full" style={{ background: "var(--danger)", opacity: 0.7 }} />
              <span className="size-2 rounded-full" style={{ background: "var(--warn)", opacity: 0.7 }} />
              <span className="size-2 rounded-full" style={{ background: "var(--accent)", opacity: 0.7 }} />
            </span>
            <span className="mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
              reopen
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <div
        ref={rootRef}
        className={`rounded-xl border overflow-hidden flex flex-col ${windowState === "minimized" ? "hidden" : ""}`}
        style={{
          background: "var(--bg-elevated)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow)",
          ...(isFullscreen
            ? { position: "fixed", inset: 0, zIndex: 60, borderRadius: 0, height: "100vh", width: "100vw" }
            : {}),
        }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0"
          style={{ background: "var(--bg-inset)", borderColor: "var(--border)" }}
        >
          <span className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setWindowState("closed")}
              aria-label="Close"
              title="Close"
              className="size-2.5 rounded-full cursor-pointer transition-opacity hover:opacity-100"
              style={{ background: "var(--danger)", opacity: 0.7 }}
            />
            <button
              type="button"
              onClick={() => setWindowState("minimized")}
              aria-label="Minimize"
              title="Minimize"
              className="size-2.5 rounded-full cursor-pointer transition-opacity hover:opacity-100"
              style={{ background: "var(--warn)", opacity: 0.7 }}
            />
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              className="cursor-pointer"
            >
              <motion.span
                className="size-2.5 rounded-full block"
                style={{ background: "var(--accent)" }}
                animate={reduceMotion ? { opacity: 0.7 } : { opacity: [0.5, 1, 0.5] }}
                transition={reduceMotion ? undefined : { duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            </button>
          </span>
          <span className="mono text-xs truncate" style={{ color: "var(--fg-dim)" }}>
            {title}
          </span>
          {action && <span className="ml-auto shrink-0">{action}</span>}
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">{children}</div>
        {footer}
      </div>
    </>
  );
}
