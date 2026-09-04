import { useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { toDatetimeLocalValue } from "../../lib/format";
import { parseLeadsPreview, type LeadsPreview } from "../../lib/parseLeads";
import { Button } from "../ui/Button";
import { IconClock, IconPaperclip, IconUpload } from "../ui/Icons";
import { Spinner } from "../ui/Spinner";
import { useToast } from "../ui/ToastProvider";

const MIN_DELAY_SEC = 2;
const DEFAULT_HOURLY = 50;

type Props = {
  open: boolean;
  onClose: () => void;
  onScheduled: (message: string) => void;
};

export function ComposeDialog({ open, onClose, onScheduled }: Props) {
  const { toast } = useToast();
  const sendersQuery = useQuery({
    queryKey: ["senders"],
    queryFn: async () => {
      const boot = await api.bootstrapSenders();
      return boot.senders;
    },
    enabled: open,
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [senderId, setSenderId] = useState("");
  const [startAt, setStartAt] = useState(() => toDatetimeLocalValue(new Date(Date.now() + 60_000)));
  const [delaySec, setDelaySec] = useState(MIN_DELAY_SEC);
  const [hourlyLimit, setHourlyLimit] = useState(DEFAULT_HOURLY);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<LeadsPreview | null>(null);
  const [paste, setPaste] = useState("");
  const [draft, setDraft] = useState("");
  const [laterOpen, setLaterOpen] = useState(false);
  const [importSkipped, setImportSkipped] = useState({ invalid: 0, duplicate: 0 });

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
    setDraft("");
    setLaterOpen(false);
    setImportSkipped({ invalid: 0, duplicate: 0 });
  };

  const close = () => {
    reset();
    onClose();
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0] ?? null;
    if (!next) return;
    try {
      const text = await next.text();
      const parsed = parseLeadsPreview(text, next.name);
      const priorFileEmails = file && preview ? preview.emails.join("\n") : "";
      const priorSkips =
        file && preview
          ? { invalid: preview.skippedInvalid, duplicate: preview.skippedDuplicate }
          : null;
      const pendingDraft = draft.trim();

      if (priorSkips) {
        setImportSkipped((prev) => ({
          invalid: prev.invalid + priorSkips.invalid,
          duplicate: prev.duplicate + priorSkips.duplicate,
        }));
      }
      if (priorFileEmails || pendingDraft) {
        setPaste((prev) => [prev.trim(), priorFileEmails, pendingDraft].filter(Boolean).join("\n"));
      }
      if (pendingDraft) setDraft("");
      setFile(next);
      setPreview(parsed);
    } catch {
      setPreview(null);
      toast("error", "Could not read that file.");
    }
  };

  const committedPreview = useMemo(
    () => (paste.trim() ? parseLeadsPreview(paste, "leads.txt") : null),
    [paste],
  );
  const badgeEmails = useMemo(() => {
    if (file && preview) {
      const merged = [paste, preview.emails.join("\n")].filter((part) => part.trim()).join("\n");
      return merged.trim() ? parseLeadsPreview(merged, "leads.txt").emails : preview.emails;
    }
    return committedPreview?.emails ?? [];
  }, [committedPreview, file, paste, preview]);
  const detected = useMemo(() => {
    const empty = { emails: [] as string[], skippedInvalid: 0, skippedDuplicate: 0 };
    const pasteParsed = paste.trim() ? parseLeadsPreview(paste, "leads.txt") : empty;
    const draftParsed = draft.trim() ? parseLeadsPreview(draft, "leads.txt") : empty;
    const fileEmails = file && preview ? preview.emails : [];
    const fileInvalid = file && preview ? preview.skippedInvalid : 0;
    const fileDuplicate = file && preview ? preview.skippedDuplicate : 0;

    const seen = new Set<string>();
    const emails: string[] = [];
    let overlap = 0;
    for (const email of [...pasteParsed.emails, ...fileEmails]) {
      if (seen.has(email)) {
        overlap += 1;
        continue;
      }
      seen.add(email);
      emails.push(email);
    }
    for (const email of draftParsed.emails) {
      if (seen.has(email)) continue;
      seen.add(email);
      emails.push(email);
    }

    const skippedInvalid = importSkipped.invalid + fileInvalid + pasteParsed.skippedInvalid;
    const skippedDuplicate =
      importSkipped.duplicate + fileDuplicate + pasteParsed.skippedDuplicate + overlap;

    if (!emails.length && skippedInvalid === 0 && skippedDuplicate === 0) return null;
    return { emails, skippedInvalid, skippedDuplicate };
  }, [draft, file, importSkipped, paste, preview]);

  const clearFileUpload = () => {
    setImportSkipped((prev) => ({
      invalid: prev.invalid + (preview?.skippedInvalid ?? 0),
      duplicate: prev.duplicate + (preview?.skippedDuplicate ?? 0),
    }));
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const appendCommitted = (tokens: string[]) => {
    const cleaned = tokens.map((token) => token.trim()).filter(Boolean);
    if (!cleaned.length) return;
    const fromFile = file && preview ? preview.emails.join("\n") : "";
    setPaste((prev) => {
      const base = [prev.trim(), fromFile].filter(Boolean).join("\n");
      return base ? `${base}\n${cleaned.join("\n")}` : cleaned.join("\n");
    });
    if (file) clearFileUpload();
  };

  const commitDraftValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setDraft("");
      return;
    }
    appendCommitted([trimmed]);
    setDraft("");
  };

  const onToChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!/[,;\n]/.test(value)) {
      setDraft(value);
      return;
    }
    const parts = value.split(/[,;\n]+/);
    const rest = parts.pop() ?? "";
    appendCommitted(parts);
    setDraft(rest);
  };

  const onToKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitDraftValue(draft);
      return;
    }
    if (e.key !== "Backspace" || draft !== "") return;
    const last = badgeEmails[badgeEmails.length - 1];
    if (!last) return;
    e.preventDefault();
    const rest = badgeEmails.slice(0, -1);
    if (file) clearFileUpload();
    setPaste(rest.join("\n"));
  };

  const editChip = (email: string) => {
    if (draft.trim() && draft.trim().toLowerCase() !== email) {
      appendCommitted([draft.trim()]);
    }
    const rest = badgeEmails.filter((item) => item !== email);
    if (file) clearFileUpload();
    setPaste(rest.join("\n"));
    setDraft(email);
    queueMicrotask(() => toInputRef.current?.focus());
  };

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
      toast("error", err instanceof ApiError ? err.message : "Could not schedule this campaign.");
    },
  });

  const validate = (): boolean => {
    if (!file && !paste.trim() && !draft.trim()) {
      toast("error", "Add at least one recipient.");
      return false;
    }
    if (!detected || detected.emails.length === 0) {
      toast("error", "No valid email addresses detected.");
      return false;
    }
    if (!subject.trim()) {
      toast("error", "Subject is required.");
      return false;
    }
    if (!body.trim()) {
      toast("error", "Body is required.");
      return false;
    }
    if (!startAt) {
      toast("error", "Start time is required.");
      return false;
    }
    if (!Number.isFinite(delaySec) || delaySec < MIN_DELAY_SEC) {
      toast("error", `Delay must be at least ${MIN_DELAY_SEC} seconds.`);
      return false;
    }
    if (!Number.isInteger(hourlyLimit) || hourlyLimit < 1) {
      toast("error", "Hourly limit must be at least 1.");
      return false;
    }
    return true;
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const form = new FormData();
    form.append("subject", subject.trim());
    form.append("body", body.trim());
    form.append("startAt", new Date(startAt).toISOString());
    form.append("delayMs", String(Math.round(delaySec * 1000)));
    form.append("hourlyLimit", String(hourlyLimit));
    if (senderId) form.append("senderId", senderId);
    const typedLeads = [paste, draft].filter((part) => part.trim()).join("\n");
    if (file && !typedLeads) {
      form.append("file", file);
    } else {
      const fromFile = file && preview ? preview.emails.join("\n") : "";
      form.append("leadsText", [typedLeads, fromFile].filter((part) => part.trim()).join("\n"));
    }
    create.mutate(form);
  };

  if (!open) return null;

  const compact = Boolean(file && preview && preview.emails.length > 3);
  const pillEmails = compact ? badgeEmails.slice(0, 3) : badgeEmails;
  const extra = compact ? Math.max(0, badgeEmails.length - pillEmails.length) : 0;

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
            <Button type="submit" variant="outline" pill disabled={create.isPending}>
              {create.isPending ? <Spinner className="h-4 w-4" /> : null}
              Send
            </Button>
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
                  <Button type="button" variant="outline" pill size="sm" onClick={() => setLaterOpen(false)}>
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
              {pillEmails.map((email) => (
                <button
                  key={email}
                  type="button"
                  title="Click to edit"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editChip(email)}
                  className="rounded-full border border-brand/50 px-2.5 py-0.5 text-xs font-medium text-brand hover:bg-mint"
                >
                  {email}
                </button>
              ))}
              {extra > 0 ? (
                <span className="rounded-full border border-brand/50 px-2.5 py-0.5 text-xs font-medium text-brand">+{extra}</span>
              ) : null}
              <input
                ref={toInputRef}
                value={draft}
                onChange={onToChange}
                onKeyDown={onToKeyDown}
                placeholder={badgeEmails.length ? "Add another email" : "recipient@example.com"}
                className="h-8 min-w-48 flex-1 bg-transparent text-sm outline-none placeholder:text-[#b0b0b0]"
              />
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

        <div className="mt-5 rounded-2xl bg-[#fafafa] px-5 pb-5 pt-4">
          <EditorToolbar />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type Your Reply..."
            className="mt-3 min-h-65 w-full resize-y border-0 bg-transparent text-sm outline-none placeholder:text-[#b0b0b0]"
          />
        </div>
        <p className="mt-3 text-sm text-muted">
          {detected ? (
            <>
              <span className="font-semibold text-brand">{detected.emails.length}</span>
              {` email${detected.emails.length === 1 ? "" : "s"} detected · ${detected.skippedInvalid} invalid · ${detected.skippedDuplicate} duplicate · `}
            </>
          ) : null}
          Press Enter or comma for each email address in order to add that.
        </p>
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
