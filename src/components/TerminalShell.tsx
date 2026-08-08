export function TerminalShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border overflow-hidden flex flex-col"
      style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
    >
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0"
        style={{ background: "var(--bg-inset)", borderColor: "var(--border)" }}
      >
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: "var(--danger)", opacity: 0.7 }} />
          <span className="size-2.5 rounded-full" style={{ background: "var(--warn)", opacity: 0.7 }} />
          <span className="size-2.5 rounded-full" style={{ background: "var(--accent)", opacity: 0.7 }} />
        </span>
        <span className="mono text-xs truncate" style={{ color: "var(--fg-dim)" }}>
          {title}
        </span>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      {footer}
    </div>
  );
}
