import { Link } from "react-router-dom";
import { Database, Search, Server, Timer } from "lucide-react";
import { Wordmark } from "../components/brand/Wordmark";
import { ConstraintTimeline, CoordinationMap, ExecutionPlane, RestartMap } from "./systemVisuals";
import "./public.css";

const steps = [
  {
    n: "01",
    title: "Persist",
    body: "Campaign and email state are written in PostgreSQL before any send is attempted. The row is the record of what should happen.",
  },
  {
    n: "02",
    title: "Schedule",
    body: "Each email gets its own scheduledAt. A delayed BullMQ job is enqueued with a stable id, send-<emailId>, so the same email is not queued twice.",
  },
  {
    n: "03",
    title: "Coordinate",
    body: "Redis holds the shared permit, the hourly counters, and the last-send timestamp. Workers do not keep those numbers privately.",
  },
  {
    n: "04",
    title: "Constrain",
    body: "A send proceeds only if the minimum gap has elapsed and both the sender cap and the global cap still have room. Otherwise the same job is delayed.",
  },
  {
    n: "05",
    title: "Execute",
    body: "Workers pull jobs up to a configured concurrency. The permit is acquired first. The row then moves from scheduled to sending.",
  },
  {
    n: "06",
    title: "Protect",
    body: "The status change is a compare-and-set. After SMTP accepts the message, a receipt is stored before the row is marked sent.",
  },
  {
    n: "07",
    title: "Recover",
    body: "On worker start, scheduled and sending rows are scanned. If send-<emailId> is missing, or the job is already finished while the row is still open, it is enqueued again from scheduledAt.",
  },
  {
    n: "08",
    title: "Index",
    body: "The email row is projected into Elasticsearch for search. A failed index does not block the send.",
  },
];

const stores = [
  {
    icon: Database,
    name: "PostgreSQL",
    role: "Source of truth",
    body: "Campaigns, emails, senders, and status live here. Scheduling and recovery read this record, not a worker's memory.",
  },
  {
    icon: Server,
    name: "Redis",
    role: "Coordination and operational state",
    body: "Permits, hourly counters, the inter-send gap, and the SMTP receipt are shared so every worker sees the same constraints.",
  },
  {
    icon: Timer,
    name: "BullMQ",
    role: "Persistent delayed execution",
    body: "The job waits in Redis until scheduledAt. There is no cron sweep. The delay is the schedule.",
  },
  {
    icon: Search,
    name: "Elasticsearch",
    role: "Derived search index",
    body: "Search reads a projection of the email row. The send path still completes if indexing is slow or unavailable.",
  },
];

const reference = [
  { name: "Client", role: "Compose, the scheduled and sent lists, and search. The browser never calls SMTP." },
  { name: "Express", role: "Session and campaign create. It writes the rows, enqueues the jobs, and returns." },
  { name: "PostgreSQL", role: "Canonical campaigns, emails, and senders. Scheduling and restart recovery read this record." },
  { name: "Scheduler", role: "Gives each address its own time from the delay and the hourly caps, then stores that time on the row." },
  { name: "BullMQ", role: "The delayed job for that time, id send-<emailId>. The wait is the schedule. There is no cron sweep." },
  { name: "Redis", role: "The shared state workers agree on: permits, hourly counters, the send gap, and the SMTP receipt." },
  { name: "Rate limiter", role: "The rules on that Redis state. Defaults are 2000 ms apart, 200 per sender each hour, and 1000 globally." },
  { name: "Worker pool", role: "Runs those jobs up to a configured concurrency, default 5. It does not add machines." },
  { name: "SMTP", role: "The delivery boundary. Ethereal is the test inbox that accepts the message." },
  { name: "Slack", role: "One notice per sender per UTC hour when the rate limiter finds that hour is full." },
  { name: "Elasticsearch", role: "Search projected from the email row. A failed index does not block the send." },
];

