import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-28 text-center">
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="px-8 py-10 text-center">
      <p className="text-sm font-medium text-danger">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-3 text-sm font-medium text-ink underline underline-offset-2">
          Try again
        </button>
      ) : null}
    </div>
  );
}
