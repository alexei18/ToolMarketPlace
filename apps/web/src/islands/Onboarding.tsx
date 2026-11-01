import { useEffect, useState } from "react";
import { TERMS_VERSION, type CategoryDTO, type DigestFrequency } from "@tm/shared";
import { en } from "@tm/shared/copy";
import { patch, post, put, toast } from "../lib/client";
import { enablePush, pushState, type PushState } from "../lib/push";
import { safePath } from "../lib/safe";
import { utmParams } from "../lib/utm";
import { Check } from "./icons";
import { TermsConsent } from "./TermsConsent";
import { Button, Notice, useAction } from "./ui";

interface Props {
  categories: CategoryDTO[];
  initial: string[];
  digest: DigestFrequency;
  next?: string;
  /** The account hasn't accepted the current Terms (new Google accounts). */
  needsTerms: boolean;
  /** The age box was already ticked on /signup before "Continue with Google". */
  termsFromSignup: boolean;
}

const DIGESTS: { value: DigestFrequency; title: string; text: string }[] = [
  { value: "daily", title: en.onboarding.digest.daily, text: "A short summary every morning." },
  { value: "weekly", title: en.onboarding.digest.weekly, text: "The best of the week, on Mondays." },
  { value: "off", title: en.onboarding.digest.appOnly, text: "I'll check the site myself." },
];

export default function Onboarding({ categories, initial, digest: initialDigest, next, needsTerms: initialNeedsTerms, termsFromSignup }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [picked, setPicked] = useState<string[]>(initial);
  const [digest, setDigest] = useState<DigestFrequency>(initialDigest);
  const [push, setPush] = useState<PushState | null>(null);
  const [needsTerms, setNeedsTerms] = useState(initialNeedsTerms && !termsFromSignup);
  const [adult, setAdult] = useState(false);
  const [ageError, setAgeError] = useState(false);
  // The feed greets new members with the final onboarding line.
  const target = safePath(next) ?? "/feed?welcome=1";

  useEffect(() => {
    pushState().then(setPush).catch(() => setPush("unsupported"));
    // Accepted on /signup: record it now. If that fails, ask again here.
    if (initialNeedsTerms && termsFromSignup) post("/me/terms", { version: TERMS_VERSION }).catch(() => setNeedsTerms(true));
    // First-touch source from the sign-up link; the API keeps only the first one, for new accounts.
    const utm = utmParams(location.search);
    if (utm) post("/me/first-touch", { source: utm.get("utm_source"), campaign: utm.get("utm_campaign"), content: utm.get("utm_content") }).catch(() => {});
  }, []);

  const toggle = (slug: string) => setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));

  const save = useAction(async () => {
    if (needsTerms) {
      await post("/me/terms", { version: TERMS_VERSION });
      setNeedsTerms(false);
    }
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
          <a className={`btn btn-lg ${push === "needs-install" || push === "denied" ? "btn-dark" : "btn-ghost"}`} href={target}>
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
        <h1 className="t-32">{en.onboarding.title}</h1>
        <p className="t-17 muted">{en.onboarding.subtitle}</p>
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
          {en.onboarding.digest.question}
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

      <div className="onboarding-foot stack-16">
        {needsTerms && (
          <TermsConsent
            checked={adult}
            error={ageError}
            onChange={(v) => {
              setAdult(v);
              if (v) setAgeError(false);
            }}
          />
        )}
        <div className="spread">
          <span className="t-15 muted">{missing > 0 ? `Pick ${missing} more` : `${picked.length} selected`}</span>
          <Button
            variant="dark"
            size="lg"
            disabled={missing > 0}
            busy={save.busy}
            onClick={() => {
              if (needsTerms && !adult) {
                setAgeError(true);
                document.getElementById("age-confirm")?.focus();
              } else save.run();
            }}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
