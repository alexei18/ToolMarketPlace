import { useEffect, useState } from "react";
import type { WaitlistStatsDTO } from "@tm/shared";
import { apiOrigin, call, post, toast } from "../lib/client";
import { shortDate } from "../lib/format";
import { Button, Empty, Notice, useAction } from "./ui";

/* Typed out to confirm; the same words as WAITLIST_INVITE_CONFIRM / WAITLIST_LAUNCH_CONFIRM (not imported: that module pulls in zod). */
const INVITE = "INVITE";
const LAUNCH = "LAUNCH";

/** /admin/waitlist (docs/tiktok-campaign.md): sign-ups, sources, email sending and the two launch actions. */
export default function WaitlistAdmin() {
  const [stats, setStats] = useState<WaitlistStatsDTO | null>(null);
  const [failed, setFailed] = useState(false);
  const load = () =>
    call<WaitlistStatsDTO>("GET", "/admin/waitlist/stats?days=60", undefined, { cache: "no-store" })
      .then(setStats)
      .catch(() => setFailed(true));
  useEffect(() => {
    load();
  }, []);

  if (failed) return <Notice kind="danger">Could not load the waitlist stats. Reload the page to try again.</Notice>;
  if (!stats) return <p className="muted">Loading…</p>;
  const t = stats.totals;
  return (
    <div className="stack-32">
      <section className="wa-tiles">
        <Tile label="Explorers (confirmed)" value={t.explorers} />
        <Tile label="Makers (confirmed)" value={t.makers} />
        <Tile label="Pending confirmation" value={t.pending} />
        <Tile label="Queued emails" value={t.queued} warn={t.queued > 0} />
        <Tile label="Failed emails" value={t.failed} warn={t.failed > 0} />
        <Tile label="Unsubscribed" value={t.unsubscribed} />
      </section>

      <section className="stack-12">
        <div className="spread">
          <h2 className="t-22">Email sending</h2>
          <span className="t-13 muted">Sent this month: {stats.emailsThisMonth}</span>
        </div>
        <p className="t-13 muted">
          Counted per UTC day across every email the site sends. Deferred = held back by the provider's quota or rate limit and retried every 30 minutes. Resend's free plan
          allows 100 a day and 3,000 a month.
        </p>
        {stats.emailUsage.length === 0 ? (
          <Empty title="No emails yet" />
        ) : (
          <Table head={["Day", "Sent", "Deferred", "Failed"]} rows={stats.emailUsage.map((u) => [u.day, u.sent, u.deferred, u.failed])} />
        )}
        {stats.failedEmails.length > 0 && (
          <>
            <h3 className="t-17 w-600">Refused addresses</h3>
            <Table head={["Email", "Error", "When"]} rows={stats.failedEmails.map((f) => [f.email, f.error ?? "", shortDate(f.at)])} />
          </>
        )}
      </section>

      <Daily stats={stats} />

      <section className="wa-two">
        <div className="stack-12">
          <h2 className="t-22">Where did you find us?</h2>
          {stats.foundVia.length === 0 ? <Empty title="No answers yet" /> : <Table head={["Answer", "Confirmed"]} rows={stats.foundVia.map((f) => [f.foundVia || "(no answer)", f.n])} />}
        </div>
        <div className="stack-12">
          <h2 className="t-22">Top referrers</h2>
          {stats.topReferrers.length === 0 ? (
            <Empty title="No referrals yet" />
          ) : (
            <Table head={["Email", "Code", "Confirmed referrals"]} rows={stats.topReferrers.map((r) => [r.email, r.refCode, r.n])} />
          )}
        </div>
      </section>

      <section className="stack-12">
        <h2 className="t-22">Export</h2>
        <a className="btn btn-secondary" href={`${apiOrigin()}/admin/waitlist.csv`}>
          Download CSV
        </a>
      </section>

      <Actions stats={stats} onDone={load} />
    </div>
  );
}

