import { MIN_AGE } from "@tm/shared";
import { en } from "@tm/shared/copy";

/** Sign-up consent (docs/LEGAL.md): the required age checkbox and the Terms and Privacy line. */
export function TermsConsent({ checked, onChange, error }: { checked: boolean; onChange: (checked: boolean) => void; error: boolean }) {
  const c = en.legal.consent;
  return (
    <div className="stack-8">
      <label className="checkbox">
        <input id="age-confirm" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={error || undefined} aria-describedby={error ? "age-error" : undefined} />
        {en.legal.age(MIN_AGE)}
      </label>
      {error && (
        <span id="age-error" className="error-text t-13" role="alert">
          {en.legal.ageRequired}
        </span>
      )}
      <p className="t-13 muted">
        {c.before}
        <a className="link" href="/terms" target="_blank">
          {c.terms}
        </a>
        {c.and}
        <a className="link" href="/privacy" target="_blank">
          {c.privacy}
        </a>
        .
      </p>
    </div>
  );
}
