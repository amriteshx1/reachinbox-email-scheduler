import { googleLoginUrl } from "../lib/api";
import { Button } from "../components/ui/Button";
import { GoogleIcon } from "../components/ui/Icons";

export function LoginPage({ backendDown }: { backendDown?: boolean }) {
  const startGoogle = () => window.location.assign(googleLoginUrl());

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-[496px] rounded-[10px] border border-line bg-white px-14 py-12 shadow-[0_2px_12px_rgba(16,16,16,0.06)]">
        <h1 className="mb-8 text-center text-[28px] font-bold leading-none tracking-tight text-ink">Login</h1>
        {backendDown ? (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-danger">
            Backend unavailable. Start the API on port 3001, then try again.
          </p>
        ) : null}
        <Button variant="google" className="h-12 w-full rounded-lg text-sm font-medium" onClick={startGoogle}>
          <GoogleIcon />
          Login with Google
        </Button>
        <div className="my-6 flex items-center gap-3 text-[11px] leading-none text-[#b0b0b0]">
          <span className="h-px flex-1 bg-[#e6e6e6]" />
          or sign up through email
          <span className="h-px flex-1 bg-[#e6e6e6]" />
        </div>
        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email ID"
            autoComplete="username"
            className="h-12 w-full rounded-lg border-0 bg-wash px-4 text-sm text-ink outline-none placeholder:text-[#9a9a9a] focus:ring-2 focus:ring-brand/25"
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            className="h-12 w-full rounded-lg border-0 bg-wash px-4 text-sm text-ink outline-none placeholder:text-[#9a9a9a] focus:ring-2 focus:ring-brand/25"
          />
        </div>
        <Button variant="primary" className="mt-7 h-12 w-full rounded-lg text-sm font-semibold" onClick={startGoogle}>
          Login
        </Button>
      </div>
    </div>
  );
}
