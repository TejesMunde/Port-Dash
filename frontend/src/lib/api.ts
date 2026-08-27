const TOKEN_KEY = "pf_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  // Only set JSON content-type for non-FormData bodies
  if (!(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await res.json().catch(() => null);
      if (body?.detail) detail = body.detail;
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type Rule = {
  id: number;
  label: string;
  public_port: number;
  protocol: "tcp" | "udp";
  dest_ip: string;
  dest_hostname: string;
  dest_port: number;
  enabled: boolean;
  created_at: string;
};

export type RuleInput = {
  label: string;
  public_port: number;
  protocol: "tcp" | "udp";
  dest_hostname: string;
  dest_port: number;
  enabled: boolean;
};

export type Peer = {
  hostname: string;
  ip: string;
  os: string;
  online: boolean;
  tags: string[];
};

export type NetworkInfo = {
  self_hostname: string;
  self_public_ip: string | null;
  self_tailscale_ip: string | null;
  peers: Peer[];
  tag_filter: string;
};

export async function login(username: string, password: string) {
  const body = new URLSearchParams({ username, password });
  const res = await fetch("/api/login", { method: "POST", body });
  if (!res.ok) {
    let detail = "Login failed";
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => null);
      if (data?.detail) detail = data.detail;
    }
    throw new Error(detail);
  }
  const data = await res.json();
  if (!data?.access_token) {
    throw new Error("Login failed: server did not return a token");
  }
  setToken(data.access_token);
}

export type UpdateInfo = {
  current: string;
  latest: string;
  update_available: boolean;
};

export type LightsailStatus = {
  configured: boolean;
  reason: string;
  needs_credentials: boolean;
  instance: string;
  region: string;
};

export type AwsCredentials = {
  access_key_id: string;
  secret_access_key: string;
  instance: string;
  region: string;
};

export type RuleStatus = {
  id: number;
  firewall: "open" | "closed" | "unconfigured";
  firewall_detail: string;
  backend: "reachable" | "refused" | "timeout" | "unknown";
  backend_detail: string;
  connectable: boolean;
};

export const api = {
  listRules: () => request<Rule[]>("/api/rules"),
  createRule: (r: RuleInput) =>
    request<Rule>("/api/rules", { method: "POST", body: JSON.stringify(r) }),
  deleteRule: (id: number) =>
    request<void>(`/api/rules/${id}`, { method: "DELETE" }),
  toggleRule: (id: number) =>
    request<Rule>(`/api/rules/${id}/toggle`, { method: "PATCH" }),
  networkInfo: () => request<NetworkInfo>("/api/network-info"),
  checkUpdate: () => request<UpdateInfo>("/api/check-update"),
  triggerUpdate: () => request<{ ok: boolean; message: string }>("/api/update", { method: "POST" }),
  lightsailStatus: () => request<LightsailStatus>("/api/lightsail-status"),
  rulesStatus: () => request<RuleStatus[]>("/api/rules/status"),
  openFirewall: (id: number) =>
    request<RuleStatus>(`/api/rules/${id}/open-firewall`, { method: "POST" }),
  saveCredentials: (creds: { instance: string; region: string; access_key_id: string; secret_access_key: string }) =>
    request<LightsailStatus>('/api/aws-config', { method: 'POST', body: JSON.stringify(creds) }),
};
