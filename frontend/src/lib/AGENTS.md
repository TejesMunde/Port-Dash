# Lib — AGENTS.md

## Purpose

Shared utilities and the typed API client. `api.ts` is the single source of truth for all backend communication. `utils.ts` provides the `cn()` class-merging helper.

## Ownership

| File | Purpose |
|------|---------|
| `api.ts` | Auth token management, typed fetch wrapper, all API method signatures, TypeScript types |
| `utils.ts` | `cn()` — conditional class name joiner |

## Local Contracts

### Auth Token Management

| Function | Signature | Behavior |
|----------|-----------|----------|
| `getToken()` | `() => string \| null` | Read token from `localStorage` key `pf_token` |
| `setToken(t)` | `(t: string) => void` | Write token to `localStorage` |
| `clearToken()` | `() => void` | Remove token from `localStorage` |

- Token is a JWT issued by `POST /api/login`.
- Stored in `localStorage` (not httpOnly cookie — acceptable for this single-user admin tool).
- On 401 response, token is cleared and page is reloaded.

### Request Wrapper

```typescript
async function request<T>(path: string, opts?: RequestInit): Promise<T>
```

- Adds `Authorization: Bearer <token>` header when token exists.
- Sets `Content-Type: application/json` for non-FormData bodies.
- On 401: clears token, reloads page, throws "Unauthorized".
- On non-OK: parses JSON error body if `Content-Type` is `application/json`, falls back to status text.
- On 204: returns `undefined as T` (no body).
- Otherwise: returns parsed JSON.

### API Methods

| Method | Signature | Backend Route |
|--------|-----------|---------------|
| `login(username, password)` | `(string, string) => Promise<void>` | `POST /api/login` |
| `api.listRules()` | `() => Promise<Rule[]>` | `GET /api/rules` |
| `api.createRule(r)` | `(r: RuleInput) => Promise<Rule>` | `POST /api/rules` |
| `api.deleteRule(id)` | `(id: number) => Promise<void>` | `DELETE /api/rules/{id}` |
| `api.toggleRule(id)` | `(id: number) => Promise<Rule>` | `PATCH /api/rules/{id}/toggle` |
| `api.networkInfo()` | `() => Promise<NetworkInfo>` | `GET /api/network-info` |
| `api.checkUpdate()` | `() => Promise<UpdateInfo>` | `GET /api/check-update` |
| `api.triggerUpdate()` | `() => Promise<{ok, message}>` | `POST /api/update` |
| `api.lightsailStatus()` | `() => Promise<LightsailStatus>` | `GET /api/lightsail-status` |
| `api.rulesStatus()` | `() => Promise<RuleStatus[]>` | `GET /api/rules/status` |
| `api.openFirewall(id)` | `(id: number) => Promise<RuleStatus>` | `POST /api/rules/{id}/open-firewall` |
| `api.saveCredentials(creds)` | `(creds) => Promise<{ok}>` | `POST /api/lightsail-credentials` |

### Type Definitions

All types are exported from `api.ts` and mirror the backend Pydantic models:

```typescript
type Rule = {
  id: number; label: string; public_port: number; protocol: "tcp" | "udp";
  dest_ip: string; dest_hostname: string; dest_port: number;
  enabled: boolean; created_at: string;
};

type RuleInput = {
  label: string; public_port: number; protocol: "tcp" | "udp";
  dest_hostname: string; dest_port: number; enabled: boolean;
};

type RuleStatus = {
  id: number;
  firewall: string;         // "open" | "closed" | "unconfigured"
  firewall_detail: string;
  backend: string;          // "reachable" | "refused" | "timeout" | "unknown"
  backend_detail: string;
  connectable: boolean;
};

type Peer = { hostname: string; ip: string; os: string; online: boolean; tags: string[] };

type NetworkInfo = {
  self_hostname: string; self_public_ip: string | null;
  self_tailscale_ip: string | null; peers: Peer[]; tag_filter: string;
};

type UpdateInfo = { current: string; latest: string; update_available: boolean };

type LightsailStatus = {
  configured: boolean;
  reason: string;
  needs_credentials: boolean;
  instance: string;
  region: string;
};
```

### Utility: `cn()`

```typescript
cn(...classes: (string | undefined | false | null)[]): string
```

Filters falsy values and joins with space. Used by all `ui/` components for className composition.

## Work Guidance

- **Adding a new API endpoint**: Add a method to the `api` object, add the response type above it, update this doc.
- **Adding a new type**: Export it from `api.ts` alongside existing types. Keep types close to the API methods that use them.
- **Changing auth flow**: Update `login()`, `request()`, and token management functions together. The 401 handler in `request()` is the canonical place for auth failure logic.
- **Error handling pattern**: Always check `Content-Type` before calling `.json()` on error responses — the server may return HTML for 502/503.

## Verification

- Type check: `cd frontend && npx tsc --noEmit`
- The `api` object is typed — TypeScript will catch mismatched signatures at compile time.

## Child DOX Index

- No child AGENTS.md needed — `lib/` has only two focused files.
