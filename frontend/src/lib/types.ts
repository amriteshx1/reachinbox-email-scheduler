export type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

export type Sender = {
  id: string;
  label: string;
  fromName: string;
  fromEmail: string;
  isDefault: boolean;
};

export type EmailStatus = "scheduled" | "sending" | "sent" | "failed";

export type EmailListFilter = "scheduled" | "sent" | "failed" | "sending";

export type EmailItem = {
  id: string;
  toEmail: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  failedAt: string | null;
  previewUrl: string | null;
  failureReason: string | null;
  campaignId?: string;
  senderId?: string;
};

export type EmailListResponse = {
  items: EmailItem[];
  total: number;
  page: number;
  limit: number;
  source?: "elasticsearch" | "postgres";
};

export type SlackStatus = {
  connected: boolean;
  teamName?: string | null;
  channel?: string | null;
  configured: boolean;
};

export type CampaignCreated = {
  campaignId: string;
  senderId: string;
  scheduledCount: number;
  delayMs: number;
  hourlyLimit: number;
  emails: Array<{ id: string; toEmail: string; scheduledAt: string }>;
  skippedInvalid: number;
  skippedDuplicate: number;
};

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};
