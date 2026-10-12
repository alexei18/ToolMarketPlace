import { useEffect, useState } from "react";
import type { CategoryDTO, ReviewQueueItemDTO } from "@tm/shared";
import { call, del, get, patch, post, toast } from "../lib/client";
import { timeAgo } from "../lib/format";
import { ExternalLink, Trash2 } from "./icons";
import { Button, Empty, useAction } from "./ui";

type Tab = "queue" | "users" | "categories" | "blocked";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  username: string | null;
  role: string;
  bannedAt: number | null;
  createdAt: number;
}

const REASON: Record<string, string> = { spam: "Spam", scam: "Scam", dead_link: "Dead link", prohibited: "Prohibited", other: "Other" };

export default function Admin({ queue: initialQueue }: { queue: ReviewQueueItemDTO[] }) {
  const [tab, setTab] = useState<Tab>("queue");
  const [queue, setQueue] = useState(initialQueue);
  return (
    <div className="stack-24">
      <div className="tabs" role="tablist">
        {(
          [
            ["queue", `Review queue (${queue.length})`],
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
      {tab === "queue" && <Queue items={queue} onDone={(id) => setQueue((q) => q.filter((x) => x.product.id !== id))} />}
      {tab === "users" && <Users />}
      {tab === "categories" && <Categories />}
      {tab === "blocked" && <Blocked />}
    </div>
  );
}

function Queue({ items, onDone }: { items: ReviewQueueItemDTO[]; onDone: (id: string) => void }) {
  const act = useAction(async (id: string, action: "restore" | "remove") => {
    const r = await post<{ makerBanned?: boolean }>(`/admin/products/${id}/${action}`);
    onDone(id);
    toast(action === "restore" ? "Restored. Reports were rejected." : r.makerBanned ? "Removed. The maker was banned automatically." : "Removed.");
  });
  if (items.length === 0) return <Empty title="Nothing to review" text="Products hidden by reports show up here." />;
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
              </div>
            </div>
            <div className="row">
              <Button variant="secondary" size="sm" busy={act.busy} onClick={() => act.run(p.id, "restore")}>
                Restore
              </Button>
              <Button variant="danger" size="sm" busy={act.busy} onClick={() => act.run(p.id, "remove")}>
                Remove
              </Button>
            </div>
          </div>
          {reports.length > 0 && (
            <ul className="list-plain report-list">
              {reports.map((r) => (
                <li key={r.id} className="t-13">
                  <b>{REASON[r.reason] ?? r.reason}</b> · {r.reporter.name}
                  {!r.counts && <span className="muted"> (not counted: new or unconfirmed account)</span>} · {timeAgo(r.createdAt)}
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
  const ban = useAction(async (u: AdminUser) => {
    if (!u.bannedAt && !confirm(`Ban ${u.email}? Their sessions end and their products are hidden.`)) return;
    await post(`/admin/users/${u.id}/${u.bannedAt ? "unban" : "ban"}`, {});
    setUsers((us) => us?.map((x) => (x.id === u.id ? { ...x, bannedAt: u.bannedAt ? null : Math.floor(Date.now() / 1000) } : x)) ?? null);
  });
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
                    {u.role !== "admin" && (
                      <Button variant={u.bannedAt ? "secondary" : "danger"} size="sm" onClick={() => ban.run(u)}>
                        {u.bannedAt ? "Unban" : "Ban"}
                      </Button>
                    )}
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
