import { useEffect, useState } from "react";
import type { CategoryDTO, DigestFrequency } from "@tm/shared";
import { patch, put, toast } from "../lib/client";
import { enablePush, pushState, type PushState } from "../lib/push";
import { Check } from "./icons";
import { Button, Notice, useAction } from "./ui";

interface Props {
  categories: CategoryDTO[];
  initial: string[];
  digest: DigestFrequency;
  next?: string;
}

const DIGESTS: { value: DigestFrequency; title: string; text: string }[] = [
  { value: "daily", title: "Daily", text: "A short summary every morning." },
  { value: "weekly", title: "Weekly", text: "The best of the week, on Mondays." },
  { value: "off", title: "Off", text: "I'll check the site myself." },
];

export default function Onboarding({ categories, initial, digest: initialDigest, next }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [picked, setPicked] = useState<string[]>(initial);
  const [digest, setDigest] = useState<DigestFrequency>(initialDigest);
  const [push, setPush] = useState<PushState | null>(null);
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/feed";

  useEffect(() => {
    pushState().then(setPush).catch(() => setPush("unsupported"));
  }, []);

  const toggle = (slug: string) => setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));

  const save = useAction(async () => {
    await put("/me/interests", { categories: picked });
    await patch("/me/settings", { digestFrequency: digest });
    if (digest === "off" || push === "unsupported" || push === "unavailable" || push === "on") location.href = target;
    else setStep(2);
  });

  const turnOn = useAction(async () => {
    const state = await enablePush();
    setPush(state);
    if (state === "on") {
      toast("Notifications are on.");
      setTimeout(() => (location.href = target), 600);
    }
  });

  if (step === 2) {
    return (
      <div className="stack-24">
        <ol className="steps">
          <li>Categories</li>
          <li aria-current="step">Notifications</li>
        </ol>
        <div className="stack-8">
          <h1 className="t-32">Get the {digest} digest on this device?</h1>
          <p className="t-17 muted">We'll send one notification per digest with the new products in your categories. No marketing, ever.</p>
        </div>
        {push === "needs-install" && (
          <Notice kind="warning">
            <span>
              On iPhone, notifications work after you add this site to your Home Screen: tap <b>Share</b>, then <b>Add to Home Screen</b>, and open it from there. Your digest is also in the notification center on the site.
            </span>
          </Notice>
        )}
        {push === "denied" && (
          <Notice kind="warning">
            <span>Notifications are blocked for this site in your browser settings. You'll still find each digest in your notification center here.</span>
          </Notice>
        )}
        <div className="row row-wrap">
          {push !== "needs-install" && push !== "denied" && (
            <Button variant="primary" size="lg" busy={turnOn.busy} onClick={() => turnOn.run()}>
              Turn on notifications
            </Button>
          )}
          <a className="btn btn-ghost btn-lg" href={target}>
            {push === "needs-install" || push === "denied" ? "Continue" : "Not now"}
          </a>
        </div>
      </div>
    );
  }

  const missing = Math.max(0, 3 - picked.length);
  return (
    <div className="stack-32">
      <ol className="steps">
        <li aria-current="step">Categories</li>
        <li>Notifications</li>
      </ol>
      <div className="stack-8">
        <h1 className="t-32">What are you into?</h1>
        <p className="t-17 muted">Pick at least three categories. Your feed and digest show new products from these. You can change them any time.</p>
      </div>
      <div className="row row-wrap" style={{ gap: 10 }} role="group" aria-label="Categories">
        {categories.map((c) => {
          const on = picked.includes(c.slug);
          return (
            <button key={c.slug} type="button" className="chip chip-toggle" aria-pressed={on} onClick={() => toggle(c.slug)}>
              {on && <Check size={15} aria-hidden="true" />}
              {c.name}
            </button>
          );
        })}
      </div>

      <section className="stack-12" aria-labelledby="digest-h">
        <h2 id="digest-h" className="t-17">
          Digest
        </h2>
        <div className="digest-grid">
          {DIGESTS.map((d) => (
            <label key={d.value} className="digest-option" data-checked={digest === d.value}>
              <input type="radio" name="digest" value={d.value} checked={digest === d.value} onChange={() => setDigest(d.value)} className="visually-hidden" />
              <span className="w-600">{d.title}</span>
              <span className="t-13 muted">{d.text}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="spread onboarding-foot">
        <span className="t-15 muted">{missing > 0 ? `Pick ${missing} more` : `${picked.length} selected`}</span>
        <Button variant="dark" size="lg" disabled={missing > 0} busy={save.busy} onClick={() => save.run()}>
          Continue
        </Button>
      </div>
    </div>
  );
}
