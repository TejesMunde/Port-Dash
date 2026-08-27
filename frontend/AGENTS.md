# Frontend — AGENTS.md

## Purpose

React SPA that authenticates against the backend, displays Tailscale peers, and provides a UI for creating/toggling/deleting iptables DNAT rules. Features a looping night-sky video background with a scrim overlay.

## Ownership

- `src/App.tsx` — auth gate (login vs dashboard) + video background + scrim
- `src/main.tsx` — React entry point (StrictMode)
- `src/index.css` — Tailwind directives + CSS custom property tokens + font imports + motion tokens + dialog keyframe + prefers-reduced-motion
- `src/checks.tsx` — Runtime checks for Dialog behavior + TCP+UDP rule creation + verification badges + AWS badge (all now implemented)
- `src/components/` — all UI components (see child AGENTS.md)
- `src/lib/` — API client + utilities (see child AGENTS.md)
- `index.html` — HTML entry point with favicon
- `tailwind.config.js` — Tailwind theme extensions + motion utilities
- `postcss.config.js` — PostCSS plugins (tailwindcss + autoprefixer)
- `vite.config.ts` — Vite config with `@` alias + dev proxy

## Local Contracts

### Build & Dev

- Dev server: `npm run dev` (port 5173, proxies `/api` to `http://127.0.0.1:8080`)
- Build: `npm run build` → `dist/`
- Type check: `npx tsc --noEmit`
- Runtime checks: `npx esbuild src/checks.tsx --bundle --platform=node --alias:@=./src --outfile=checks.cjs && node checks.cjs`

### Path Aliases

`@` maps to `src/` via Vite config. Always use `@/components/...`, `@/lib/...` in imports.

### Video Background

`App.tsx` renders a fullscreen `<video>` element:
- Source: `/night-sky.mp4` (served from `frontend/public/`, excluded from git via `*.mp4` in `.gitignore`)
- Attributes: `autoPlay loop muted playsInline preload="metadata"`
- Positioning: `fixed inset-0 -z-20 h-full w-full object-cover`
- Scrim: `fixed inset-0 -z-10 bg-black/50` for text legibility
- Both elements have `aria-hidden="true"`

### Design System (Anthropic-Inspired)

**All colors are defined as HSL custom properties in `index.css`.** Never hardcode hex values in components.

#### Color Tokens

| Token | HSL | Use |
|-------|-----|-----|
| `--background` | `30 12% 9%` | Page background (warm charcoal) |
| `--foreground` | `30 14% 88%` | Primary text (warm off-white) |
| `--card` | `30 10% 11%` | Card/surface background |
| `--primary` | `24 58% 50%` | Accent (terracotta/amber) |
| `--secondary` | `30 10% 14%` | Secondary surfaces |
| `--muted` | `30 10% 14%` | Muted backgrounds |
| `--muted-foreground` | `25 12% 48%` | Secondary text |
| `--accent` | `30 10% 16%` | Hover surfaces |
| `--destructive` | `0 50% 50%` | Error/delete (warm red) |
| `--border` | `25 12% 17%` | Borders (warm, subtle) |
| `--input` | `25 12% 17%` | Input borders |
| `--ring` | `24 58% 50%` | Focus rings (terracotta) |
| `--success` | `140 25% 42%` | Success status (muted green) |

#### Motion Tokens

| Token | Value | Use |
|-------|-------|-----|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Hover/focus/enter — fast start, gentle settle |
| `--ease-in-out` | `cubic-bezier(0.45, 0, 0.55, 1)` | Neutral state changes |
| `--duration-fast` | `100ms` | Micro: icon swaps, opacity |
| `--duration-normal` | `150ms` | Standard: hover colors, focus rings |
| `--duration-slow` | `200ms` | Emphasis: Switch, dialog entrance |

Tailwind utilities: `duration-fast`, `duration-normal`, `duration-slow`, `ease-anthropic-out`, `ease-anthropic-in-out`.

#### Typography