export function LandingPage() {
  return (
    <div className="sys min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-page">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
          <Link to="/" className="text-[1.35rem] text-ink">
            <Wordmark />
          </Link>
          <nav className="order-3 flex w-full flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#c5cdc8] md:order-0 md:ml-auto md:w-auto">
            <a href="#architecture" className="hover:text-white">Architecture</a>
            <a href="#execution" className="hover:text-white">Execution</a>
            <a href="#schedule" className="hover:text-white">Scheduling</a>
            <a href="#reliability" className="hover:text-white">Reliability</a>
            <Link to="/dashboard" className="hover:text-white">Dashboard</Link>
          </nav>
          <Link
            to="/dashboard"
            className="ml-auto inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-hover md:ml-0"
          >
            Open Dashboard
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1.15fr)_22rem] lg:gap-x-20">
            <h1 className="font-sans text-4xl font-semibold leading-[1.17] tracking-[-0.03em] text-[#f3f6f4] sm:text-5xl">
              Distributed scheduling for reliable email delivery.
            </h1>
            <div>
              <p className="text-base leading-relaxed text-muted">
                Schedule email as delayed work, instead of sending when a request arrives.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <Link
                  to="/dashboard"
                  className="inline-flex h-11 items-center rounded-lg bg-brand px-5 text-sm font-medium text-white hover:bg-brand-hover"
                >
                  Open Dashboard
                </Link>
                <a href="#execution" className="text-sm font-medium text-[#d7e4dc] underline-offset-4 hover:underline">
                  How execution works
                </a>
              </div>
            </div>
          </div>
          <div className="mt-12 lg:mt-16">
            <ExecutionPlane />
          </div>
        </section>

        <section id="execution" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em]">How distributed execution works</h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-muted">
              A send is not a request handler that calls SMTP. It is a persisted job that has to pass a shared gate, then survive a crash.
            </p>
            <ol className="mt-8 max-w-3xl border-l border-line">
              {steps.map((step) => (
                <li key={step.n} className="grid grid-cols-[3.5rem_1fr] gap-3 pb-7 pl-4">
                  <span className="font-mono text-[12px] text-brand">{step.n}</span>
                  <div>
                    <h3 className="font-sans text-base font-semibold">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <h3 className="mt-4 font-sans text-xl font-semibold tracking-[-0.02em]">Multiple workers. One shared state.</h3>
            <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-muted">
              These constraints cannot live independently inside each worker. They need shared coordination. ReachInbox reserves capacity with an atomic Redis script, so two workers cannot spend the same slot. If this email already holds a permit, a retry does not increment the hour again.
            </p>
            <CoordinationMap />
          </div>
        </section>

        <section id="schedule" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em]">Scheduling under constraints</h2>
            <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-muted">
              A campaign is not one timestamp copied onto every address. At create time, slots are packed from the start time using the delay, mail already scheduled for that sender, and mail already scheduled globally. Defaults are 2000 ms between sends, 200 emails per sender each UTC hour, and 1000 globally. When the current hour is saturated, work is not dropped. The scheduler reserves capacity in a future time bucket. If a worker later finds the hour already spent, it does the same thing to that job: move scheduledAt forward and delay the existing BullMQ job.
            </p>
            <ConstraintTimeline />
          </div>
        </section>

        <section id="reliability" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em]">Failure is part of the execution model</h2>
            <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-muted">
              Idempotent processing and duplicate-send protection cover races and crashes. This is recovery across failure windows. It is not a claim of exactly-once delivery.
            </p>
            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              <Trace
                kicker="Worker disappears"
                lines={[
                  "A job is delayed, or a worker is mid-send",
                  "The process stops",
                  "PostgreSQL still has the row. Redis may still have the job",
                  "The worker starts",
                  "Reconciliation restores a missing job",
                  "Processing resumes",
                ]}
              />
              <Trace
                kicker="SMTP accepted, then the process died"
                lines={[
                  "SMTP returns a message id",
                  "The receipt is written before the row is trusted",
                  "The process stops",
                  "The database update may not have finished",
                  "The next attempt sees the receipt",
                  "The row is marked sent. SMTP is not called again",
                ]}
              />
            </div>
            <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line sm:grid-cols-2">
              <div className="bg-[#141a17] px-4 py-4">
                <h3 className="font-mono text-[12px] text-progress">Transient failure</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  An SMTP error with no receipt releases the hourly permit and throws, so BullMQ retries. The row goes back to scheduled until the attempt budget is spent.
                </p>
              </div>
              <div className="bg-[#141a17] px-4 py-4">
                <h3 className="font-mono text-[12px] text-danger">Permanent failure</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  When the attempt budget is spent, the row is marked failed. Reconciliation does not scan failed rows, so that job is not put back on the queue.
                </p>
              </div>
            </div>

            <h3 className="mt-12 font-sans text-xl font-semibold tracking-[-0.02em]">What happens during a restart</h3>
            <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-muted">
              The schedule is the database row. The queue is restored from that row when the worker process comes back. This page does not perform reconciliation. The worker does, on startup.
            </p>
            <RestartMap />
          </div>
        </section>

        <section id="state" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em]">State is split by responsibility</h2>
            <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-muted">
              Operational coordination and canonical business state have different requirements, so they are intentionally separated.
            </p>
            <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line sm:grid-cols-2 lg:grid-cols-4">
              {stores.map((store) => (
                <article key={store.name} className="bg-[#141a17] px-4 py-4">
                  <store.icon size={16} strokeWidth={1.5} className="text-brand" aria-hidden />
                  <h3 className="mt-3 font-mono text-[13px] text-[#d7efe0]">{store.name}</h3>
                  <p className="mt-1 text-sm text-ink">{store.role}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{store.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="architecture" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em]">System architecture</h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-muted">
              Each piece is listed once. The rate limiter is the rules on Redis, not a second store. The scheduler writes times. BullMQ waits until those times.
            </p>
            <dl className="mt-8 overflow-hidden rounded-xl border border-line">
              {reference.map((item) => (
                <div key={item.name} className="grid gap-1 border-t border-line px-5 py-4 first:border-t-0 sm:grid-cols-[11.5rem_1fr] sm:items-baseline sm:gap-8">
                  <dt className="font-mono text-[13px] text-[#d7efe0]">{item.name}</dt>
                  <dd className="text-sm leading-relaxed text-muted">{item.role}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-16 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em]">Open the scheduler.</h2>
              <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-muted">
                Create a campaign and watch rows move from scheduled to sent. The queue, the caps, and the receipt are the path this page describes.
              </p>
            </div>
            <Link
              to="/dashboard"
              className="inline-flex h-11 items-center rounded-lg bg-brand px-5 text-sm font-medium text-white hover:bg-brand-hover"
            >
              Open Dashboard
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-sm text-muted">
          <Wordmark className="text-lg text-ink" />
          <span>Delayed jobs, shared permits, restart reconciliation.</span>
        </div>
      </footer>
    </div>
  );
}

function Trace({ kicker, lines }: { kicker: string; lines: string[] }) {
  return (
    <article>
      <h3 className="font-sans text-base font-semibold">{kicker}</h3>
      <ol className="mt-4 border-l border-line">
        {lines.map((line) => (
          <li key={line} className="py-2 pl-4 font-mono text-[12px] leading-snug text-[#c5cdc8]">
            {line}
          </li>
        ))}
      </ol>
    </article>
  );
}
