import { useEffect, useState } from "react";
import { ACCOUNT_DELETE_CONFIRM, EXPORT_LINK_HOURS, type CategoryDTO, type DigestFrequency, type MeDTO } from "@tm/shared";
import { en } from "@tm/shared/copy";
import { ClientError, del, patch, post, put, toast } from "../lib/client";
import { disablePush, enablePush, pushState, type PushState } from "../lib/push";
import { Check } from "./icons";
import { Button, Field, Notice, Segmented, fieldError, useAction, useAdoptTyped } from "./ui";

interface Props {
  me: MeDTO;
  categories: CategoryDTO[];
  hasPassword: boolean;
}

export default function Settings({ me, categories, hasPassword }: Props) {
  return (
    <div className="stack-32">
      <Profile me={me} />
      <Interests initial={me.interests} categories={categories} />
      <NotificationsSection initial={me.digestFrequency} />
      <Account me={me} hasPassword={hasPassword} />
      <YourData />
    </div>
  );
}

function Section({ id, title, text, children }: { id: string; title: string; text?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="settings-section" aria-labelledby={`${id}-h`}>
      <div className="stack-4">
        <h2 id={`${id}-h`} className="t-17">
          {title}
        </h2>
        {text && <p className="t-15 muted">{text}</p>}
      </div>
      <div className="stack-16">{children}</div>
    </section>
  );
}

function Profile({ me }: { me: MeDTO }) {
  const [name, setName] = useState(me.name);
  const [username, setUsername] = useState(me.username ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  useAdoptTyped({ "s-name": setName, "s-username": (v) => setUsername(v.toLowerCase()), "s-bio": setBio });
  const save = useAction(
    async () => {
      await patch("/me/settings", { name, username, bio });
      toast("Profile saved.");
    },
    { silent: true },
  );
  const submit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    save.run();
  };
  const nameError = fieldError(save.error, "name");
  const usernameError = fieldError(save.error, "username") ?? (save.error?.code === "USERNAME_TAKEN" ? save.error.message : null);
  const bioError = fieldError(save.error, "bio");
  return (
    <Section id="profile" title="Profile" text="Shown on your maker page and next to your feedback.">
      <form className="stack-16" onSubmit={submit}>
        <Field label="Name" htmlFor="s-name" error={nameError}>
          <input id="s-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </Field>
        <Field label="Username" htmlFor="s-username" hint={`Your public page: /m/${username || "username"}`} error={usernameError}>
          <input
            id="s-username"
            className="input"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.toLowerCase());
              save.setError(null);
            }}
            maxLength={30}
            pattern="[a-z0-9_]{3,30}"
            title="3 to 30 characters: lowercase letters, numbers and underscores"
            aria-invalid={usernameError ? true : undefined}
            required
          />
        </Field>
        <Field label="Bio" htmlFor="s-bio" hint={`${bio.length}/160`} error={bioError}>
          <textarea id="s-bio" className="textarea" style={{ minHeight: 80 }} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} />
        </Field>
        {save.error && !nameError && !usernameError && !bioError && (
          <p className="error-text t-15" role="alert">
            {save.error.message}
          </p>
        )}
        <div>
          <Button type="submit" variant="dark" busy={save.busy}>
            Save profile
          </Button>
        </div>
      </form>
    </Section>
  );
}

function Interests({ initial, categories }: { initial: string[]; categories: CategoryDTO[] }) {
  const [picked, setPicked] = useState(initial);
  const dirty = picked.slice().sort().join() !== initial.slice().sort().join();
  const save = useAction(async () => {
    await put("/me/interests", { categories: picked });
    toast("Categories saved. Your feed is updated.");
  });
  return (
    <Section id="interests" title="Categories you follow" text="At least three. They drive your feed and your digest.">
      <div className="row row-wrap" style={{ gap: 8 }}>
        {categories.map((c) => {
          const on = picked.includes(c.slug);
          return (
            <button key={c.slug} type="button" className="chip chip-toggle" style={{ height: 34, fontSize: 14 }} aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.slug) : [...p, c.slug]))}>
              {on && <Check size={14} aria-hidden="true" />}
              {c.name}
            </button>
          );
        })}
      </div>
      <div className="row">
        <Button variant="dark" disabled={!dirty || picked.length < 3} busy={save.busy} onClick={() => save.run()}>
          Save categories
        </Button>
        {picked.length < 3 && <span className="t-13 muted">Pick {3 - picked.length} more</span>}
      </div>
    </Section>
  );
}

