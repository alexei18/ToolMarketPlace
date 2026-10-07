import { useState } from "react";
import { call, ClientError, post } from "../lib/client";
import { safePath } from "../lib/safe";
import { Button, Field, Notice, useAction, useTurnstile } from "./ui";

type Mode = "login" | "signup" | "forgot" | "reset";

interface Props {
  mode: Mode;
  next?: string;
  googleEnabled: boolean;
  token?: string;
  reason?: string;
}

const REASONS: Record<string, string> = {
  save: "Log in to save products.",
  perk: "Log in to claim member perks.",
  vote: "Log in to vote on roadmaps.",
  feedback: "Log in to leave feedback.",
  report: "Log in to report a product.",
};

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M21.6 12.23c0-.7-.06-1.37-.18-2.02H12v3.83h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.32 2.98-7.33z" opacity=".9" />
      <path fill="currentColor" d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.58A10 10 0 0 0 12 22z" opacity=".7" />
      <path fill="currentColor" d="M6.41 13.9a6 6 0 0 1 0-3.8V7.52H3.07a10 10 0 0 0 0 8.96z" opacity=".5" />
      <path fill="currentColor" d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.52l3.34 2.58C7.2 7.74 9.4 5.98 12 5.98z" />
    </svg>
  );
}

export default function AuthForm({ mode, next, googleEnabled, token, reason }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const turnstile = useTurnstile();
  const target = safePath(next);
  const origin = typeof location !== "undefined" ? location.origin : "";

  const submit = useAction(
    async () => {
      if (mode === "signup") {
        const captcha = await turnstile.getToken();
        await call("POST", "/auth/sign-up/email", { name: name.trim(), email: email.trim(), password, callbackURL: `${origin}/feed?verified=1` }, { headers: captcha ? { "x-captcha-response": captcha } : {} });
        location.href = `/onboarding${target ? `?next=${encodeURIComponent(target)}` : ""}`;
      } else if (mode === "login") {
        await post("/auth/sign-in/email", { email: email.trim(), password, rememberMe: true });
        location.href = target ?? "/feed";
      } else if (mode === "forgot") {
        await post("/auth/request-password-reset", { email: email.trim(), redirectTo: `${origin}/reset-password` });
        setDone(true);
      } else {
        await post("/auth/reset-password", { newPassword: password, token });
        setDone(true);
      }
    },
    { silent: true },
  );

  const google = useAction(async () => {
    const res = await post<{ url?: string }>("/auth/sign-in/social", {
      provider: "google",
      callbackURL: `${origin}${target ?? "/feed"}`,
      newUserCallbackURL: `${origin}/onboarding${target ? `?next=${encodeURIComponent(target)}` : ""}`,
      errorCallbackURL: `${origin}/login?oauth=failed`,
    });
    if (res.url) location.href = res.url;
  });

  const onSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    submit.run();
  };

  const err = submit.error;
  const message = err ? friendly(err, mode) : null;

  if (done && mode === "forgot") {
    return (
      <Notice kind="success">
        <span>If an account exists for <b>{email}</b>, a reset link is on its way. It expires in one hour.</span>
      </Notice>
    );
  }
  if (done && mode === "reset") {
    return (
      <div className="stack-16">
        <Notice kind="success">
          <span>Your password was changed.</span>
        </Notice>
        <a className="btn btn-dark btn-block" href="/login">
          Log in
        </a>
      </div>
    );
  }

  return (
    <div className="stack-24">
      {reason && REASONS[reason] && <Notice>{REASONS[reason]}</Notice>}
      {(mode === "login" || mode === "signup") && googleEnabled && (
        <>
          <Button type="button" variant="secondary" className="btn-block btn-lg" busy={google.busy} onClick={() => google.run()}>
            <GoogleMark /> Continue with Google
          </Button>
          <div className="or">
            <span>or with email</span>
          </div>
        </>
      )}
      <form className="stack-16" onSubmit={onSubmit} noValidate={false}>
        {mode === "signup" && (
          <Field label="Name" htmlFor="name">
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="name" />
          </Field>
        )}
        {mode !== "reset" && (
          <Field label="Email" htmlFor="email">
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
        )}
        {mode !== "forgot" && (
          <Field
            label={mode === "reset" ? "New password" : "Password"}
            htmlFor="password"
            hint={mode === "login" ? undefined : "At least 8 characters."}
            aside={
              mode === "login" ? (
                <a className="t-13 link" href="/forgot-password">
                  Forgot it?
                </a>
              ) : undefined
            }
          >
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "login" ? 1 : 8}
              maxLength={128}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </Field>
        )}
        {mode === "signup" && turnstile.element}
        {message && (
          <p className="error-text t-15" role="alert">
            {message}
          </p>
        )}
        <Button type="submit" variant="dark" size="lg" className="btn-block" busy={submit.busy}>
          {mode === "signup" ? "Create account" : mode === "login" ? "Log in" : mode === "forgot" ? "Send reset link" : "Set new password"}
        </Button>
      </form>
    </div>
  );
}

function friendly(err: ClientError, mode: Mode): string {
  if (err.code === "INVALID_EMAIL_OR_PASSWORD" || (mode === "login" && err.status === 401)) return "That email and password don't match.";
  if (err.code === "USER_ALREADY_EXISTS" || err.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return "An account with this email already exists. Log in instead.";
  if (err.code === "PASSWORD_TOO_SHORT") return "Use at least 8 characters.";
  if (err.code === "INVALID_TOKEN") return "This reset link is invalid or expired. Ask for a new one.";
  if (err.status === 429) return "Too many attempts. Wait a minute and try again.";
  return err.message;
}
