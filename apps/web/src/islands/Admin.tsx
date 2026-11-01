import { useEffect, useState } from "react";
import type { AdminDecisionDTO, AdminReportDTO, CategoryDTO, DecisionDTO, Page, ReviewCaseDTO, ReviewQueueItemDTO, StaffPickDTO } from "@tm/shared";
import { en } from "@tm/shared/copy";
import { DECISION_ACTIONS, REPORT_REASONS, REPORT_SOURCES } from "@tm/shared/enums";
import { MODERATION_RULES, MODERATION_RULE_IDS, type ModerationRule } from "@tm/shared/moderation";
import { SPIKE_YOUNG_ACCOUNT_DAYS, STAFF_PICK_DAYS } from "@tm/shared/ranking";
import { apiOrigin, call, del, get, patch, post, put, toast } from "../lib/client";
import { shortDate, timeAgo } from "../lib/format";
import { ExternalLink, Trash2 } from "./icons";
import { Button, Empty, Notice, useAction } from "./ui";

type Tab = "queue" | "reports" | "decisions" | "picks" | "users" | "categories" | "blocked";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  username: string | null;
  role: string;
  bannedAt: number | null;
  createdAt: number;
}

interface Props {
  queue: ReviewQueueItemDTO[];
  cases: ReviewCaseDTO[];
  contests: AdminDecisionDTO[];
  meId: string;
}