| Class | Font | Use |
|-------|------|-----|
| `font-display` | Source Serif 4, Georgia, serif | Headings (h1-h6) |
| `font-sans` (default) | system-ui stack | Body text |
| `font-mono` | JetBrains Mono, Fira Code, monospace | IPs, ports, code, version |

#### Spacing & Shape

- Border radius: `rounded-md` (8px) for inputs/buttons, `rounded-lg` (12px) for cards/dialogs
- Card padding: `p-3` to `p-4` (12-16px)
- Dialog padding: `p-6` (24px) header/footer, form body between
- Section spacing: `space-y-4` between major sections

#### Component Rules

- **Buttons**: Use `variant` prop (`default` = terracotta, `ghost` = transparent, `destructive` = red). Minimum `h-10` (40px). Transitions: `transition-colors duration-normal ease-anthropic-out`.
- **Cards**: Border-based, no box-shadow. Use `border border-border bg-card`. `hoverable` prop adds `hover:border-border/60 hover:bg-card/80`. Transitions: `transition-colors duration-normal ease-anthropic-out`.
- **Inputs**: `h-10`, `rounded-md`, warm border, terracotta focus ring with `ring-offset-2 ring-offset-background`. Transitions: `transition-colors duration-fast ease-anthropic-out`.
- **Switch**: `h-6 w-11`, terracotta when active. Track: `transition-colors duration-slow ease-anthropic-out`. Thumb: `transition-transform duration-slow ease-anthropic-out`.
- **Dialog**: `rounded-lg` (12px), `backdrop:bg-black/70 backdrop:backdrop-blur-sm`. Entrance animation: `open:animate-dialog-in` (200ms scale 0.97→1 + translateY 4px→0). Shadow on modal only.
- **Status badges**: `rounded-full`, low-opacity backgrounds (`bg-success/15`, `bg-destructive/15`).
- **Focus states**: All interactive elements must have `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.
- **Disabled states**: Use `disabled:opacity-40` (not `opacity-50`).

### Accessibility

- Body text contrast ≥ 4.5:1 (warm off-white on warm charcoal ≈ 10:1)
- Touch targets ≥ 40px (buttons are h-10/h-11)
- `prefers-reduced-motion`: All animations and transitions reduced to 0.01ms
- All form inputs have associated labels
- Dialog uses native `<dialog>` element with `showModal()`
- Video background has `aria-hidden="true"`

## Work Guidance

- **Adding a new component**: Place reusable primitives in `src/components/ui/`, page-level components in `src/components/`.
- **Adding a new API endpoint**: Add the method to `api.ts` (see `frontend/src/lib/AGENTS.md`), import and use in the relevant component.
- **Changing colors**: Update CSS custom properties in `index.css` only. Never change individual component colors directly.
- **Changing motion**: Update CSS custom properties (`--duration-*`, `--ease-*`) in `index.css`. Add new Tailwind utilities in `tailwind.config.js` if needed.
- **Adding fonts**: Import in `index.css` via Google Fonts, add to `fontFamily` in `tailwind.config.js`.
- **State management**: Use React `useState` + `useRef` for caching. No external state library. Optimistic updates with functional `setRules(prev => ...)`.
- **Verification polling**: After rule creation, `startPolling(ruleIds)` polls `api.rulesStatus()` every 2s. `stopPolling()` clears the interval when `verificationSettled()` returns true. Cleanup on unmount is critical.
- **TCP+UDP creation**: `createForProtocols('both', base, api.createRule)` creates TCP first, then UDP. Half-success returns partial `created` array + `error` string naming the failed protocol.
- **AWS credential flow**: `awsBadge(lsStatus)` derives header badge tone/actionable. Clicking the red badge opens a credential dialog that calls `api.saveCredentials()`.

## Verification

- Type check: `cd frontend && npx tsc --noEmit` (zero errors expected)
- Build: `cd frontend && npm run build`
- Dev: `cd frontend && npm run dev` (requires backend on port 8080)

## Child DOX Index

- `src/components/AGENTS.md` — UI component library + page components
- `src/lib/AGENTS.md` — API client + utility functions
