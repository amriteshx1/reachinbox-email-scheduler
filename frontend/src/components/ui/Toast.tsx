import { useEffect } from "react";

type ToastItem = {
  id: string;
  kind: "success" | "error" | "info";
  message: string;
};

const colors = {
  success: "bg-emerald-600",
  error: "bg-red-600",
  info: "bg-zinc-800",
};

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(toast.id), 4500);
    return () => window.clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <div className={`pointer-events-auto rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${colors[toast.kind]}`}>
      {toast.message}
    </div>
  );
}

export type { ToastItem };
