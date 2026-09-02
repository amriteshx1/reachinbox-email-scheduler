import { describe, expect, it } from "vitest";
import { sessionCookieOptions } from "../src/config/constants";

describe("sessionCookieOptions", () => {
  it("keeps SameSite=Lax and secure=false for local HTTP", () => {
    const cookie = sessionCookieOptions({
      nodeEnv: "test",
      frontendUrl: "http://localhost:5173",
    });
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.secure).toBe(false);
    expect(cookie.path).toBe("/");
  });

  it("uses SameSite=None; Secure in production", () => {
    const cookie = sessionCookieOptions({
      nodeEnv: "production",
      frontendUrl: "https://reachinbox-email-scheduler-frontend-seven.vercel.app",
    });
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("none");
    expect(cookie.secure).toBe(true);
    expect(cookie.path).toBe("/");
  });

  it("uses SameSite=None; Secure when the SPA is public HTTPS even if NODE_ENV is not production", () => {
    const cookie = sessionCookieOptions({
      nodeEnv: "development",
      frontendUrl: "https://reachinbox-email-scheduler-frontend-seven.vercel.app",
    });
    expect(cookie.sameSite).toBe("none");
    expect(cookie.secure).toBe(true);
  });
});
