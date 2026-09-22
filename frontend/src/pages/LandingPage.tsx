import { Link } from "react-router-dom";
import { Wordmark } from "../components/brand/Wordmark";
import "./public.css";

const mechanisms = [
  { name: "BullMQ + Redis", detail: "Persistent delayed jobs. Send time lives on the job, not on a cron." },
  { name: "PostgreSQL", detail: "Source of truth for campaigns, emails, senders, and delivery state." },
  { name: "Distributed rate limits", detail: "Atomic Redis coordination for the per-sender gap and hourly caps." },
  { name: "Worker concurrency", detail: "Several workers can run at once and still share the same counters." },
  { name: "Rescheduling", detail: "A job past the hourly cap is moved into a later window. It is not dropped." },
  { name: "Idempotent delivery", detail: "Retries, races, and a crash after SMTP do not send the same message twice." },
  { name: "Restart recovery", detail: "Open rows are reconciled back onto the queue when a worker starts." },
  { name: "Elasticsearch", detail: "Search index over email records. Sending does not depend on it." },
];

export function LandingPage() {
  return (
    <div className="sys min-h-screen font-mark">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link to="/" className="text-lg text-[#e7ece8]">
          <Wordmark />
        </Link>
        <Link to="/login" className="text-sm font-medium text-[#c5cdc8] hover:text-white">
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-16 pt-10 sm:pt-16">
        <h1 className="max-w-[18ch] text-[2.15rem] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-5xl">
          Reliable email scheduling, built around distributed jobs.
        </h1>
        <p className="sys-muted mt-5 max-w-[52ch] text-base leading-relaxed">
          ReachInbox coordinates delayed send jobs across workers. Rate limits, order, persistence, and idempotent processing stay intact when more than one worker is running.
        </p>
        <Link
          to="/login"
          className="mt-8 inline-flex h-11 items-center rounded-lg bg-brand px-5 text-sm font-medium text-white hover:bg-brand-hover"
        >
          Get started
        </Link>

        <section className="mt-16">
          <h2 className="text-lg font-semibold tracking-[-0.02em]">How a send moves</h2>
          <Architecture />
        </section>

        <section className="mt-16">
          <h2 className="text-lg font-semibold tracking-[-0.02em]">What the system actually does</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {mechanisms.map((item) => (
              <article key={item.name} className="sys-node rounded-xl px-4 py-3.5">
                <h3 className="font-mono text-[13px] font-medium text-[#d7efe0]">{item.name}</h3>
                <p className="sys-muted mt-1.5 text-sm leading-relaxed">{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="max-w-[22ch] text-lg font-semibold tracking-[-0.02em]">
            Scheduling is easy. Reliable scheduling is not.
          </h2>
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            <Flow
              title="Restart"
              steps={["scheduled job", "worker stops", "row and job stay persisted", "worker starts", "processing resumes"]}
            />
            <Flow
              title="Two workers"
              steps={["worker A and worker B", "shared Redis permit", "hourly cap held", "second send blocked"]}
            />
          </div>
        </section>
      </main>

      <footer className="sys-line border-t">
        <div className="sys-muted mx-auto flex max-w-5xl items-center justify-between px-6 py-5 text-sm">
          <Wordmark className="text-[#e7ece8]" />
          <span>Delayed jobs, shared limits, one send.</span>
        </div>
      </footer>
    </div>
  );
}

function Architecture() {
  return (
    <div className="sys-node mt-6 rounded-2xl px-4 py-6 sm:px-8">
      <div className="mx-auto flex max-w-xl flex-col items-stretch">
        <Node name="Browser" role="Compose and monitor" />
        <Pipe />
        <Node name="Express API" role="Session, campaign create, enqueue" />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center">
            <Pipe />
            <Node name="PostgreSQL" role="Source of truth" />
          </div>
          <div className="flex flex-col items-center">
            <Pipe />
            <Node name="Redis / BullMQ" role="Delayed jobs and coordination" />
          </div>
        </div>
        <Pipe />
        <Node name="Worker pool" role="email-send, search-index, slack-notify" />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Node name="SMTP" role="Ethereal delivery" />
          <Node name="Elasticsearch" role="Search index" />
          <Node name="Slack" role="Hourly-cap notice" />
        </div>
      </div>
      <p className="sys-muted mx-auto mt-5 max-w-xl text-center font-mono text-[11px] leading-relaxed">
        The API writes the email rows, then enqueues one delayed job per row. Workers execute. Search and Slack are side effects, not the send path.
      </p>
    </div>
  );
}

function Node({ name, role }: { name: string; role: string }) {
  return (
    <div className="sys-node w-full rounded-lg px-3 py-2.5 text-center">
      <div className="font-mono text-[13px] font-medium text-[#e7ece8]">{name}</div>
      <div className="sys-muted mt-0.5 font-mono text-[11px]">{role}</div>
    </div>
  );
}

function Pipe() {
  return <div className="sys-pipe mx-auto h-5 w-px" aria-hidden />;
}

function Flow({ title, steps }: { title: string; steps: string[] }) {
  return (
    <article className="sys-node rounded-xl px-4 py-4">
      <h3 className="font-mono text-[13px] font-medium text-[#d7efe0]">{title}</h3>
      <ol className="mt-3 space-y-2">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 font-mono text-[12px] leading-snug text-[#c5cdc8]">
            <span className="sys-muted w-4 shrink-0">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}
