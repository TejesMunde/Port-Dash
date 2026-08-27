# Components — AGENTS.md

## Purpose

Reusable UI primitives (`ui/`) and page-level components. Primitives are generic, theme-aware building blocks with Anthropic-inspired motion. Page components compose them with app-specific logic.

## Ownership

### UI Primitives (`ui/`)

| File | Component | Props | Notes |
|------|-----------|-------|-------|
| `button.tsx` | `Button` | `variant`, `size`, `disabled`, `className`, children | 5 variants, 4 sizes. `default` = terracotta primary. `transition-colors duration-normal ease-anthropic-out`. |
| `card.tsx` | `Card` | `className`, `hoverable`, children | Border-based, no shadow. `hoverable` adds `hover:border-border/60 hover:bg-card/80`. |
| `input.tsx` | `Input` | `className`, all native `<input>` props | h-10, warm border, terracotta focus ring. `transition-colors duration-fast ease-anthropic-out`. |
| `switch.tsx` | `Switch` | `checked`, `onCheckedChange`, `className` | h-6/w-11, terracotta active. Track: `transition-colors duration-slow`. Thumb: `transition-transform duration-slow`. |
| `dialog.tsx` | `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle` | `open`, `onOpenChange`, children | Native `<dialog>` with `showModal()`. `open:animate-dialog-in` entrance (200ms scale+fade). Children only rendered when open. Imports `cn` from `lib/utils.ts`. |

### Page Components

| File | Component | Props | Notes |
|------|-----------|-------|-------|
| `LoginScreen.tsx` | `LoginScreen` | `onSuccess: () => void` | Username/password form. Calls `login()` from api.ts. Labels above inputs. |
| `Dashboard.tsx` | `Dashboard` | `onLogout: () => void` | Main app: rule list, network info, add/delete/toggle rules, update check, verification badges, TCP+UDP protocol, AWS credential setup. |

## Local Contracts

### Primitive Design Rules

- All primitives accept `className` for composition. Use `cn()` from `lib/utils.ts` to merge classes.
- Use `font-display` for headings, `font-mono` for technical values (IPs, ports, versions).
- Focus states: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`.
- Disabled states: `disabled:opacity-40` (not `opacity-50`).
- Transitions use tokenized durations: `duration-fast` (100ms), `duration-normal` (150ms), `duration-slow` (200ms).
- Easing: `ease-anthropic-out` for all interactive transitions.
- Never hardcode hex colors — use Tailwind classes that reference CSS custom properties.

### Button Variants

| Variant | Style |
|---------|-------|
| `default` | `bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80` (terracotta) |
| `destructive` | `bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80` |
| `outline` | `border border-border bg-transparent hover:bg-secondary active:bg-secondary/80` |
| `ghost` | `hover:bg-secondary active:bg-secondary/80` |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70` |

### Button Sizes

| Size | Dimensions |
|------|------------|
| `default` | `h-10 px-5 text-sm` |
| `sm` | `h-9 px-3.5 text-xs` |
| `lg` | `h-11 px-7 text-sm` |
| `icon` | `h-10 w-10` |

### Card Hoverable

The `hoverable` prop adds `hover:border-border/60 hover:bg-card/80` — a subtle border brightening on hover. Use for interactive list items (e.g., rule rows). Static cards should not use `hoverable`.

### Dialog Behavior

- Uses native `<dialog>` element with `showModal()`.
- Children are only rendered when `open` is true (avoids mounting form state prematurely).
- Backdrop: `bg-black/70 backdrop-blur-sm`.
- Entrance animation: `open:animate-dialog-in` — 200ms `scale(0.97)→1` + `translateY(4px)→0`, using `--ease-out`.
- Modal shadow: `box-shadow: 0 16px 48px rgba(0,0,0,40%)` (only on the dialog, not backdrop).
- Title uses `font-display` (Source Serif 4).
- Imports `cn` from `../../lib/utils` — do not define a local `cn`.

