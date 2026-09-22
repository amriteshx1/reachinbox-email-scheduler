import { useState } from "react";
import { Link } from "react-router-dom";
import { googleLoginUrl } from "../lib/api";
import { Wordmark } from "../components/brand/Wordmark";
import { Button } from "../components/ui/Button";
import { GoogleIcon } from "../components/ui/Icons";
import "./public.css";

export function LoginPage({ backendDown }: { backendDown?: boolean }) {
  const [signingIn, setSigningIn] = useState(false);

  const startGoogle = () => {
    setSigningIn(true);
    window.location.assign(googleLoginUrl());
  };

  return (
    <div className="sys flex min-h-screen flex-col font-mark">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Link to="/" className="text-lg text-[#e7ece8]">
          <Wordmark />
        </Link>
        <Link to="/" className="text-sm font-medium text-[#c5cdc8] hover:text-white">
          Back
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Sign in</h1>
        <p className="sys-muted mt-3 text-sm leading-relaxed">Open your workspace.</p>

        <div className="sys-node mt-8 rounded-2xl px-6 py-6">
          {backendDown ? (
            <p className="mb-4 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300" role="alert">
              The server is not responding. Try again in a moment.
            </p>
          ) : null}
          <Button
            variant="secondary"
            className="h-12 w-full border-[#2c3830] bg-white text-sm font-medium text-ink hover:bg-[#f4f7f5]"
            onClick={startGoogle}
            disabled={signingIn || backendDown}
          >
            <GoogleIcon />
            {signingIn ? "Signing in…" : "Sign in with Google"}
          </Button>
        </div>
      </main>
    </div>
  );
}
