import { useState } from "react";
import { PUBLIC_REPORT_REASONS, type PublicReportReason } from "@tm/shared/enums";
import { en } from "@tm/shared/copy";
import { post } from "../lib/client";
import { Button, Field, Notice, fieldError, useAction, useAdoptTyped, useTurnstile } from "./ui";

interface Ack {
  reference: string;
  product: { slug: string; title: string };
  emailed: boolean;
}

/** The public report form on /report: no account needed (docs/LEGAL.md). */
export default function PublicReport() {
  const t = en.publicReport;
  const [url, setUrl] = useState("");
  const [reason, setReason] = useState<PublicReportReason | "">("");
  const [explanation, setExplanation] = useState("");
  const [email, setEmail] = useState("");
  const [goodFaith, setGoodFaith] = useState(false);
  const [ack, setAck] = useState<Ack | null>(null);
  const turnstile = useTurnstile();
  useAdoptTyped({ "r-url": setUrl, "r-explanation": setExplanation, "r-email": setEmail });

  const send = useAction(
    async () => {
      const turnstileToken = await turnstile.getToken();
      setAck(await post<Ack>("/reports", { url, reason, explanation, email: email || null, goodFaith, turnstileToken }));
    },
    { silent: true },
  );

  if (ack) {
    return (
      <section id="report-form" className="report-form stack-12" role="status">
        <h2 className="t-17">{t.received}</h2>
        <p className="t-15">{t.receivedText(ack.product.title, ack.reference)}</p>
        {ack.emailed && <p className="t-15 muted">{t.receivedEmail}</p>}
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setAck(null);
              setUrl("");
              setReason("");
              setExplanation("");
              setGoodFaith(false);
            }}
          >
            {t.another}
          </Button>
        </div>
      </section>
    );
  }

  const err = (name: string) => fieldError(send.error, name);
  const general = send.error && !["url", "reason", "explanation", "email", "goodFaith"].some((f) => err(f)) ? send.error.message : null;
  return (
    <section id="report-form" className="report-form" aria-labelledby="report-form-h">
      <h2 id="report-form-h" className="t-17">
        {t.title}
      </h2>
      <form
        className="stack-16"
        onSubmit={(e) => {
          e.preventDefault();
          send.run();
        }}
      >
        <Field label={t.url} htmlFor="r-url" hint={t.urlHint} error={err("url")}>
          <input id="r-url" className="input" type="text" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2048} required />
        </Field>
        <Field label={t.reason} htmlFor="r-reason" error={err("reason")}>
          <select id="r-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value as PublicReportReason)} required>
            <option value="" disabled />
            {PUBLIC_REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {en.reportReasons[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.explanation} htmlFor="r-explanation" hint={t.explanationHint} error={err("explanation")}>
          <textarea id="r-explanation" className="textarea" rows={5} value={explanation} onChange={(e) => setExplanation(e.target.value)} minLength={20} maxLength={2000} required />
        </Field>
        <Field label={t.email} htmlFor="r-email" hint={t.emailHint} error={err("email")}>
          <input id="r-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
        </Field>
        <label className="checkbox t-15">
          <input type="checkbox" checked={goodFaith} onChange={(e) => setGoodFaith(e.target.checked)} required />
          <span>{t.goodFaith}</span>
        </label>
        {err("goodFaith") && <span className="error-text">{err("goodFaith")}</span>}
        {turnstile.element}
        {general && <Notice kind="danger">{general}</Notice>}
        <div>
          <Button type="submit" variant="dark" busy={send.busy}>
            {t.submit}
          </Button>
        </div>
      </form>
    </section>
  );
}