### Switch Transitions

- Track (background): `transition-colors duration-slow ease-anthropic-out` — 200ms color fade.
- Thumb (circle): `transition-transform duration-slow ease-anthropic-out` — 200ms slide with ease-out.
- Both use the slowest tier for a deliberate, satisfying toggle feel.

### Dashboard State Management

- `rules`: Array of `Rule[]`, updated optimistically before API confirmation.
- `netInfo`: Network info + peers, fetched once on mount.
- `cachedRules`: `useRef<Rule[]>` — preserves rules across error states to avoid flash-of-empty.
- `confirmDeleteId`: Two-click delete pattern with 3s timeout auto-dismiss.
- `ruleErrors`: Per-rule error messages keyed by rule ID.
- `ruleStatuses`: Array of `RuleStatus[]` — live verification state per rule, polled every 2s after creation.
- `verifyingIds`: `Set<number>` — rules currently being verified (shows "Verifying…" badge).
- `credOpen`: Controls the AWS credential setup dialog.
- `pollRef`: `useRef<ReturnType<typeof setInterval>>` — verification poll timer, cleaned up on unmount.

### Optimistic Update Pattern

```tsx
// Always use functional updates to avoid stale closures
setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
try {
  const updated = await api.toggleRule(id);
  setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
} catch (e) {
  // Rollback with functional update
  setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: original } : r)));
}
```

### Verification Badges

Each `RuleRow` receives `status: RuleStatus | undefined` and `verifying: boolean`. The `badgeFor()` function derives a badge with `{ text, tone, actionable, title }`:
- Priority: verifying > disabled > firewall > backend > connectable
- "Blocked in AWS" is actionable (clickable → calls `onOpenFirewall`)
- Badge styling uses `toneClasses` map: `good` → green, `bad` → red, `warn`/`idle` → muted

### TCP+UDP Protocol

`AddRuleDialog` uses `createForProtocols(protocol, base, api.createRule)`:
- `"tcp"` or `"udp"` → single rule
- `"both"` → TCP first, then UDP sequentially
- Half-success: keeps the rule that landed, reports the failed protocol in error
- `onCreated(created, allSucceeded)` — adds created rules to state, starts verification polling

### AWS Credential Flow

1. Header badge: `awsBadge(lsStatus)` → green (configured), red+clickable (needs_credentials), muted (unknown)
2. Clicking red badge opens credential dialog with instance, region, access key, secret key
3. Submit calls `api.saveCredentials()` → backend writes to `.env` file
4. On success: closes dialog, reloads Lightsail status

### Cleanup on Unmount

- All `setTimeout` / `setInterval` refs must be cleaned up in `useEffect` return functions.
- Pattern: store timeout ID in `useRef`, clear in cleanup.
- Verification polling interval must be cleared on unmount to prevent memory leaks.

## Work Guidance

- **Adding a new UI primitive**: Create in `ui/`, accept `className`, use `cn()` for merging, follow existing focus/transition patterns with tokenized durations.
- **Adding a new page component**: Create in `components/`, compose from `ui/` primitives, keep API calls in `lib/api.ts`.
- **Modifying dialog content**: Update `DialogContent` wrapper, not the `Dialog` itself. The dialog handles open/close state and entrance animation.
- **Adding form fields**: Follow the existing pattern — `<label>` + `<Input>` with `mb-1.5` gap, wrapped in a `<div>`.
- **Adding hover states to cards**: Use the `hoverable` prop on `Card` rather than adding custom hover classes.

## Verification

- Visual: `npm run dev` and check each component renders correctly.
- Accessibility: Tab through all interactive elements, verify focus rings visible.
- Responsive: Check `md:` breakpoints for NetworkInfoCard grid.
- Motion: Verify dialog entrance animation, Switch toggle, Button hover transitions.

## Child DOX Index

- No child AGENTS.md needed — all components are flat in this directory.
