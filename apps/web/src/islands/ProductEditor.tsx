import { useEffect, useState } from "react";
import { PERK_TYPES } from "@tm/shared/enums";
import type { CategoryDTO, FeedbackDTO, MakerProductDetailDTO, Page, PerkMakerDTO, PerkType, QualityChecksDTO, RoadmapItemDTO, RoadmapStatus, StatsDTO } from "@tm/shared";
import { en } from "@tm/shared/copy";
import { ClientError, del, get, patch, post, put, toast } from "../lib/client";
import { FEEDBACK_TYPE_LABEL, PERK_TYPE_LABEL, ROADMAP_LABEL, timeAgo } from "../lib/format";
import { Check, ExternalLink, Plus, Trash2, X } from "./icons";
import ProductForm, { toPayload, type ProductFormValue } from "./ProductForm";
import { Button, Empty, Field, Notice, Segmented, useAction } from "./ui";

type Tab = "details" | "perks" | "feedback" | "roadmap" | "stats";
const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "perks", label: "Perks" },
  { id: "feedback", label: "Feedback" },
  { id: "roadmap", label: "Roadmap" },
  { id: "stats", label: "Stats" },
];

interface Props {
  product: MakerProductDetailDTO;
  categories: CategoryDTO[];
  justPublished: boolean;
  initialTab?: Tab;
}

export default function ProductEditor({ product, categories, justPublished, initialTab }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab ?? (justPublished ? "perks" : "details"));
  useEffect(() => {
    const fromHash = location.hash.slice(1) as Tab;
    if (TABS.some((t) => t.id === fromHash)) setTab(fromHash);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  };

  return (
    <div className="stack-24">
      {justPublished && (
        <Notice kind="success">
          <span>
            <b>{product.title}</b> is live.{" "}
            <a className="link" href={`/p/${product.slug}`}>
              See the page
            </a>
            . Want to reward early users? Add a perk below (optional).
          </span>
        </Notice>
      )}
      {product.status === "hidden" && (
        <Notice kind="warning">
          <span>This product is hidden while an admin reviews reports about it. You can still edit it.</span>
        </Notice>
      )}
      <div className="spread" style={{ alignItems: "flex-end" }}>
        <div className="stack-4">
          <h1 className="t-32">{product.title}</h1>
          <div className="row t-13 muted">
            <span className="status" data-status={product.status}>
              {product.status === "live" ? "Live" : product.status === "hidden" ? "Under review" : "Removed"}
            </span>
            <span>·</span>
            <a className="link" href={`/p/${product.slug}`} target="_blank" rel="noopener">
              View public page <ExternalLink size={12} style={{ display: "inline", verticalAlign: -1 }} />
            </a>
          </div>
        </div>
      </div>
      {product.status === "live" && <QualityChecklist quality={product.quality} />}
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => go(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "details" && <Details product={product} categories={categories} />}
        {tab === "perks" && <Perks productId={product.id} initial={product.perksFull} />}
        {tab === "feedback" && <FeedbackTab product={product} />}
        {tab === "roadmap" && <RoadmapTab product={product} />}
        {tab === "stats" && <Stats productId={product.id} />}
      </div>
    </div>
  );
}

/* Quality conditions for Top and Trending (the score itself is never shown) */

