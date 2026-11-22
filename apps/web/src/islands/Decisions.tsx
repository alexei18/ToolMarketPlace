import { useState } from "react";
import type { DecisionDTO } from "@tm/shared";
import { en } from "@tm/shared/copy";
import { MODERATION_RULES } from "@tm/shared/moderation";
import { post, toast } from "../lib/client";
import { longDate } from "../lib/format";
import { Button, Empty, Field, fieldError, useAction } from "./ui";

const m = en.moderation;

/** Statements of reasons with a contest box (maker dashboard and the suspension page). */
export default function Decisions({ items: initial }: { items: DecisionDTO[] }) {
  const [items, setItems] = useState(initial);
  if (items.length === 0) return <Empty title={m.page.empty} />;
  return (
    <ul className="list-plain">
      {items.map((d) => (
        <li key={d.id}>
          <Decision d={d} onContested={(next) => setItems((xs) => xs.map((x) => (x.id === next.id ? next : x)))} />
        </li>
      ))}
    </ul>
  );
}

function Decision({ d, onContested }: { d: DecisionDTO; onContested: (d: DecisionDTO) => void }) {
  const [body, setBody] = useState("");
  const send = useAction(
    async () => {
      const r = await post<{ contestedAt: number }>(`/me/decisions/${d.id}/contest`, { body });
      onContested({ ...d, contestUntil: null, contest: { body, contestedAt: r.contestedAt, outcome: null, response: null, resolvedAt: null } });
      toast(m.page.contestSent);
    },
    { silent: true },
  );
  const rule = MODERATION_RULES[d.rule];
  const title = d.action === "suspended" ? m.what.suspended : m.what[d.action](d.product?.title ?? "");
  return (
    <article id={`d-${d.id}`} className="decision stack-12" aria-labelledby={`d-${d.id}-h`}>
      <div className="stack-4">
        <h2 id={`d-${d.id}-h`} className="t-17">
          {title}
        </h2>
        <div className="row row-wrap t-13 muted">
          <span>{longDate(d.createdAt)}</span>
          <span className="status">{d.automated ? m.page.automated : m.page.byPerson}</span>
          {d.reversedAt && (
            <span className="status" data-status="live">
              {m.page.reversed}
            </span>
          )}
        </div>
      </div>
      <p className="t-15">{d.facts}</p>
      <p className="t-15">
        {m.page.rule}{" "}
        <a className="link" href={rule.href}>
          {rule.label}
        </a>
      </p>
      {d.contest ? (
        <div className="stack-8 contest-box">
          <div className="t-13 muted">{m.page.contested(longDate(d.contest.contestedAt))}</div>
          <p className="t-15" style={{ whiteSpace: "pre-line" }}>
            {d.contest.body}
          </p>
          {d.contest.outcome && (
            <div className="stack-4">
              <div className="w-600 t-15">{m.contestOutcome[d.contest.outcome]}</div>
              {d.contest.response && <p className="t-15 muted">{d.contest.response}</p>}
            </div>
          )}
        </div>
      ) : d.parentId ? (
        <p className="t-13 muted">{m.page.coveredBySuspension}</p>
      ) : d.contestUntil && !d.reversedAt ? (
        <form
          className="stack-12"
          onSubmit={(e) => {
            e.preventDefault();
            send.run();
          }}
        >
          <Field label={m.page.contestLabel} htmlFor={`c-${d.id}`} hint={m.page.contestUntil(longDate(d.contestUntil))} error={fieldError(send.error, "body") ?? send.error?.message ?? null}>
            <textarea id={`c-${d.id}`} className="textarea" value={body} onChange={(e) => setBody(e.target.value)} minLength={20} maxLength={2000} rows={4} required />
          </Field>
          <div>
            <Button type="submit" variant="dark" busy={send.busy}>
              {m.page.contestSubmit}
            </Button>
          </div>
        </form>
      ) : !d.reversedAt ? (
        <p className="t-13 muted">{m.page.expired}</p>
      ) : null}
    </article>
  );
}
