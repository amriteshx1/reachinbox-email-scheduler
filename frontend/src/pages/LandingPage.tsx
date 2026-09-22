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

const primitives = [
  { name: "BullMQ", role: "Delayed jobs" },
  { name: "Redis", role: "Atomic coordination" },
  { name: "PostgreSQL", role: "Canonical state" },
  { name: "Worker pool", role: "Configurable concurrency" },
  { name: "Rate limiter", role: "Sender and global caps" },
  { name: "Scheduler", role: "Capacity-aware slots" },
  { name: "Elasticsearch", role: "Derived search" },
  { name: "SMTP", role: "External delivery boundary" },
];

const architecture = [
  { name: "Client", role: "Compose a campaign, list scheduled and sent mail, search." },
  { name: "Express", role: "Session, campaign create, then enqueue. The request does not wait for SMTP." },
  { name: "PostgreSQL", role: "Canonical campaign, email, and sender rows." },
  { name: "BullMQ", role: "email-send, search-index, and slack-notify. The send job id is send-<emailId>." },
  { name: "Redis", role: "Atomic permit, hourly counters, minimum gap, SMTP receipt, sessions." },
  { name: "Workers", role: "Concurrency is a setting, default 5. It is not an autoscaler." },
  { name: "Ethereal", role: "SMTP delivery boundary. A test inbox, not a production mail provider." },
  { name: "Slack", role: "One notice per sender per UTC hour when that hour's cap is hit." },
];

