import { useState } from "react";
import { Link } from "react-router-dom";
import { googleLoginUrl } from "../lib/api";
import { Wordmark } from "../components/brand/Wordmark";
import { GoogleIcon } from "../components/ui/Icons";
import { LoginTrace } from "./systemVisuals";
import "./public.css";

export function LoginPage({ backendDown }: { backendDown?: boolean }) {
  const [signingIn, setSigningIn] = useState(false);

  const startGoogle = () => {
    setSigningIn(true);
    window.location.assign(googleLoginUrl());
  };

  return (
    <div className="sys flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
        <Link to="/" className="text-[1.35rem] text-ink">
          <Wordmark />
        </Link>
        <Link to="/" className="text-sm text-[#c5cdc8] hover:text-white">
          Back
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 content-center items-center gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(240px,0.9fr)_minmax(280px,1fr)] lg:gap-12 lg:py-16">
        <div>
          <h1 className="max-w-[12ch] font-sans text-4xl font-semibold leading-[1.15] tracking-[-0.03em] text-[#f3f6f4] sm:text-5xl">
            Reliable scheduling. Controlled execution.
          </h1>
          <p className="mt-4 max-w-[36ch] text-sm leading-relaxed text-muted">
            Persistent jobs, a shared rate gate, and a receipt so a crash does not send twice.
          </p>
        </div>

        <LoginTrace />

        <div className="w-full rounded-2xl border border-line bg-[#141a17] px-6 py-7">
          <h2 className="font-sans text-lg font-semibold text-[#f3f6f4]">Continue to ReachInbox</h2>
          {backendDown ? (
            <p className="mt-4 rounded-lg bg-red-950/70 px-3 py-2 text-sm text-red-300" role="alert">
              The server is not responding. Try again in a moment.
            </p>
          ) : null}
          <button
            type="button"
            onClick={startGoogle}
            disabled={signingIn || backendDown}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-[#d7ddd9] bg-white text-sm font-medium text-[#111] hover:bg-[#f4f7f5] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GoogleIcon />
            {signingIn ? "Signing in…" : "Sign in with Google"}
          </button>
        </div>
      </main>
    </div>
  );
}
