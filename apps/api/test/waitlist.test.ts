import { describe, expect, test } from "bun:test";
import { TERMS_VERSION } from "@tm/shared";
import { forgetLaunchState } from "../src/lib/prelaunch";
import { Client, setup } from "./helpers";

const signUpAs = (t: ReturnType<typeof setup>, email: string) =>
  new Client(t).post("/auth/sign-up/email", { email, password: "correct horse battery", name: "Someone", acceptedTerms: TERMS_VERSION });

describe("waitlist mode", () => {
  test("WAITLIST runs pre-launch until the Launch time is recorded in D1", async () => {
    const t = setup({ WAITLIST: "true", MAKER_ACCESS_DATE: "2026-12-01", LAUNCH_DATE: "YYYY-MM-DD" });
    expect((await new Client(t).get("/site")).data).toEqual({ prelaunch: true, makerAccessDate: "2026-12-01", launchDate: null });

    t.sqlite.run("UPDATE site_state SET launched_at = 1 WHERE id = 1");
    forgetLaunchState(t.env);
    expect((await new Client(t).get("/site")).data.prelaunch).toBe(false);
    expect((await new Client(t).get("/home")).data.prelaunch).toBe(false);

    const off = setup({ WAITLIST: "false" });
    expect((await new Client(off).get("/site")).data.prelaunch).toBe(false);
  });

  test("only admins and invited makers can create an account during the waitlist", async () => {
    const t = setup({ WAITLIST: "true" });
    const blocked = await signUpAs(t, "someone@example.com");
    expect(blocked.status).toBe(403);
    expect(blocked.data.code).toBe("WAITLIST_ONLY");

    expect((await signUpAs(t, "Admin@Example.com")).status).toBe(200);

    const row = (id: string, email: string, role: string, invitedAt: number | null) =>
      t.sqlite.run("INSERT INTO waitlist (id, email, role, ref_code, confirmed_at, invited_at, created_at) VALUES (?, ?, ?, ?, 1, ?, 1)", [id, email, role, `code${id}`, invitedAt]);
    row("w1", "maker@example.com", "maker", null);
    row("w2", "invited@example.com", "maker", 2);
    row("w3", "explorer@example.com", "explorer", 2);
    expect((await signUpAs(t, "maker@example.com")).status).toBe(403);
    expect((await signUpAs(t, "explorer@example.com")).status).toBe(403);
    expect((await signUpAs(t, "Invited@example.com")).status).toBe(200);

    t.sqlite.run("UPDATE site_state SET launched_at = 1 WHERE id = 1");
    forgetLaunchState(t.env);
    expect((await signUpAs(t, "someone@example.com")).status).toBe(200);
  });
});
