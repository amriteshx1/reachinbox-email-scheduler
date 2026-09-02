import { afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { SESSION_COOKIE } from "../../src/config/constants";
import { env } from "../../src/config/env";
import { preparePhase2, buildApp, loginAgent, stopAndDrain } from "../helpers/app";
import { createUserWithSender, deletePhase2Users } from "../helpers/db";

describe("google oauth and session behavior", () => {
  beforeAll(async () => {
    await preparePhase2();
  });

  afterEach(async () => {
    await stopAndDrain([]);
    await deletePhase2Users();
  });

  it("rejects unauthenticated API and Bull Board requests", async () => {
    const app = buildApp();
    const emails = await request(app).get("/api/emails");
    expect(emails.status).toBe(401);
    expect(emails.body.error.code).toBe("UNAUTHENTICATED");

    const me = await request(app).get("/auth/me");
    expect(me.status).toBe(401);

    const board = await request(app).get("/admin/queues").set("Accept", "application/json");
    expect(board.status).toBe(401);
  });

  it("redirects Google login to the real OAuth authorize URL", async () => {
    const app = buildApp();
    const res = await request(app).get("/auth/google").redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("accounts.google.com");
    expect(res.headers.location).toContain("client_id=");
    expect(res.headers.location).toContain("openid");
    expect(res.headers.location).toContain(encodeURIComponent(env.GOOGLE_CALLBACK_URL));
  });

  it("rejects a Google callback with mismatched OAuth state", async () => {
    const app = buildApp();
    const res = await request(app).get("/auth/google/callback?code=fake&state=nope");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_OAUTH_STATE");
  });

  it("persists a session across a new API process using Redis", async () => {
    const { user } = await createUserWithSender();
    const app1 = buildApp();
    const login = await request(app1).post("/__test__/session").send({
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
    });
    expect(login.status).toBe(200);
    const cookie = login.headers["set-cookie"];
    expect(cookie).toBeDefined();

    const app2 = buildApp();
    const me = await request(app2).get("/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);
    expect(me.body.user.email).toBe(user.email);
  });

  it("invalidates the session on logout", async () => {
    const { user } = await createUserWithSender();
    const app = buildApp();
    const agent = await loginAgent(app, user);
    const before = await agent.get("/auth/me");
    expect(before.status).toBe(200);
    const logout = await agent.post("/auth/logout");
    expect(logout.status).toBe(204);
    const after = await agent.get("/auth/me");
    expect(after.status).toBe(401);
  });

  it("isolates sessions between two accounts", async () => {
    const a = await createUserWithSender();
    const b = await createUserWithSender();
    const app = buildApp();
    const agentA = await loginAgent(app, a.user);
    const agentB = await loginAgent(app, b.user);
    const meA = await agentA.get("/auth/me");
    const meB = await agentB.get("/auth/me");
    expect(meA.body.user.id).toBe(a.user.id);
    expect(meB.body.user.id).toBe(b.user.id);
    expect(meA.body.user.id).not.toBe(meB.body.user.id);
  });

  it("serves Bull Board for an authenticated session", async () => {
    const { user } = await createUserWithSender();
    const app = buildApp();
    const agent = await loginAgent(app, user);
    const res = await agent.get("/admin/queues");
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toMatch(/queue|bull/);
  });

  it("uses an httpOnly session cookie named sid", async () => {
    const { user } = await createUserWithSender();
    const app = buildApp();
    const res = await request(app).post("/__test__/session").send({
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
    });
    const raw = res.headers["set-cookie"]?.[0] ?? "";
    expect(raw).toContain(`${SESSION_COOKIE}=`);
    expect(raw.toLowerCase()).toContain("httponly");
    expect(raw.toLowerCase()).toContain("samesite=lax");
  });
});
