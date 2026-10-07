import { useState } from "react";
import type { CategoryDTO, ProductPreviewDTO } from "@tm/shared";
import { post } from "../lib/client";
import { ArrowLeft } from "./icons";
import ProductForm, { toPayload, type ProductFormValue } from "./ProductForm";
import { Button, Field, Notice, useAction, useTurnstile } from "./ui";

interface Props {
  categories: CategoryDTO[];
  domains: string[];
}

export default function PublishFlow({ categories, domains }: Props) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<ProductPreviewDTO | null>(null);
  const [form, setForm] = useState<ProductFormValue | null>(null);
  const turnstile = useTurnstile();

  const fetchPreview = useAction(
    async () => {
      const token = await turnstile.getToken();
      const p = await post<ProductPreviewDTO>("/maker/products/preview", { url, turnstileToken: token });
      setPreview(p);
      setForm({
        title: p.title,
        tagline: p.tagline,
        description: p.description,
        categories: [],
        stage: "launched",
        pricing: "freemium",
        feedbackMode: "public",
        roadmapEnabled: false,
        images: p.images,
      });
    },
    { silent: true },
  );

  const publish = useAction(
    async () => {
      if (!preview || !form) return;
      const res = await post<{ id: string; slug: string }>("/maker/products", { url: preview.normalizedUrl, ...toPayload(form) });
      location.href = `/dashboard/p/${res.id}?published=1`;
    },
    { silent: true },
  );

  const onLink = (e: { preventDefault(): void }) => {
    e.preventDefault();
    fetchPreview.run();
  };

  if (!preview || !form) {
    const err = fetchPreview.error;
    return (
      <div className="stack-24">
        <ol className="steps">
          <li aria-current="step">Link</li>
          <li>Details</li>
          <li>Live</li>
        </ol>
        <div className="stack-8">
          <h1 className="t-32">Publish a product</h1>
          <p className="t-17 muted">Paste the link to your product. We'll read the page and fill in the name, description and image for you.</p>
        </div>
        <form className="stack-16" onSubmit={onLink}>
          <Field label="Product link" htmlFor="pub-url" hint={domains.length ? `Verified: ${domains.join(", ")} (and their subdomains).` : undefined}>
            <input id="pub-url" className="input input-lg" type="url" inputMode="url" placeholder="https://myapp.com" value={url} onChange={(e) => setUrl(e.target.value)} required autoFocus />
          </Field>
          {turnstile.element}
          {err && (
            <Notice kind="danger">
              <span>
                {err.message}{" "}
                {err.code === "DUPLICATE_URL" && err.existing && (
                  <a className="link" href={err.existing}>
                    See the listing
                  </a>
                )}
                {err.code === "DOMAIN_NOT_VERIFIED" && (
                  <a className="link" href="/dashboard/domains">
                    Verify a domain
                  </a>
                )}
              </span>
            </Notice>
          )}
          <div>
            <Button type="submit" variant="dark" size="lg" busy={fetchPreview.busy}>
              {fetchPreview.busy ? "Reading your page…" : "Continue"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  const err = publish.error;
  return (
    <form
      className="stack-32"
      onSubmit={(e) => {
        e.preventDefault();
        publish.run();
      }}
    >
      <div className="stack-16">
        <ol className="steps">
          <li>Link</li>
          <li aria-current="step">Details</li>
          <li>Live</li>
        </ol>
        <button type="button" className="btn-text t-13 muted row" onClick={() => setPreview(null)}>
          <ArrowLeft size={14} /> Change link
        </button>
        <div className="stack-8">
          <h1 className="t-32">Check the details</h1>
          <p className="muted">
            For <span className="mono">{preview.normalizedUrl}</span>. Everything can be edited later.
          </p>
        </div>
      </div>
      <ProductForm value={form} onChange={setForm} categories={categories} error={err} />
      {err && !err.fields && <Notice kind="danger">{err.message}</Notice>}
      {err?.fields && Object.keys(err.fields).length > 0 && <Notice kind="danger">Fix the highlighted fields and try again.</Notice>}
      <div className="spread publish-foot">
        <span className="t-13 muted">Your product goes live right away and appears in the feeds of people who follow its categories.</span>
        <Button type="submit" variant="primary" size="lg" busy={publish.busy} disabled={form.categories.length === 0}>
          Publish now
        </Button>
      </div>
    </form>
  );
}