function QualityChecklist({ quality }: { quality: QualityChecksDTO }) {
  const c = en.makers.checklist;
  const items: [boolean, string][] = [
    [quality.link, c.link],
    [quality.image, c.image],
    [quality.description, c.description],
    [quality.tagline, c.tagline],
    [quality.noOpenReview, c.noOpenReview],
  ];
  return (
    <section className="box-surface stack-8" aria-labelledby="quality-title">
      <h2 id="quality-title" className="t-15 w-600">
        {c.title}
      </h2>
      <ul className="list-plain quality-list">
        {items.map(([ok, label]) => (
          <li key={label} data-ok={ok}>
            {ok ? <Check size={15} aria-hidden="true" /> : <X size={15} aria-hidden="true" />}
            <span>{label}</span>
            <span className="visually-hidden">{ok ? "(done)" : "(missing)"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Details */

function Details({ product, categories }: { product: MakerProductDetailDTO; categories: CategoryDTO[] }) {
  const [form, setForm] = useState<ProductFormValue>({
    title: product.title,
    tagline: product.tagline,
    description: product.description,
    categories: product.categories.map((c) => c.slug),
    stage: product.stage,
    pricing: product.pricing,
    feedbackMode: product.feedbackMode,
    roadmapEnabled: product.roadmapEnabled,
    images: product.images,
    hasAi: product.hasAi,
    platforms: product.platforms,
  });
  const save = useAction(
    async () => {
      await patch(`/maker/products/${product.id}`, toPayload(form));
      toast("Saved. The public page updates within a minute.");
    },
    { silent: false },
  );
  const remove = useAction(async () => {
    if (!confirm(`Delete “${product.title}”? This can't be undone.`)) return;
    await del(`/maker/products/${product.id}`);
    location.href = "/dashboard";
  });
  return (
    <form
      className="stack-32"
      onSubmit={(e) => {
        e.preventDefault();
        save.run();
      }}
    >
      <Field label="Link">
        <div className="row row-wrap">
          <span className="mono t-15">{product.url}</span>
          <span className="t-13 muted">(the link can't be changed; delete and republish to move it)</span>
        </div>
      </Field>
      <ProductForm value={form} onChange={setForm} categories={categories} error={save.error} />
      <div className="spread publish-foot">
        <Button type="button" variant="danger" busy={remove.busy} onClick={() => remove.run()}>
          <Trash2 size={16} /> Delete product
        </Button>
        <Button type="submit" variant="dark" size="lg" busy={save.busy} disabled={form.categories.length === 0}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

/* Perks */

interface PerkDraft {
  id?: string;
  type: PerkType;
  title: string;
  details: string;
  sharedCode: string;
  redeemUrl: string;
  maxClaims: string;
  expiresAt: string;
  active: boolean;
  newCodes: string;
  claimCount: number;
  codesLeft: number;
  codesTotal: number;
}

function toDraft(p: PerkMakerDTO): PerkDraft {
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    details: p.details ?? "",
    sharedCode: p.sharedCode ?? "",
    redeemUrl: p.redeemUrl ?? "",
    maxClaims: p.maxClaims ? String(p.maxClaims) : "",
    expiresAt: p.expiresAt ? new Date(p.expiresAt * 1000).toISOString().slice(0, 10) : "",
    active: p.active,
    newCodes: "",
    claimCount: p.claimCount,
    codesLeft: p.codesLeft,
    codesTotal: p.codesTotal,
  };
}

const PERK_HINTS: Record<PerkType, string> = {
  free_trial: "A trial anyone can start from your redeem link.",
  extended_trial: "A longer trial than usual, for members only.",
  discount: "A percentage off; add the code people should use.",
  coupon: "One code shared by everyone who claims it.",
  unique_codes: "Paste a list; each member gets their own code.",
};

function Perks({ productId, initial }: { productId: string; initial: PerkMakerDTO[] }) {
  const [perks, setPerks] = useState<PerkDraft[]>(initial.map(toDraft));
  const update = (i: number, patchObj: Partial<PerkDraft>) => setPerks((ps) => ps.map((p, j) => (j === i ? { ...p, ...patchObj } : p)));
  const add = () =>
    setPerks((ps) => [
      ...ps,
      { type: "extended_trial", title: "", details: "", sharedCode: "", redeemUrl: "", maxClaims: "", expiresAt: "", active: true, newCodes: "", claimCount: 0, codesLeft: 0, codesTotal: 0 },
    ]);
  const save = useAction(async () => {
    const untitled = perks.findIndex((p) => !p.title.trim());
    if (untitled >= 0) throw new ClientError(0, "VALIDATION", `Give perk ${untitled + 1} a title.`);
    const noCode = perks.find((p) => p.type === "coupon" && !p.sharedCode.trim());
    if (noCode) throw new ClientError(0, "VALIDATION", `Add the coupon code for “${noCode.title.trim()}”.`);
    const noCodes = perks.find((p) => p.type === "unique_codes" && !p.id && !p.newCodes.trim());
    if (noCodes) throw new ClientError(0, "VALIDATION", `Add at least one code for “${noCodes.title.trim()}”.`);
    const body = {
      perks: perks.map((p) => ({
        id: p.id,
        type: p.type,
        title: p.title.trim(),
        details: p.details.trim() || null,
        sharedCode: p.sharedCode.trim() || null,
        redeemUrl: p.redeemUrl.trim() || null,
        maxClaims: p.maxClaims ? Number(p.maxClaims) : null,
        expiresAt: p.expiresAt ? Math.floor(new Date(`${p.expiresAt}T23:59:59Z`).getTime() / 1000) : null,
        active: p.active,
        codes: p.type === "unique_codes" ? p.newCodes.split(/\r?\n|,/).map((c) => c.trim()).filter(Boolean) : undefined,
      })),
    };
    const res = await put<{ items: PerkMakerDTO[] }>(`/maker/products/${productId}/perks`, body);
    setPerks(res.items.map(toDraft));
    toast("Perks saved.");
  });

  return (
    <div className="stack-24">
      <p className="muted" style={{ maxWidth: 640 }}>
        Perks are the main reason people create an account. Visitors see that a perk exists; members claim it and get the code or link. The claim count shows on each perk and in Stats.
      </p>
      {perks.length === 0 && (
        <Empty title="No perks yet" text="Offer an extended trial, a discount or unique codes to early users.">
          <Button variant="dark" onClick={add}>
            <Plus size={16} /> Add a perk
          </Button>
        </Empty>
      )}
      {perks.map((p, i) => (
        <fieldset className="box stack-16" key={p.id ?? `new-${i}`} style={{ marginInline: 0, marginBottom: 0, minWidth: 0 }}>
          <div className="spread">
            <legend className="w-600">{p.title || "New perk"}</legend>
            <div className="row">
              {p.id && <span className="t-13 muted nowrap">{p.claimCount} claimed</span>}
              <Button type="button" variant="ghost" size="sm" aria-label="Remove perk" onClick={() => setPerks((ps) => ps.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
          <div className="form-grid-2">
            <Field label="Type" hint={PERK_HINTS[p.type]}>
              <select className="select" value={p.type} onChange={(e) => update(i, { type: e.target.value as PerkType })}>
                {PERK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PERK_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title" hint="Example: 60 days of Pro, free">
              <input className="input" value={p.title} maxLength={80} onChange={(e) => update(i, { title: e.target.value })} required />
            </Field>
          </div>
          <Field label="Details (optional)">
            <input className="input" value={p.details} maxLength={500} onChange={(e) => update(i, { details: e.target.value })} placeholder="Who it's for, how to use it" />
          </Field>
          <div className="form-grid-2">
            {(p.type === "coupon" || p.type === "discount") && (
              <Field label={p.type === "coupon" ? "Coupon code" : "Discount code (optional)"}>
                <input className="input mono" value={p.sharedCode} maxLength={80} onChange={(e) => update(i, { sharedCode: e.target.value })} required={p.type === "coupon"} />
              </Field>
            )}
            <Field label="Redeem link (optional)" hint="Where members use the perk.">
              <input className="input" type="url" value={p.redeemUrl} onChange={(e) => update(i, { redeemUrl: e.target.value })} placeholder="https://myapp.com/redeem" />
            </Field>
          </div>
          {p.type === "unique_codes" && (
            <Field label="Add codes" hint={p.id ? `${p.codesLeft} of ${p.codesTotal} codes left. New codes are added to the list.` : "One code per line."}>
              <textarea className="textarea mono" value={p.newCodes} onChange={(e) => update(i, { newCodes: e.target.value })} placeholder={"CODE-0001\nCODE-0002"} />
            </Field>
          )}
          <div className="form-grid-3">
            <Field label="Max claims (optional)">
              <input className="input" type="number" min={1} value={p.maxClaims} onChange={(e) => update(i, { maxClaims: e.target.value })} />
            </Field>
            <Field label="Expires (optional)">
              <input className="input" type="date" value={p.expiresAt} onChange={(e) => update(i, { expiresAt: e.target.value })} />
            </Field>
            <Field label="Status">
              <label className="checkbox" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={p.active} onChange={(e) => update(i, { active: e.target.checked })} /> Active
              </label>
            </Field>
          </div>
        </fieldset>
      ))}
      {perks.length > 0 && (
        <div className="spread publish-foot">
          <Button type="button" variant="secondary" onClick={add} disabled={perks.length >= 10}>
            <Plus size={16} /> Add another perk
          </Button>
          <Button type="button" variant="dark" busy={save.busy} onClick={() => save.run()}>
            Save perks
          </Button>
        </div>
      )}
      {perks.length === 0 && initial.length > 0 && (
        <Button type="button" variant="dark" busy={save.busy} onClick={() => save.run()}>
          Save (remove all perks)
        </Button>
      )}
    </div>
  );
}

/* Feedback */

function FeedbackTab({ product }: { product: MakerProductDetailDTO }) {
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [items, setItems] = useState<FeedbackDTO[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const load = useAction(async (f: typeof filter, after?: string | null) => {
    const q = new URLSearchParams();
    if (f !== "all") q.set("filter", f);
    if (after) q.set("cursor", after);
    const page = await get<Page<FeedbackDTO>>(`/products/${product.id}/feedback?${q}`);
    setItems((x) => (after && x ? [...x, ...page.items] : page.items));
    setCursor(page.nextCursor);
  });
  useEffect(() => {
    load.run(filter);
  }, [filter]);

  if (product.feedbackMode === "off") {
    return (
      <Notice>
        <span>Feedback is off for this product. Turn it on in Details to get a feedback form on your page.</span>
      </Notice>
    );
  }
  return (
    <div className="stack-16">
      <Segmented
        label="Filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "open", label: "Open" },
          { value: "resolved", label: "Resolved" },
          { value: "all", label: "All" },
        ]}
      />
      {items === null && <p className="muted">Loading…</p>}
      {items && items.length === 0 && <Empty title={filter === "open" ? "Inbox zero" : "Nothing here"} text="New feedback from users appears here." />}
      <ul className="list-plain">
        {items?.map((f) => (
          <FeedbackRow key={f.id} f={f} product={product} onChange={(nf) => setItems((xs) => xs?.map((x) => (x.id === nf.id ? nf : x)) ?? null)} />
        ))}
      </ul>
      {cursor && (
        <Button variant="secondary" busy={load.busy} onClick={() => load.run(filter, cursor)}>
          Load more
        </Button>
      )}
    </div>
  );
}

function FeedbackRow({ f, product, onChange }: { f: FeedbackDTO; product: MakerProductDetailDTO; onChange: (f: FeedbackDTO) => void }) {
  const [reply, setReply] = useState(f.makerReply ?? "");
  const [open, setOpen] = useState(false);
  const send = useAction(async () => {
    await post(`/feedback/${f.id}/reply`, { reply });
    onChange({ ...f, makerReply: reply });
    setOpen(false);
    toast("Reply sent. The author gets a notification.");
  });
  const resolve = useAction(async () => {
    const r = await post<{ resolvedAt: number | null }>(`/feedback/${f.id}/resolve`, { resolved: !f.resolvedAt });
    onChange({ ...f, resolvedAt: r.resolvedAt });
  });
  const toRoadmap = useAction(async () => {
    const item = await post<RoadmapItemDTO>(`/products/${product.id}/roadmap`, { title: f.body.slice(0, 120), fromFeedbackId: f.id });
    onChange({ ...f, roadmapItemId: item.id });
    toast("Added to the roadmap as Planned.");
  });
  return (
    <li className="feedback-item">
      <div className="spread">
        <div className="row">
          <span className="w-600">{f.author?.name ?? en.deletedUser}</span>
          <span className="t-13 muted">{timeAgo(f.createdAt)}</span>
          {!f.isPublic && <span className="t-13 muted">· Private</span>}
        </div>
        <span className="type-label" data-type={f.type}>
          {FEEDBACK_TYPE_LABEL[f.type]}
        </span>
      </div>
      <p style={{ marginTop: 8, whiteSpace: "pre-line" }}>{f.body}</p>
      {f.makerReply && !open && (
        <div className="reply">
          <div className="t-13 w-600">Your reply</div>
          <p style={{ marginTop: 4, whiteSpace: "pre-line" }}>{f.makerReply}</p>
        </div>
      )}
      {open && (
        <div className="stack-8" style={{ marginTop: 12 }}>
          <textarea className="textarea" style={{ minHeight: 90 }} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} autoFocus />
          <div className="row">
            <Button variant="dark" size="sm" busy={send.busy} disabled={!reply.trim()} onClick={() => send.run()}>
              Send reply
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <div className="row row-wrap" style={{ marginTop: 12 }}>
        {!open && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            {f.makerReply ? "Edit reply" : "Reply"}
          </Button>
        )}
        <Button variant="secondary" size="sm" busy={resolve.busy} onClick={() => resolve.run()}>
          {f.resolvedAt ? "Reopen" : "Mark resolved"}
        </Button>
        {f.type === "idea" && !f.roadmapItemId && (
          <Button variant="ghost" size="sm" busy={toRoadmap.busy} onClick={() => toRoadmap.run()}>
            Add to roadmap
          </Button>
        )}
        {f.roadmapItemId && <span className="t-13 muted">On the roadmap</span>}
      </div>
    </li>
  );
}

/* Roadmap */

function RoadmapTab({ product }: { product: MakerProductDetailDTO }) {
  const [items, setItems] = useState<RoadmapItemDTO[] | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    get<{ items: RoadmapItemDTO[] }>(`/products/${product.id}/roadmap`)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [product.id]);
  const add = useAction(async () => {
    const item = await post<RoadmapItemDTO>(`/products/${product.id}/roadmap`, { title, description: description || null });
    setItems((xs) => [...(xs ?? []), item]);
    setTitle("");
    setDescription("");
  });
  const setStatus = useAction(async (id: string, status: RoadmapStatus) => {
    await patch(`/products/${product.id}/roadmap/${id}`, { status });
    setItems((xs) => xs?.map((x) => (x.id === id ? { ...x, status } : x)) ?? null);
    if (status === "shipped") toast("Marked as shipped. Whoever suggested it gets a notification.");
  });
  const remove = useAction(async (id: string) => {
    if (!confirm("Delete this item and its votes?")) return;
    await del(`/products/${product.id}/roadmap/${id}`);
    setItems((xs) => xs?.filter((x) => x.id !== id) ?? null);
  });

  return (
    <div className="stack-24">
      {!product.roadmapEnabled && (
        <Notice>
          <span>The roadmap is hidden from your page. Adding an item turns it on.</span>
        </Notice>
      )}
      <form
        className="box stack-12"
        onSubmit={(e) => {
          e.preventDefault();
          add.run();
        }}
      >
        <div className="w-600">Add an item</div>
        <input className="input" placeholder="What are you building?" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} required />
        <input className="input" placeholder="Short description (optional)" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
        <div>
          <Button type="submit" variant="dark" busy={add.busy}>
            <Plus size={16} /> Add as planned
          </Button>
        </div>
      </form>
      {items === null && <p className="muted">Loading…</p>}
      {items && items.length === 0 && <Empty title="No roadmap items" text="Add what you're planning, or turn feedback ideas into items." />}
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table className="table table-stack">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Votes</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <div className="w-600">{i.title}</div>
                    {i.description && <div className="t-13 muted">{i.description}</div>}
                  </td>
                  <td className="num" data-label="Votes">
                    {i.voteCount}
                  </td>
                  <td>
                    <select className="select" style={{ width: 150 }} value={i.status} onChange={(e) => setStatus.run(i.id, e.target.value as RoadmapStatus)} aria-label="Status">
                      {(["planned", "in_progress", "shipped"] as const).map((s) => (
                        <option key={s} value={s}>
                          {ROADMAP_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <Button variant="ghost" size="sm" aria-label="Delete item" onClick={() => remove.run(i.id)}>
                      <Trash2 size={14} />
                    </Button>
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

/* Stats */

function Stats({ productId }: { productId: string }) {
  const [stats, setStats] = useState<(StatsDTO & { openFeedback: number }) | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    get<StatsDTO & { openFeedback: number }>(`/maker/products/${productId}/stats`)
      .then(setStats)
      .catch(() => setFailed(true));
  }, [productId]);
  if (failed) return <Notice kind="danger">Stats couldn't be loaded.</Notice>;
  if (!stats) return <p className="muted">Loading…</p>;
  const ctr = stats.views ? Math.round((stats.clicks / stats.views) * 1000) / 10 : 0;
  const items = [
    { n: stats.views, l: "Page views" },
    { n: stats.clicks, l: `Link clicks · ${ctr}%` },
    { n: stats.saves, l: "Saves" },
    { n: stats.perkClaims, l: "Perks claimed" },
    { n: stats.feedback, l: `Feedback · ${stats.openFeedback} open` },
    { n: stats.roadmapVotes, l: "Roadmap votes" },
  ];
  return (
    <div className="stack-16">
      <div className="stats">
        {items.map((s) => (
          <div className="stat" key={s.l}>
            <div className="n">{s.n.toLocaleString("en-US")}</div>
            <div className="l">{s.l}</div>
          </div>
        ))}
      </div>
      <p className="t-13 muted">Views and clicks are counted in batches and can lag a few minutes behind.</p>
    </div>
  );
}