export default function Admin({ queue: initialQueue, cases: initialCases, contests: initialContests, meId }: Props) {
  const [tab, setTab] = useState<Tab>("queue");
  const [queue, setQueue] = useState(initialQueue);
  const [cases, setCases] = useState(initialCases);
  const [contests, setContests] = useState(initialContests);
  return (
    <div className="stack-24">
      <div className="tabs" role="tablist">
        {(
          [
            ["queue", `Review queue (${queue.length + cases.length + contests.length})`],
            ["reports", "Reports"],
            ["decisions", "Decisions"],
            ["picks", en.feed.badges.staffPick + "s"],
            ["users", "Users"],
            ["categories", "Categories"],
            ["blocked", "Blocked domains"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "queue" && (
        <>
          <Contests items={contests} meId={meId} onDone={(id) => setContests((xs) => xs.filter((x) => x.id !== id))} />
          <Cases items={cases} onDone={(id) => setCases((xs) => xs.filter((x) => x.id !== id))} />
          <Queue items={queue} empty={cases.length === 0 && contests.length === 0} onDone={(id) => setQueue((q) => q.filter((x) => x.product.id !== id))} />
        </>
      )}
      {tab === "reports" && <Reports />}
      {tab === "decisions" && <DecisionsList />}
      {tab === "picks" && <StaffPicks />}
      {tab === "users" && <Users />}
      {tab === "categories" && <Categories />}
      {tab === "blocked" && <Blocked />}
    </div>
  );
}

/** Signal spikes: the product stays visible but out of Top and Trending until resolved. */
function Cases({ items, onDone }: { items: ReviewCaseDTO[]; onDone: (id: string) => void }) {
  const resolve = useAction(async (id: string) => {
    await post(`/admin/cases/${id}/resolve`);
    onDone(id);
    toast("Resolved. The product ranks again after the next ranking run.");
  });
  if (items.length === 0) return null;
  return (
    <ul className="list-plain">
      {items.map((c) => (
        <li key={c.id} className="queue-item">
          <div className="spread row-wrap" style={{ alignItems: "flex-start" }}>
            <div className="stack-4">
              <a className="w-600 t-17" href={`/p/${c.product.slug}`}>
                {c.product.title}
              </a>
              <div className="t-13 muted">
                Signal spike: {c.details.young} of {c.details.total} signals in {c.details.windowHours} h came from accounts younger than {SPIKE_YOUNG_ACCOUNT_DAYS} days · opened{" "}
                {timeAgo(c.createdAt)}
              </div>
              <div className="t-13 muted">Still visible; kept out of Top and Trending while this is open.</div>
            </div>
            <Button variant="secondary" size="sm" busy={resolve.busy} onClick={() => resolve.run(c.id)}>
              Resolve
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StaffPicks() {
  const [items, setItems] = useState<StaffPickDTO[] | null>(null);
  const [product, setProduct] = useState("");
  const [note, setNote] = useState("");
  const load = useAction(async () => setItems((await get<{ items: StaffPickDTO[] }>("/admin/staff-picks")).items));
  useEffect(() => {
    load.run();
  }, []);
  const add = useAction(async () => {
    // Accepts a slug or a product page link (…/p/<slug>).
    const slug = product.trim().replace(/^.*\/p\//, "").split(/[/?#]/)[0]!;
    await put(`/admin/products/${encodeURIComponent(slug)}/staff-pick`, { note });
    setProduct("");
    setNote("");
    await load.run();
    toast(`${en.feed.badges.staffPick} added.`);
  });
  const remove = useAction(async (id: string) => {
    await del(`/admin/products/${id}/staff-pick`);
    setItems((xs) => xs?.filter((x) => x.product.id !== id) ?? null);
  });
  return (
    <div className="stack-16">
      <form
        className="row row-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          add.run();
        }}
      >
        <input className="input" style={{ flex: "1 1 220px" }} placeholder="Product link or slug" aria-label="Product link or slug" value={product} onChange={(e) => setProduct(e.target.value)} required />
        <input className="input" style={{ flex: "2 1 280px" }} placeholder="Short note (shown on the product page)" aria-label="Note" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} required />
        <Button type="submit" variant="dark" busy={add.busy}>
          Add
        </Button>
      </form>
      {add.error && <Notice kind="danger">{add.error.message}</Notice>}
      {items && items.length === 0 && <Empty title="No active staff picks" text={`Picks count for ${STAFF_PICK_DAYS} days, then expire.`} />}
      {items && items.length > 0 && (
        <ul className="list-plain">
          {items.map((s) => (
            <li key={s.product.id} className="queue-item spread row-wrap">
              <div className="stack-4">
                <a className="w-600" href={`/p/${s.product.slug}`}>
                  {s.product.title}
                </a>
                {s.note && <div className="t-15 muted">{s.note}</div>}
                <div className="t-13 muted">Until {shortDate(s.expiresAt)}</div>
              </div>
              <Button variant="ghost" size="sm" aria-label={`Remove ${s.product.title}`} busy={remove.busy} onClick={() => remove.run(s.product.id)}>
                <Trash2 size={16} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Queue({ items, empty, onDone }: { items: ReviewQueueItemDTO[]; empty: boolean; onDone: (id: string) => void }) {
  const [removing, setRemoving] = useState<string | null>(null);
  const restore = useAction(async (id: string) => {
    await post(`/admin/products/${id}/restore`);
    onDone(id);
    toast("Restored. Reports were rejected and the reporters told.");
  });
  const remove = async (id: string, input: { rule: ModerationRule; facts: string }) => {
    const r = await post<{ makerBanned?: boolean }>(`/admin/products/${id}/remove`, input);
    setRemoving(null);
    onDone(id);
    toast(r.makerBanned ? "Removed. The maker was suspended automatically." : "Removed. The maker got the statement of reasons.");
  };
  if (items.length === 0) return empty ? <Empty title="Nothing to review" text="Hidden or reported products, contests and signal spikes show up here." /> : null;
  return (
    <ul className="list-plain">
      {items.map(({ product: p, reports }) => (
        <li key={p.id} className="queue-item">
          <div className="spread row-wrap" style={{ alignItems: "flex-start" }}>
            <div className="stack-4">
              <div className="row row-wrap">
                <span className="w-600 t-17">{p.title}</span>
                <a className="t-13 link" href={p.url} target="_blank" rel="noopener noreferrer">
                  {p.url} <ExternalLink size={12} style={{ display: "inline", verticalAlign: -1 }} />
                </a>
              </div>
              <div className="t-15 muted">{p.tagline}</div>
              <div className="t-13 muted">
                by {p.maker.name} · {p.validReportCount} valid reports · published {timeAgo(p.publishedAt)}
                {p.status === "live" && " · still visible, out of Top and Trending"}
              </div>
            </div>
            <div className="row">
              <Button variant="secondary" size="sm" busy={restore.busy} onClick={() => restore.run(p.id)}>
                {p.status === "live" ? "Dismiss reports" : "Restore"}
              </Button>
              <Button variant="danger" size="sm" onClick={() => setRemoving(p.id)}>
                Remove
              </Button>
            </div>
          </div>
          {removing === p.id && <DecisionForm label="Remove product" onSubmit={(input) => remove(p.id, input)} onCancel={() => setRemoving(null)} />}
          {reports.length > 0 && (
            <ul className="list-plain report-list">
              {reports.map((r) => (
                <li key={r.id} className="t-13">
                  <b>{en.reportReasons[r.reason] ?? r.reason}</b> · {r.reporter ? r.reporter.name : `Public form${r.reporterEmail ? ` (${r.reporterEmail})` : ""}`}
                  {r.reporter && !r.counts && <span className="muted"> (not counted: new or unconfirmed account)</span>} · {timeAgo(r.createdAt)}
                  {r.note && <div className="muted">“{r.note}”</div>}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function Users() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const search = useAction(async (query: string) => {
    const r = await get<{ items: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(query)}`);
    setUsers(r.items);
  });
  useEffect(() => {
    search.run("");
  }, []);
  const [banning, setBanning] = useState<string | null>(null);
  const mark = (id: string, bannedAt: number | null) => setUsers((us) => us?.map((x) => (x.id === id ? { ...x, bannedAt } : x)) ?? null);
  const unban = useAction(async (u: AdminUser) => {
    await post(`/admin/users/${u.id}/unban`, {});
    mark(u.id, null);
    toast("Suspension lifted. Products hidden by it are live again.");
  });
  const ban = async (u: AdminUser, input: { rule: ModerationRule; facts: string }) => {
    await post(`/admin/users/${u.id}/ban`, input);
    setBanning(null);
    mark(u.id, Math.floor(Date.now() / 1000));
    toast("Suspended. The user got the statement of reasons.");
  };
  return (
    <div className="stack-16">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          search.run(q);
        }}
      >
        <input className="input" placeholder="Search by email, name or username" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="dark" busy={search.busy}>
          Search
        </Button>
      </form>
      {users && users.length === 0 && <Empty title="No users found" />}
      {users && users.length > 0 && (
        <div className="table-wrap">
          <table className="table table-stack">
            <thead>
              <tr>
                <th>User</th>
                <th>Joined</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="w-600">{u.name}</div>
                    <div className="t-13 muted">
                      {u.email}
                      {u.username && ` · @${u.username}`}
                    </div>
                  </td>
                  <td className="t-13 muted" data-label="Joined">
                    {timeAgo(u.createdAt)}
                  </td>
                  <td>
                    <span className="status" data-status={u.bannedAt ? "banned" : "live"}>
                      {u.bannedAt ? "Banned" : u.role === "admin" ? "Admin" : "Active"}
                    </span>
                  </td>
                  <td className="num">
                    {u.role !== "admin" &&
                      (u.bannedAt ? (
                        <Button variant="secondary" size="sm" busy={unban.busy} onClick={() => unban.run(u)}>
                          Unban
                        </Button>
                      ) : (
                        <Button variant="danger" size="sm" onClick={() => setBanning(u.id)}>
                          Ban
                        </Button>
                      ))}
                    {banning === u.id && <DecisionForm label="Suspend account" onSubmit={(input) => ban(u, input)} onCancel={() => setBanning(null)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Categories() {
  const [cats, setCats] = useState<CategoryDTO[] | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  // The public list is cached for a minute; skip the cache so edits show up right away.
  const load = () =>
    call<{ items: CategoryDTO[] }>("GET", "/categories", undefined, { cache: "no-store" })
      .then((r) => setCats(r.items))
      .catch(() => setCats([]));
  useEffect(() => {
    load();
  }, []);
  const add = useAction(async () => {
    await post("/admin/categories", { slug, name });
    setSlug("");
    setName("");
    await load();
    toast("Category added.");
  });
  const rename = useAction(async (c: CategoryDTO) => {
    const next = prompt("Category name", c.name);
    if (!next || next === c.name) return;
    await patch(`/admin/categories/${c.id}`, { name: next });
    await load();
  });
  const remove = useAction(async (c: CategoryDTO) => {
    if (!confirm(`Delete ${c.name}?`)) return;
    await del(`/admin/categories/${c.id}`);
    await load();
  });
  return (
    <div className="stack-16">
      <form
        className="row row-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          add.run();
        }}
      >
        <input className="input" style={{ maxWidth: 220 }} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="input mono" style={{ maxWidth: 220 }} placeholder="slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} required />
        <Button type="submit" variant="dark" busy={add.busy}>
          Add category
        </Button>
      </form>
      <div className="table-wrap">
        <table className="table table-stack">
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th className="num">Products</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cats?.map((c) => (
              <tr key={c.id}>
                <td className="w-600">{c.name}</td>
                <td className="mono t-13">{c.slug}</td>
                <td className="num" data-label="Products">
                  {c.productCount ?? 0}
                </td>
                <td className="num">
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <Button variant="ghost" size="sm" onClick={() => rename.run(c)}>
                      Rename
                    </Button>
                    <Button variant="ghost" size="sm" aria-label={`Delete ${c.name}`} disabled={(c.productCount ?? 0) > 0} onClick={() => remove.run(c)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Blocked() {
  const [items, setItems] = useState<{ hostname: string; reason: string | null }[] | null>(null);
  const [host, setHost] = useState("");
  const [reason, setReason] = useState("");
  const load = () =>
    get<{ items: { hostname: string; reason: string | null }[] }>("/admin/blocked-domains")
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);
  const add = useAction(async () => {
    await post("/admin/blocked-domains", { hostname: host, reason: reason || null });
    setHost("");
    setReason("");
    await load();
  });
  const remove = useAction(async (h: string) => {
    await del(`/admin/blocked-domains/${encodeURIComponent(h)}`);
    await load();
  });
  return (
    <div className="stack-16">
      <p className="muted">Links on these domains (and their subdomains) can't be listed or verified.</p>
      <form
        className="row row-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          add.run();
        }}
      >
        <input className="input" style={{ maxWidth: 260 }} placeholder="spam-domain.com" value={host} onChange={(e) => setHost(e.target.value)} required />
        <input className="input" style={{ maxWidth: 320 }} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button type="submit" variant="dark" busy={add.busy}>
          Block
        </Button>
      </form>
      {items && items.length === 0 && <Empty title="No blocked domains" />}
      {items && items.length > 0 && (
        <ul className="list-plain">
          {items.map((b) => (
            <li key={b.hostname} className="spread" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ overflowWrap: "anywhere" }}>
                <span className="mono">{b.hostname}</span>
                {b.reason && <span className="t-13 muted"> · {b.reason}</span>}
              </span>
              <Button variant="ghost" size="sm" onClick={() => remove.run(b.hostname)}>
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Rule + explanation an admin gives when removing a product or suspending an account (the statement of reasons). */
function DecisionForm({ label, onSubmit, onCancel }: { label: string; onSubmit: (input: { rule: ModerationRule; facts: string }) => Promise<void>; onCancel: () => void }) {
  const [rule, setRule] = useState<ModerationRule | "">("");
  const [facts, setFacts] = useState("");
  const send = useAction(async () => {
    if (rule) await onSubmit({ rule, facts });
  });
  return (
    <form
      className="stack-12 decision-form"
      onSubmit={(e) => {
        e.preventDefault();
        send.run();
      }}
    >
      <label className="stack-4">
        <span className="label">Rule (shown to the user, with a link)</span>
        <select className="input" value={rule} onChange={(e) => setRule(e.target.value as ModerationRule)} required>
          <option value="" disabled />
          {MODERATION_RULE_IDS.map((id) => (
            <option key={id} value={id}>
              {MODERATION_RULES[id].label}
            </option>
          ))}
        </select>
      </label>
      <label className="stack-4">
        <span className="label">Why (facts the user will read; no personal data about others)</span>
        <textarea className="textarea" rows={3} minLength={10} maxLength={2000} value={facts} onChange={(e) => setFacts(e.target.value)} required />
      </label>
      <div className="row">
        <Button type="submit" variant="danger" size="sm" busy={send.busy}>
          {label}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const ACTION_LABEL: Record<DecisionDTO["action"], string> = { hidden: "Hidden", removed: "Removed", suspended: "Account suspended" };

function DecisionSummary({ d }: { d: AdminDecisionDTO }) {
  return (
    <div className="stack-4">
      <div className="row row-wrap">
        <span className="w-600">{ACTION_LABEL[d.action]}</span>
        {d.product ? (
          <a className="link" href={`/p/${d.product.slug}`}>
            {d.product.title}
          </a>
        ) : (
          d.targetType === "product" && <span className="muted">(deleted product)</span>
        )}
        <span className="status">{d.automated ? "Automated" : "Manual"}</span>
        {d.reversedAt && (
          <span className="status" data-status="live">
            Reversed
          </span>
        )}
      </div>
      <div className="t-13 muted">
        {d.user ? `${d.user.name} · ${d.user.email}` : "Deleted account"} · {MODERATION_RULES[d.rule].label} · {d.trigger}
        {d.decidedBy && ` · by ${d.decidedBy.name}`} · {shortDate(d.createdAt)}
      </div>
      <p className="t-15">{d.facts}</p>
    </div>
  );
}

/** Open contests: a person answers each one; reversing restores the product or lifts the suspension. */
function Contests({ items, meId, onDone }: { items: AdminDecisionDTO[]; meId: string; onDone: (id: string) => void }) {
  const [responses, setResponses] = useState<Record<string, string>>({});
  const answer = useAction(async (d: AdminDecisionDTO, outcome: "upheld" | "reversed") => {
    if (d.decidedBy?.id === meId && !confirm("You took the original decision. Answer this contest anyway? It will be recorded.")) return;
    await post(`/admin/decisions/${d.id}/contest`, { outcome, response: responses[d.id] ?? "" });
    onDone(d.id);
    toast(outcome === "reversed" ? "Reversed. The user was told." : "Decision kept. The user was told.");
  });
  if (items.length === 0) return null;
  return (
    <ul className="list-plain">
      {items.map((d) => (
        <li key={d.id} className="queue-item stack-12">
          <div className="eyebrow">Contest · {timeAgo(d.contest!.contestedAt)}</div>
          <DecisionSummary d={d} />
          <div className="report-list">
            <div className="t-13 w-600">What the user says</div>
            <p className="t-15" style={{ whiteSpace: "pre-line" }}>
              {d.contest!.body}
            </p>
          </div>
          {d.decidedBy?.id === meId && <Notice kind="warning">You took the original decision. Another admin should answer this if possible.</Notice>}
          <textarea
            className="textarea"
            rows={3}
            placeholder="Your answer (sent to the user)"
            aria-label="Your answer"
            minLength={10}
            maxLength={2000}
            value={responses[d.id] ?? ""}
            onChange={(e) => setResponses((r) => ({ ...r, [d.id]: e.target.value }))}
          />
          <div className="row">
            <Button variant="secondary" size="sm" busy={answer.busy} disabled={(responses[d.id] ?? "").trim().length < 10} onClick={() => answer.run(d, "upheld")}>
              Keep decision
            </Button>
            <Button variant="dark" size="sm" busy={answer.busy} disabled={(responses[d.id] ?? "").trim().length < 10} onClick={() => answer.run(d, "reversed")}>
              Reverse decision
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

const MONTHLY_CSV = () => `${apiOrigin()}/admin/moderation/monthly.csv`;

function Filters({ children }: { children: React.ReactNode }) {
  return (
    <div className="row row-wrap" style={{ gap: 8 }}>
      {children}
      <a className="btn btn-secondary btn-sm" href={MONTHLY_CSV()} style={{ marginLeft: "auto" }}>
        Monthly counts (CSV)
      </a>
    </div>
  );
}

/** Loads a filtered, paginated admin list. */
function usePagedList<T>(path: string, filters: Record<string, string>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const load = useAction(async (more: boolean) => {
    const page = await get<Page<T>>(`${path}?${query}${more && cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    setItems((xs) => (more ? [...(xs ?? []), ...page.items] : page.items));
    setCursor(page.nextCursor);
  });
  useEffect(() => {
    load.run(false);
  }, [query]);
  return { items, more: cursor ? () => load.run(true) : null, busy: load.busy };
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select className="input" style={{ width: "auto" }} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}: all</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Reports() {
  const [f, setF] = useState({ source: "", reason: "", status: "", month: "" });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const list = usePagedList<AdminReportDTO>("/admin/reports", f);
  return (
    <div className="stack-16">
      <Filters>
        <Select label="Source" value={f.source} onChange={set("source")} options={REPORT_SOURCES.map((s) => [s, s === "public" ? "Public form" : "Members"])} />
        <Select label="Reason" value={f.reason} onChange={set("reason")} options={REPORT_REASONS.map((r) => [r, en.reportReasons[r]])} />
        <Select label="Status" value={f.status} onChange={set("status")} options={[["open", "Open"], ["decided", "Decided"]]} />
        <input className="input" style={{ width: "auto" }} type="month" aria-label="Month" value={f.month} onChange={(e) => set("month")(e.target.value)} />
      </Filters>
      {list.items && list.items.length === 0 && <Empty title="No reports" />}
      {list.items && list.items.length > 0 && (
        <ul className="list-plain">
          {list.items.map((r) => (
            <li key={r.id} className="queue-item stack-4">
              <div className="row row-wrap">
                <span className="mono t-13">{r.reference}</span>
                <b>{en.reportReasons[r.reason]}</b>
                <a className="link" href={`/p/${r.product.slug}`}>
                  {r.product.title}
                </a>
                <span className="status" data-status={r.outcome === "upheld" ? "banned" : r.outcome === "rejected" ? "live" : "pending"}>
                  {r.outcome ?? "open"}
                </span>
              </div>
              <div className="t-13 muted">
                {r.source === "public" ? `Public form${r.reporterEmail ? ` · ${r.reporterEmail}` : " · no email"}` : `${r.reporter?.name ?? "Deleted account"}${r.counts ? "" : " · not counted"}`} · {shortDate(r.createdAt)}
                {r.decidedAt && ` · decided ${shortDate(r.decidedAt)}`}
              </div>
              {r.note && <p className="t-15" style={{ whiteSpace: "pre-line" }}>{r.note}</p>}
            </li>
          ))}
        </ul>
      )}
      {list.more && (
        <div>
          <Button variant="secondary" busy={list.busy} onClick={list.more}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function DecisionsList() {
  const [f, setF] = useState({ target: "", action: "", automated: "", contested: "", month: "" });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const list = usePagedList<AdminDecisionDTO>("/admin/decisions", f);
  return (
    <div className="stack-16">
      <Filters>
        <Select label="About" value={f.target} onChange={set("target")} options={[["product", "Products"], ["account", "Accounts"]]} />
        <Select label="Action" value={f.action} onChange={set("action")} options={DECISION_ACTIONS.map((a) => [a, ACTION_LABEL[a]])} />
        <Select label="Automated" value={f.automated} onChange={set("automated")} options={[["1", "Automated"], ["0", "Manual"]]} />
        <Select label="Contested" value={f.contested} onChange={set("contested")} options={[["1", "Contested"], ["0", "Not contested"]]} />
        <input className="input" style={{ width: "auto" }} type="month" aria-label="Month" value={f.month} onChange={(e) => set("month")(e.target.value)} />
      </Filters>
      {list.items && list.items.length === 0 && <Empty title="No decisions" />}
      {list.items && list.items.length > 0 && (
        <ul className="list-plain">
          {list.items.map((d) => (
            <li key={d.id} className="queue-item stack-8">
              <DecisionSummary d={d} />
              {d.contest && (
                <div className="t-13 muted">
                  Contested {shortDate(d.contest.contestedAt)}
                  {d.contest.outcome ? ` · ${d.contest.outcome}${d.contestResolvedBy ? ` by ${d.contestResolvedBy.name}` : ""}` : " · waiting for an answer"}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {list.more && (
        <div>
          <Button variant="secondary" busy={list.busy} onClick={list.more}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
