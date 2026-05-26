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
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `${res.status} ${res.statusText}`);
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
};

export type NetworkInfo = {
  self_hostname: string;
  self_public_ip: string | null;
  self_tailscale_ip: string | null;
  peers: Peer[];
};

export async function login(username: string, password: string) {
  const body = new URLSearchParams({ username, password });
  const res = await fetch("/api/login", { method: "POST", body });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Login failed");
  }
  const data = await res.json();
  setToken(data.access_token);
}

export const api = {
  listRules: () => request<Rule[]>("/api/rules"),
  createRule: (r: RuleInput) =>
    request<Rule>("/api/rules", { method: "POST", body: JSON.stringify(r) }),
  deleteRule: (id: number) =>
    request<void>(`/api/rules/${id}`, { method: "DELETE" }),
  toggleRule: (id: number) =>
    request<Rule>(`/api/rules/${id}/toggle`, { method: "PATCH" }),
  networkInfo: () => request<NetworkInfo>("/api/network-info"),
};
