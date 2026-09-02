import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { toDatetimeLocalValue } from "../../lib/format";
import { parseLeadsPreview, type LeadsPreview } from "../../lib/parseLeads";
import { Button } from "../ui/Button";
import { IconClock, IconPaperclip, IconUpload } from "../ui/Icons";
import { Spinner } from "../ui/Spinner";

const MIN_DELAY_SEC = 2;
const DEFAULT_HOURLY = 50;

type Props = {
  open: boolean;
  onClose: () => void;
  onScheduled: (message: string) => void;
};

export function ComposeDialog({ open, onClose, onScheduled }: Props) {
  const sendersQuery = useQuery({
    queryKey: ["senders"],
    queryFn: async () => {
      const boot = await api.bootstrapSenders();
      return boot.senders;
    },
    enabled: open,
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [senderId, setSenderId] = useState("");
  const [startAt, setStartAt] = useState(() => toDatetimeLocalValue(new Date(Date.now() + 60_000)));
  const [delaySec, setDelaySec] = useState(MIN_DELAY_SEC);
  const [hourlyLimit, setHourlyLimit] = useState(DEFAULT_HOURLY);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<LeadsPreview | null>(null);
  const [paste, setPaste] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [laterOpen, setLaterOpen] = useState(false);

  const reset = () => {
    setSubject("");
    setBody("");
    setSenderId("");
    setStartAt(toDatetimeLocalValue(new Date(Date.now() + 60_000)));
    setDelaySec(MIN_DELAY_SEC);
    setHourlyLimit(DEFAULT_HOURLY);
    setFile(null);
    setPreview(null);
    setPaste("");
    setErrors({});
    setFormError(null);
    setLaterOpen(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0] ?? null;
    setFile(next);
    setFormError(null);
    if (!next) {
      setPreview(paste ? parseLeadsPreview(paste, "leads.txt") : null);
      return;
    }
    try {
      const text = await next.text();
      setPreview(parseLeadsPreview(text, next.name));
    } catch {
      setPreview(null);
      setFormError("Could not read that file.");
    }
  };

  const pastePreview = useMemo(() => (paste.trim() ? parseLeadsPreview(paste, "leads.txt") : null), [paste]);
  const detected = file ? preview : pastePreview;

  const create = useMutation({
    mutationFn: (form: FormData) => api.createCampaign(form),
    onSuccess: (data) => {
      const extra = [
        data.skippedInvalid ? `${data.skippedInvalid} invalid skipped` : null,
        data.skippedDuplicate ? `${data.skippedDuplicate} duplicates skipped` : null,
      ]
        .filter(Boolean)
        .join(", ");
      onScheduled(
        `Scheduled ${data.scheduledCount} email${data.scheduledCount === 1 ? "" : "s"}${extra ? ` (${extra})` : ""}.`,
      );
      close();
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Could not schedule this campaign.");
    },
  });

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!subject.trim()) next.subject = "Subject is required.";
    if (!body.trim()) next.body = "Body is required.";
    if (!startAt) next.startAt = "Start time is required.";
    if (!Number.isFinite(delaySec) || delaySec < MIN_DELAY_SEC) {
      next.delaySec = `Delay must be at least ${MIN_DELAY_SEC} seconds.`;
    }
    if (!Number.isInteger(hourlyLimit) || hourlyLimit < 1) {
      next.hourlyLimit = "Hourly limit must be at least 1.";
    }
    if (!file && !paste.trim()) next.leads = "Upload a list or paste email addresses.";
    else if (!detected || detected.emails.length === 0) next.leads = "No valid email addresses detected.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    const form = new FormData();
    form.append("subject", subject.trim());
    form.append("body", body.trim());
    form.append("startAt", new Date(startAt).toISOString());
    form.append("delayMs", String(Math.round(delaySec * 1000)));
    form.append("hourlyLimit", String(hourlyLimit));
    if (senderId) form.append("senderId", senderId);
    if (file) form.append("file", file);
    else form.append("leadsText", paste);
    create.mutate(form);
  };

  if (!open) return null;

  const pills = detected?.emails.slice(0, 3) ?? [];
  const extra = detected ? Math.max(0, detected.emails.length - 3) : 0;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-white">
      <form id="compose-form" className="mx-auto min-h-full max-w-5xl px-8 py-5" onSubmit={onSubmit}>
        <header className="mb-2 flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={close} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-zinc-100" aria-label="Back">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <h2 className="text-[17px] font-medium">Compose New Email</h2>
          </div>
          <div className="relative flex items-center gap-4">
            <button type="button" className="relative text-brand" title="Attach leads" onClick={() => fileRef.current?.click()}>
              <IconPaperclip />
              {detected && detected.emails.length > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
                  {detected.emails.length}
                </span>
              ) : null}
            </button>
            <button type="button" className="text-brand" title="Schedule" onClick={() => setLaterOpen((v) => !v)}>
              <IconClock />
            </button>
            {laterOpen ? (
              <Button type="submit" variant="outline" pill disabled={create.isPending}>
                {create.isPending ? <Spinner className="h-4 w-4" /> : null}
                Send
              </Button>
            ) : (
              <Button type="button" variant="outline" pill onClick={() => setLaterOpen(true)}>
                Send Later
              </Button>
            )}
            {laterOpen ? (
              <div className="absolute right-0 top-12 z-10 w-[320px] rounded-xl border border-line bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
                <h3 className="mb-3 text-sm font-semibold">Send Later</h3>
                <label className="relative block">
                  <span className="sr-only">Pick date and time</span>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="h-10 w-full rounded-lg border-0 bg-wash px-3 pr-9 text-sm outline-none placeholder:text-[#9a9a9a] focus:ring-2 focus:ring-brand/20"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9a9a9a]">
                    <CalendarIcon />
                  </span>
                </label>
                {errors.startAt ? <p className="mt-1 text-xs text-danger">{errors.startAt}</p> : null}
                <div className="mt-3 space-y-1">
                  {laterPresets().map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className="block w-full rounded-md px-1 py-1.5 text-left text-sm text-ink hover:bg-zinc-50"
                      onClick={() => setStartAt(preset.value)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex justify-end gap-4">
                  <button type="button" className="text-sm text-ink" onClick={() => setLaterOpen(false)}>
                    Cancel
                  </button>
                  <Button type="submit" variant="outline" pill size="sm" disabled={create.isPending}>
                    Done
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </header>

        <div className="grid grid-cols-[72px_1fr] items-center">
          <div className="py-3.5 text-sm text-muted">From</div>
          <div className="border-b border-line py-2.5">
            <div className="relative inline-flex">
              <select
                value={senderId}
                onChange={(e) => setSenderId(e.target.value)}
                className="h-8 appearance-none rounded-full bg-[#f5f5f5] py-0 pl-3 pr-8 text-sm outline-none"
                disabled={sendersQuery.isPending}
              >
                <option value="">Default sender</option>
                {(sendersQuery.data ?? []).map((sender) => (
                  <option key={sender.id} value={sender.id}>
                    {sender.fromEmail}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9a9a9a]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </div>
          </div>
          <div className="py-3.5 text-sm text-muted">To</div>
          <div className="flex items-center gap-2 border-b border-line py-2.5">
            <div className="flex min-h-8 min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {pills.length ? (
                pills.map((email) => (
                  <span key={email} className="rounded-full border border-brand/50 px-2.5 py-0.5 text-xs font-medium text-brand">
                    {email}
                  </span>
                ))
              ) : (
                <input
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder="recipient@example.com"
                  className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-[#b0b0b0]"
                />
              )}
              {extra > 0 ? (
                <span className="rounded-full border border-brand/50 px-2.5 py-0.5 text-xs font-medium text-brand">+{extra}</span>
              ) : null}
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand"
              onClick={() => fileRef.current?.click()}
            >
              <IconUpload /> Upload List
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={onFile} />
          </div>
          <div className="py-3.5 text-sm text-muted">Subject</div>
          <div className="border-b border-line py-2.5">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              maxLength={500}
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-[#b0b0b0]"
            />
          </div>
        </div>
        {errors.leads ? <p className="mt-2 text-xs text-danger">{errors.leads}</p> : null}
        {errors.subject ? <p className="mt-2 text-xs text-danger">{errors.subject}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-10 text-sm text-muted">
          <label className="inline-flex items-center gap-3">
            Delay between 2 emails
            <input
              type="number"
              min={MIN_DELAY_SEC}
              value={delaySec}
              onChange={(e) => setDelaySec(Number(e.target.value))}
              className="h-8 w-14 rounded-lg border-0 bg-[#f5f5f5] text-center text-sm outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>
          <label className="inline-flex items-center gap-3">
            Hourly Limit
            <input
              type="number"
              min={1}
              max={1000}
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(Number(e.target.value))}
              className="h-8 w-14 rounded-lg border-0 bg-[#f5f5f5] text-center text-sm outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>
        </div>
        {errors.delaySec ? <p className="mt-1 text-xs text-danger">{errors.delaySec}</p> : null}
        {errors.hourlyLimit ? <p className="mt-1 text-xs text-danger">{errors.hourlyLimit}</p> : null}

        <div className="mt-5 rounded-2xl bg-[#fafafa] px-5 pb-5 pt-4">
          <EditorToolbar />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type Your Reply..."
            className="mt-3 min-h-[260px] w-full resize-y border-0 bg-transparent text-sm outline-none placeholder:text-[#b0b0b0]"
          />
        </div>
        {errors.body ? <p className="mt-2 text-xs text-danger">{errors.body}</p> : null}
        {formError ? <p className="mt-3 text-sm text-danger">{formError}</p> : null}
        {detected ? (
          <p className="mt-3 text-sm text-muted">
            <span className="font-semibold text-brand">{detected.emails.length}</span> email
            {detected.emails.length === 1 ? "" : "s"} detected
            {detected.skippedInvalid ? ` · ${detected.skippedInvalid} invalid` : ""}
            {detected.skippedDuplicate ? ` · ${detected.skippedDuplicate} duplicate` : ""}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function laterPresets(): Array<{ label: string; value: string }> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const at = (hours: number, minutes = 0) => {
    const next = new Date(tomorrow);
    next.setHours(hours, minutes, 0, 0);
    return toDatetimeLocalValue(next);
  };
  return [
    { label: "Tomorrow", value: at(9) },
    { label: "Tomorrow, 10:00 AM", value: at(10) },
    { label: "Tomorrow, 11:00 AM", value: at(11) },
    { label: "Tomorrow, 3:00 PM", value: at(15) },
  ];
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function EditorToolbar() {
  return (
    <div
      aria-hidden
      className="pointer-events-none mx-auto flex h-10 w-max items-center gap-3 rounded-full bg-white px-4 text-muted shadow-[0_1px_8px_rgba(0,0,0,0.06)]"
    >
      <ToolGlyph d="M7 8v8M7 8h4.5a2.5 2.5 0 0 1 0 5H7" />
      <ToolGlyph d="M4 12h6M14 12h6M8 8l-4 4 4 4M16 8l4 4-4 4" />
      <span className="text-xs font-semibold">Tt</span>
      <span className="text-sm font-bold">B</span>
      <span className="text-sm italic">I</span>
      <span className="text-sm underline">U</span>
      <ToolGlyph d="M4 6h16M4 12h10M4 18h14" />
      <ToolGlyph d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
      <ToolGlyph d="M8 8h12M8 16h12M4 8v8" />
    </div>
  );
}

function ToolGlyph({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d={d} />
    </svg>
  );
}
