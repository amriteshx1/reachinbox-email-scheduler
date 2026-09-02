export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.4-2.3 4.4-4.1 5.8l6.3 5.3C39.8 36.3 44 30.7 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

export function OneboxMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center rounded-lg bg-brand text-white ${className}`}>
      <span className="text-lg font-bold leading-none">M</span>
    </div>
  );
}

export function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  );
}

export function IconMail() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 7 9-7" />
    </svg>
  );
}

export function IconSend() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m3 11 19-8-8 19-2.5-8.5L3 11Z" />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconSlack() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5.04 15.17A2.04 2.04 0 1 1 3 13.13h2.04v2.04Zm1.02 0A2.04 2.04 0 1 1 10.1 17.2v-2.03H6.06ZM8.87 5.04A2.04 2.04 0 1 1 10.9 3v2.04H8.87Zm0 1.02A2.04 2.04 0 1 1 6.83 10.1h2.04V6.06ZM18.96 8.83A2.04 2.04 0 1 1 21 10.87h-2.04V8.83Zm-1.02 0A2.04 2.04 0 1 1 13.9 6.8v2.03h4.04ZM15.13 18.96A2.04 2.04 0 1 1 13.1 21v-2.04h2.03Zm0-1.02A2.04 2.04 0 1 1 17.17 13.9h-2.04v4.04ZM5.04 8.83H3A2.04 2.04 0 1 1 5.04 6.8v2.03Zm6.09 0H8.87V6.8A2.04 2.04 0 0 1 13.1 8.83h-1.97ZM15.13 15.17h2.04v2.03A2.04 2.04 0 0 1 15.13 15.17Zm0-6.09h2.04A2.04 2.04 0 0 1 15.13 5.04v4.04Z" />
    </svg>
  );
}

export function IconQueues() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

export function IconLogout() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export function IconPaperclip() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l8.5-8.5a4 4 0 0 1 5.7 5.7L10.1 17.3a2 2 0 1 1-2.8-2.8l8.2-8.2" />
    </svg>
  );
}

export function IconClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconFilter() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5h16l-6 8v5l-4 2v-7L4 5Z" />
    </svg>
  );
}

export function IconRefresh() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 4v6h-6" />
    </svg>
  );
}

export function IconStar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18.2 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3Z" />
    </svg>
  );
}

export function IconChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconUpload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 16V6M8 10l4-4 4 4" />
      <path d="M5 18h14" />
    </svg>
  );
}

export function IconPlane() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m3 11 19-8-8 19-2.5-8.5L3 11Z" />
    </svg>
  );
}
