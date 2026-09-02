import type { ApiErrorBody, CampaignCreated, EmailListFilter, EmailListResponse, Sender, SessionUser, SlackStatus } from "./types";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function googleLoginUrl(): string {
  return `${API_URL}/auth/google`;
}

export function slackConnectUrl(): string {
  return `${API_URL}/auth/slack`;
}

export function bullBoardUrl(): string {
  return `${API_URL}/admin/queues`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const isForm = init.body instanceof FormData;
  if (!isForm && init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Backend unavailable. Start the API on port 3001.");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const data = (await res.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data.error?.code ?? "ERROR",
      data.error?.message ?? res.statusText,
      data.error?.details,
    );
  }
  return data;
}

export const api = {
  me: () => request<{ user: SessionUser }>("/auth/me"),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  health: () => request<{ status: string }>("/health"),

  listEmails: (params: { status?: EmailListFilter; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    qs.set("page", String(params.page ?? 1));
    qs.set("limit", String(params.limit ?? 50));
    return request<EmailListResponse>(`/api/emails?${qs}`);
  },

  searchEmails: (params: { q: string; status?: EmailListFilter; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    qs.set("q", params.q);
    if (params.status) qs.set("status", params.status);
    qs.set("page", String(params.page ?? 1));
    qs.set("limit", String(params.limit ?? 50));
    return request<EmailListResponse>(`/api/emails/search?${qs}`);
  },

  listSenders: () => request<{ senders: Sender[] }>("/api/senders"),
  bootstrapSenders: () => request<{ senders: Sender[] }>("/api/senders/bootstrap", { method: "POST" }),

  createCampaign: (form: FormData) =>
    request<CampaignCreated>("/api/campaigns", { method: "POST", body: form }),

  slackStatus: () => request<SlackStatus>("/api/slack/status"),
  disconnectSlack: () => request<void>("/api/slack", { method: "DELETE" }),
};
