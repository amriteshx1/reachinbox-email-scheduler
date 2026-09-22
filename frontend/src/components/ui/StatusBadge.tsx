import { formatBadgeTime } from "../../lib/format";
import type { EmailStatus } from "../../lib/types";

const styles: Record<EmailStatus, string> = {
  scheduled: "bg-badge text-progress",
  sending: "bg-badge text-progress",
  sent: "bg-wash text-[#c5cdc8]",
  failed: "bg-red-50 text-danger",
};

const labels: Record<EmailStatus, string> = {
  scheduled: "Scheduled",
  sending: "In Progress",
  sent: "Sent",
  failed: "Failed",
};

export function StatusBadge({
  status,
  time,
}: {
  status: EmailStatus;
  time?: string | null;
}) {
  if ((status === "scheduled" || status === "sending") && time) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-badge px-2.5 py-0.75 text-[11px] font-medium text-progress">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        {formatBadgeTime(time)}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.75 text-[11px] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
