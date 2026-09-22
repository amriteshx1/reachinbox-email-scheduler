import { useEffect, type ReactNode } from "react";

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`mt-6 w-full overflow-hidden rounded-2xl bg-wash shadow-2xl ${wide ? "max-w-4xl" : "max-w-2xl"}`}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink hover:bg-mint"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <h2 id="modal-title" className="text-base font-semibold">
              {title}
            </h2>
          </div>
          {footer}
        </header>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