export function LandingPage() {
  return (
    <div className="sys min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[#24302a] bg-[#101412]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
          <Link to="/" className="text-[1.35rem] text-[#e7ece8]">
            <Wordmark />
          </Link>
          <nav className="order-3 flex w-full flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#c5cdc8] md:order-none md:ml-auto md:w-auto">
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
        <section className="mx-auto grid max-w-6xl items-start gap-10 px-5 py-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(460px,1.05fr)] lg:py-16">
          <div className="lg:pt-6">
            <h1 className="max-w-[16ch] font-sans text-4xl font-semibold leading-[1.12] tracking-[-0.03em] text-[#f3f6f4] sm:text-5xl">
              Scheduling is easy. Coordinating execution is not.
            </h1>
            <p className="mt-5 max-w-[54ch] text-base leading-relaxed text-[#8d978f]">
              ReachInbox schedules email work as persistent background jobs, coordinates execution across workers with shared Redis state, enforces sender and global rate limits atomically, and protects delivery with idempotent processing and restart recovery.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
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
          <ExecutionPlane />
        </section>

        <section id="architecture" className="scroll-mt-16 border-t border-[#24302a]">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em]">Where each piece sits</h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[#8d978f]">
              The email is the workload. The work is a delayed job with shared constraints. Express returns after the rows and the jobs exist. Delivery happens later, on a worker.
            </p>
            <dl className="mt-8 divide-y divide-[#24302a] border-y border-[#24302a]">
              {architecture.map((item) => (
                <div key={item.name} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-6">
                  <dt className="font-mono text-[13px] text-[#d7efe0]">{item.name}</dt>
                  <dd className="text-sm leading-relaxed text-[#8d978f]">{item.role}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="execution" className="scroll-mt-16 border-t border-[#24302a]">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em]">How distributed execution works</h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[#8d978f]">
              A send is not a request handler that calls SMTP. It is a persisted job that has to pass a shared gate, then survive a crash.
            </p>
            <ol className="mt-8 max-w-3xl border-l border-[#24302a]">
              {steps.map((step) => (
                <li key={step.n} className="grid grid-cols-[3.5rem_1fr] gap-3 pb-7 pl-4">
                  <span className="font-mono text-[12px] text-brand">{step.n}</span>
                  <div>
                    <h3 className="font-sans text-base font-semibold">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[#8d978f]">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <h3 className="mt-4 font-sans text-xl font-semibold tracking-[-0.02em]">Multiple workers. One shared state.</h3>
            <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-[#8d978f]">
              These constraints cannot live independently inside each worker. They need shared coordination. ReachInbox reserves capacity with an atomic Redis script, so two workers cannot spend the same slot. If this email already holds a permit, a retry does not increment the hour again.
            </p>
            <CoordinationMap />
          </div>
        </section>

        <section id="schedule" className="scroll-mt-16 border-t border-[#24302a]">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em]">Scheduling under constraints</h2>
            <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-[#8d978f]">
              A campaign is not one timestamp copied onto every address. At create time, slots are packed from the start time using the delay, mail already scheduled for that sender, and mail already scheduled globally. Defaults are 2000 ms between sends, 200 emails per sender each UTC hour, and 1000 globally. When the current hour is saturated, work is not dropped. The scheduler reserves capacity in a future time bucket. If a worker later finds the hour already spent, it does the same thing to that job: move scheduledAt forward and delay the existing BullMQ job.
            </p>
            <ConstraintTimeline />
          </div>
        </section>

        <section id="reliability" className="scroll-mt-16 border-t border-[#24302a]">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em]">Failure is part of the execution model</h2>
            <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-[#8d978f]">
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
            <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-[#24302a] sm:grid-cols-2">
              <div className="bg-[#141a17] px-4 py-4">
                <h3 className="font-mono text-[12px] text-[#e0b07a]">Transient failure</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#8d978f]">
                  An SMTP error with no receipt releases the hourly permit and throws, so BullMQ retries. The row goes back to scheduled until the attempt budget is spent.
                </p>
              </div>
              <div className="bg-[#141a17] px-4 py-4">
                <h3 className="font-mono text-[12px] text-[#f07171]">Permanent failure</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#8d978f]">
                  When the attempt budget is spent, the row is marked failed. Reconciliation does not scan failed rows, so that job is not put back on the queue.
                </p>
              </div>
            </div>

            <h3 className="mt-12 font-sans text-xl font-semibold tracking-[-0.02em]">What happens during a restart</h3>
            <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-[#8d978f]">
              The schedule is the database row. The queue is restored from that row when the worker process comes back. This page does not perform reconciliation. The worker does, on startup.
            </p>
            <RestartMap />
          </div>
        </section>

        <section id="state" className="border-t border-[#24302a]">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em]">State is split by responsibility</h2>
            <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-[#8d978f]">
              Operational coordination and canonical business state have different requirements, so they are intentionally separated.
            </p>
            <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-[#24302a] sm:grid-cols-2 lg:grid-cols-4">
              {stores.map((store) => (
                <article key={store.name} className="bg-[#141a17] px-4 py-4">
                  <store.icon size={16} strokeWidth={1.5} className="text-brand" aria-hidden />
                  <h3 className="mt-3 font-mono text-[13px] text-[#d7efe0]">{store.name}</h3>
                  <p className="mt-1 text-sm text-[#e7ece8]">{store.role}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#8d978f]">{store.body}</p>
                </article>
              ))}
            </div>

            <h3 className="mt-12 font-sans text-xl font-semibold tracking-[-0.02em]">System primitives</h3>
            <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-[#24302a] sm:grid-cols-2 lg:grid-cols-4">
              {primitives.map((item) => (
                <div key={item.name} className="bg-[#141a17] px-4 py-3">
                  <dt className="font-mono text-[12px] text-[#d7efe0]">{item.name}</dt>
                  <dd className="mt-1 text-sm text-[#8d978f]">{item.role}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-[#24302a]">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-16 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em]">Open the scheduler.</h2>
              <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-[#8d978f]">
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

      <footer className="border-t border-[#24302a]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-sm text-[#8d978f]">
          <Wordmark className="text-lg text-[#e7ece8]" />
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
      <ol className="mt-4 border-l border-[#24302a]">
        {lines.map((line) => (
          <li key={line} className="py-2 pl-4 font-mono text-[12px] leading-snug text-[#c5cdc8]">
            {line}
          </li>
        ))}
      </ol>
    </article>
  );
}