function Tile({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="wa-tile" data-warn={warn ? "true" : undefined}>
      <span className="t-13 muted">{label}</span>
      <strong className="t-32">{value}</strong>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={typeof cell === "number" ? "num" : undefined} style={{ overflowWrap: "anywhere" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Confirmed sign-ups per day, split by role and by utm_campaign. */
function Daily({ stats }: { stats: WaitlistStatsDTO }) {
  const days = [...new Set(stats.daily.map((d) => d.day))].sort().reverse();
  const campaigns = [...new Set(stats.daily.map((d) => d.campaign))].sort();
  const sum = (day: string, pick: (d: WaitlistStatsDTO["daily"][number]) => boolean) => stats.daily.filter((d) => d.day === day && pick(d)).reduce((a, d) => a + d.n, 0);
  return (
    <section className="stack-12">
      <h2 className="t-22">Confirmed sign-ups per day</h2>
      <p className="t-13 muted">The last 60 days, by the day they confirmed. Campaign = utm_campaign of the link they came from.</p>
      {days.length === 0 ? (
        <Empty title="No confirmed sign-ups yet" />
      ) : (
        <Table
          head={["Day", "Explorers", "Makers", ...campaigns.map((c) => c || "(no campaign)")]}
          rows={days.map((day) => [day, sum(day, (d) => d.role === "explorer"), sum(day, (d) => d.role === "maker"), ...campaigns.map((c) => sum(day, (d) => d.campaign === c))])}
        />
      )}
    </section>
  );
}

function Actions({ stats, onDone }: { stats: WaitlistStatsDTO; onDone: () => void }) {
  const inv = stats.invites;
  return (
    <section className="stack-16">
      <h2 className="t-22">Launch actions</h2>
      <Confirmable
        title="Invite makers"
        word={INVITE}
        done={inv.makersInvitedAt}
        text={`Sends the early-access invite to every confirmed maker (${stats.totals.makers}). Makers who join later get it on the next 30-minute run.`}
        progress={inv.makersInvitedAt ? `${inv.makersLeft} still to send` : null}
        path="/admin/waitlist/invite-makers"
        onDone={onDone}
      />
      <Confirmable
        title="Launch"
        word={LAUNCH}
        done={inv.launchedAt}
        text={`Turns the waitlist off for everyone, opens sign-ups and sends the launch invite to every confirmed explorer (${stats.totals.explorers}), with the top picks in their categories. This can't be undone from here.`}
        progress={inv.launchedAt ? `${inv.explorersLeft} still to send` : null}
        path="/admin/waitlist/launch"
        onDone={onDone}
      />
    </section>
  );
}

function Confirmable(props: { title: string; word: string; done: number | null; text: string; progress: string | null; path: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const action = useAction(async () => {
    await post(props.path, { confirm: typed });
    toast(`${props.title}: started`);
    setOpen(false);
    setTyped("");
    props.onDone();
  });
  return (
    <div className="wa-action stack-8">
      <div className="spread">
        <h3 className="t-17 w-600">{props.title}</h3>
        {props.done ? <span className="t-13 muted">Started {shortDate(props.done)}</span> : null}
      </div>
      <p className="muted">{props.text}</p>
      {props.progress && <p className="t-13">{props.progress}</p>}
      {!props.done && !open && (
        <Button type="button" variant="dark" onClick={() => setOpen(true)}>
          {props.title}…
        </Button>
      )}
      {!props.done && open && (
        <form
          className="row row-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            action.run();
          }}
        >
          <label className="visually-hidden" htmlFor={`confirm-${props.word}`}>
            Type {props.word} to confirm
          </label>
          <input id={`confirm-${props.word}`} className="input" style={{ maxWidth: 220 }} placeholder={`Type ${props.word} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          <Button type="submit" variant="danger" disabled={typed !== props.word} busy={action.busy}>
            Confirm
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
