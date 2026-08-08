/**
 * Single source of truth for animation durations, so timing stays
 * consistent across the app instead of every component picking its own
 * number. Mostly ease-out; springs are reserved for a few select
 * interactions only, heavily damped (see components that use `type: "spring"`
 * explicitly — everything else here is a plain duration).
 */
export const DURATION = {
  hover: 0.15, // button/card hover — 120-180ms
  tooltip: 0.15,
  chip: 0.2, // state chip change — 180-220ms
  card: 0.22, // 200-250ms
  accordion: 0.28, // 250-300ms
  panel: 0.32, // side panel — 280-350ms
  question: 0.35, // question transition — 300-400ms
  page: 0.4, // page/stage transition — 350-500ms
  graph: 0.55, // graph/path draw — 400-700ms
  report: 0.75, // report reveal — 600-900ms
} as const;

export const EASE_OUT = [0.16, 1, 0.3, 1] as const; // standard ease-out curve used throughout