function NotificationsSection({ initial }: { initial: DigestFrequency }) {
  const [digest, setDigest] = useState(initial);
  const [push, setPush] = useState<PushState | null>(null);
  useEffect(() => {
    pushState().then(setPush).catch(() => setPush("unsupported"));
  }, []);
  const saveDigest = useAction(async (value: DigestFrequency) => {
    setDigest(value);
    await patch("/me/settings", { digestFrequency: value });
    toast(value === "off" ? "Digest turned off." : `You'll get a ${value} digest.`);
  });
  const togglePush = useAction(async () => {
    const next = push === "on" ? await disablePush() : await enablePush();
    setPush(next);
    toast(next === "on" ? "Notifications are on for this device." : "Notifications are off for this device.");
  });
  return (
    <Section id="notifications" title="Digest and notifications" text="A summary of new products in your categories. Always in your notification center; push is optional.">
      <Field label="Digest">
        <Segmented
          label="Digest frequency"
          value={digest}
          onChange={(v) => saveDigest.run(v)}
          options={[
            { value: "daily", label: "Daily" },
            { value: "weekly", label: "Weekly" },
            { value: "off", label: "Off" },
          ]}
        />
      </Field>
      <Field label="Push on this device">
        {push === null && <span className="t-15 muted">Checking…</span>}
        {push === "unsupported" && <span className="t-15 muted">This browser doesn't support push notifications.</span>}
        {push === "unavailable" && <span className="t-15 muted">Push notifications aren't switched on for this site yet. Digests still arrive in your notification center.</span>}
        {push === "needs-install" && (
          <Notice kind="warning">
            <span>On iPhone, add this site to your Home Screen (Share → Add to Home Screen) and open it from there to turn on notifications.</span>
          </Notice>
        )}
        {push === "denied" && <span className="t-15 muted">Notifications are blocked in your browser settings for this site.</span>}
        {(push === "on" || push === "off") && (
          <div className="row">
            <Button variant={push === "on" ? "secondary" : "primary"} busy={togglePush.busy} onClick={() => togglePush.run()}>
              {push === "on" ? "Turn off" : "Turn on notifications"}
            </Button>
            <span className="status" data-status={push === "on" ? "live" : undefined}>
              {push === "on" ? "On" : "Off"}
            </span>
          </div>
        )}
      </Field>
    </Section>
  );
}

function Account({ me, hasPassword }: { me: MeDTO; hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  useAdoptTyped({ "s-current-password": setCurrent, "s-new-password": setNext });
  const change = useAction(async () => {
    await post("/auth/change-password", { currentPassword: current, newPassword: next, revokeOtherSessions: true }).catch((err) => {
      if (err instanceof ClientError && err.code === "INVALID_PASSWORD") throw new ClientError(err.status, err.code, "The current password isn't right.");
      throw err;
    });
    setCurrent("");
    setNext("");
    toast("Password changed. Other devices were signed out.");
  });
  const resend = useAction(async () => {
    await post("/auth/send-verification-email", { email: me.email, callbackURL: `${location.origin}/feed?verified=1` });
    toast("Sent. Check your inbox.");
  });
  const signOut = useAction(async () => {
    await post("/auth/sign-out", {});
    location.href = "/";
  });
  return (
    <Section id="account" title="Account">
      <dl className="kv">
        <dt>Email</dt>
        <dd className="row row-wrap">
          {me.email}
          {me.emailVerified ? (
            <span className="status" data-status="verified">
              Confirmed
            </span>
          ) : (
            <>
              <span className="status" data-status="pending">
                Not confirmed
              </span>
              <Button variant="text" className="t-13" busy={resend.busy} onClick={() => resend.run()}>
                Resend email
              </Button>
            </>
          )}
        </dd>
      </dl>
      {hasPassword && (
        <form
          className="stack-12"
          onSubmit={(e) => {
            e.preventDefault();
            change.run();
          }}
        >
          <div className="label">Change password</div>
          {/* Lets password managers tie the new password to this account. */}
          <input type="text" name="username" autoComplete="username" value={me.email} readOnly hidden />
          <div className="pw-grid">
            <input id="s-current-password" className="input" type="password" placeholder="Current password" aria-label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            <input id="s-new-password" className="input" type="password" placeholder="New password (8+ characters)" aria-label="New password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
            <Button type="submit" variant="secondary" busy={change.busy}>
              Update
            </Button>
          </div>
        </form>
      )}
      <div>
        <Button variant="secondary" busy={signOut.busy} onClick={() => signOut.run()}>
          Log out
        </Button>
      </div>
    </Section>
  );
}

function YourData() {
  const copy = en.yourData;
  const [download, setDownload] = useState<{ url: string; expiresAt: number } | null>(null);
  const [confirm, setConfirm] = useState("");
  const exportData = useAction(async () => {
    setDownload(await post<{ url: string; expiresAt: number }>("/me/export"));
  });
  const remove = useAction(async () => {
    await del("/me", { confirm });
    location.href = "/";
  });
  const expires = download && new Date(download.expiresAt * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <Section id="your-data" title={copy.title} text={copy.text}>
      <div className="stack-12">
        <div className="label">{copy.exportTitle}</div>
        <p className="t-15 muted">{copy.exportText(EXPORT_LINK_HOURS)}</p>
        {download ? (
          <div className="row row-wrap" role="status">
            <a className="btn btn-secondary" href={download.url}>
              {copy.download}
            </a>
            <span className="t-13 muted">
              {copy.exportReady} {copy.linkExpires(expires!)}
            </span>
          </div>
        ) : (
          <div>
            <Button variant="secondary" busy={exportData.busy} onClick={() => exportData.run()}>
              {copy.exportTitle}
            </Button>
          </div>
        )}
      </div>
      <form
        className="stack-12"
        onSubmit={(e) => {
          e.preventDefault();
          remove.run();
        }}
      >
        <div className="label">{copy.deleteTitle}</div>
        <p className="t-15 muted">{copy.deleteText}</p>
        <Field label={copy.deleteConfirm(ACCOUNT_DELETE_CONFIRM)} htmlFor="s-delete-confirm">
          <input id="s-delete-confirm" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
        </Field>
        <div>
          <Button type="submit" variant="danger" disabled={confirm !== ACCOUNT_DELETE_CONFIRM} busy={remove.busy}>
            {copy.deleteTitle}
          </Button>
        </div>
      </form>
    </Section>
  );
}
