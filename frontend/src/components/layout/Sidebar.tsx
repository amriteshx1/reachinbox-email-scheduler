import { useState, type ReactNode } from "react";
import type { SessionUser } from "../../lib/types";
import { Button } from "../ui/Button";
import { IconChevron, IconLogout, IconQueues, IconSlack } from "../ui/Icons";
import { bullBoardUrl } from "../../lib/api";
import { Wordmark } from "../brand/Wordmark";

type Props = {
  user: SessionUser;
  tab: "scheduled" | "sent";
  scheduledCount: number;
  sentCount: number;
  onTab: (tab: "scheduled" | "sent") => void;
  onCompose: () => void;
  onLogout: () => void;
  slackConnected: boolean;
  onSlack: () => void;
  onDisconnectSlack: () => void;
};

export function Sidebar({
  user,
  tab,
  scheduledCount,
  sentCount,
  onTab,
  onCompose,
  onLogout,
  slackConnected,
  onSlack,
  onDisconnectSlack,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = (user.name || user.email)
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="flex w-65 shrink-0 flex-col border-r border-line bg-page px-4 py-5">
      <Wordmark className="px-1 text-[22px] leading-none text-ink" />

      <div className="relative mt-5">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-[14px] bg-wash px-2.5 py-2.5 text-left hover:bg-mint"
        >
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-xs font-bold text-page">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight">{user.name || "Account"}</div>
            <div className="truncate text-[11px] leading-tight text-muted">{user.email}</div>
          </div>
          <span className="text-muted">
            <IconChevron />
          </span>
        </button>
        {menuOpen ? (
          <div className="absolute z-20 mt-2 w-full rounded-xl border border-line bg-wash p-1 shadow-lg">
            {slackConnected ? (
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-mint" onClick={onDisconnectSlack}>
                <IconSlack /> Disconnect Slack
              </button>
            ) : (
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-mint" onClick={onSlack}>
                <IconSlack /> Connect Slack
              </button>
            )}
            <a className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-mint" href={bullBoardUrl()} target="_blank" rel="noreferrer">
              <IconQueues /> Queue dashboard
            </a>
            <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-mint" onClick={onLogout}>
              <IconLogout /> Logout
            </button>
          </div>
        ) : null}
      </div>

      <Button variant="outline" pill className="mt-4 h-10 w-full text-sm font-medium" onClick={onCompose}>
        Compose
      </Button>

      <p className="mt-7 mb-1.5 px-3 text-[11px] font-medium text-muted">Core</p>
      <nav className="space-y-0.5">
        <NavItem
          active={tab === "scheduled"}
          label="Scheduled"
          count={scheduledCount}
          onClick={() => onTab("scheduled")}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          }
        />
        <NavItem
          active={tab === "sent"}
          label="Sent"
          count={sentCount}
          onClick={() => onTab("sent")}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m3 11 19-8-8 19-2.5-8.5L3 11Z" />
            </svg>
          }
        />
      </nav>
    </aside>
  );
}

function NavItem({
  active,
  label,
  count,
  onClick,
  icon,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
        active ? "bg-mint font-medium text-brand" : "text-ink hover:bg-mint"
      }`}
    >
      <span className={active ? "text-brand" : "text-muted"}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      <span className={`text-xs ${active ? "text-brand" : "text-muted"}`}>{count}</span>
    </button>
  );
}
