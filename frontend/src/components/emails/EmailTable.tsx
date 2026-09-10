import type { EmailItem } from "../../lib/types";
import { IconStar } from "../ui/Icons";
import { StatusBadge } from "../ui/StatusBadge";

type Mode = "scheduled" | "sent";

export function EmailTable({ items, mode }: { items: EmailItem[]; mode: Mode }) {
  return (
    <div className="divide-y divide-line">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-5 px-8 py-4.5 hover:bg-zinc-50/80">
          <div className="w-[22%] max-w-60 min-w-33 shrink-0 truncate text-sm font-semibold">To: {item.toEmail}</div>
          <div className="w-37 shrink-0">
            <StatusBadge status={item.status} time={mode === "scheduled" ? item.scheduledAt : undefined} />
          </div>
          <div className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold text-ink">{item.subject}</span>
            {item.failureReason ? <span className="text-danger"> — {item.failureReason}</span> : null}
            {item.previewUrl ? (
              <>
                {" "}
                <a href={item.previewUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand hover:underline">
                  Preview
                </a>
              </>
            ) : null}
          </div>
          <span className="shrink-0 text-[#d4d4d4]">
            <IconStar />
          </span>
        </div>
      ))}
    </div>
  );
}
