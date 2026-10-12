import { useEffect, useRef, useState } from "react";
import type { CategoryDTO, FeedbackMode, ImageDTO, Pricing, Stage } from "@tm/shared";
import { DESCRIPTION_MAX, TAGLINE_MAX, TITLE_MAX } from "@tm/shared/limits";
import { call, errorMessage, toast } from "../lib/client";
import { ArrowLeft, ArrowRight, Check, ImagePlus, X } from "./icons";
import { Field, Segmented, Spinner, fieldError, useAdoptTyped } from "./ui";
import type { ClientError } from "../lib/client";

export interface ProductFormValue {
  title: string;
  tagline: string;
  description: string;
  categories: string[];
  stage: Stage;
  pricing: Pricing;
  feedbackMode: FeedbackMode;
  roadmapEnabled: boolean;
  images: ImageDTO[];
}

interface Props {
  value: ProductFormValue;
  onChange: (v: ProductFormValue) => void;
  categories: CategoryDTO[];
  error: ClientError | null;
}

const MAX_IMAGES = 6;

export function toPayload(v: ProductFormValue) {
  return {
    title: v.title.trim(),
    tagline: v.tagline.trim(),
    description: v.description.trim(),
    categories: v.categories,
    stage: v.stage,
    pricing: v.pricing,
    feedbackMode: v.feedbackMode,
    roadmapEnabled: v.roadmapEnabled,
    images: v.images.map((i) => ({ key: i.key })),
  };
}

export default function ProductForm({ value: v, onChange, categories, error }: Props) {
  const set = <K extends keyof ProductFormValue>(k: K, val: ProductFormValue[K]) => onChange({ ...v, [k]: val });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // In the editor these fields are server-rendered: keep edits made before the page finished loading.
  const early = useRef<Partial<ProductFormValue>>({});
  useAdoptTyped({
    "pf-title": (title) => (early.current.title = title),
    "pf-tagline": (tagline) => (early.current.tagline = tagline),
    "pf-desc": (description) => (early.current.description = description),
  });
  useEffect(() => {
    if (Object.keys(early.current).length) onChange({ ...v, ...early.current });
  }, []);

  const toggleCategory = (slug: string) => {
    if (v.categories.includes(slug)) set("categories", v.categories.filter((c) => c !== slug));
    else if (v.categories.length < 3) set("categories", [...v.categories, slug]);
  };

  const move = (i: number, dir: -1 | 1) => {
    const imgs = [...v.images];
    const j = i + dir;
    if (j < 0 || j >= imgs.length) return;
    [imgs[i], imgs[j]] = [imgs[j]!, imgs[i]!];
    set("images", imgs);
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const added: ImageDTO[] = [];
    try {
      for (const file of Array.from(files).slice(0, MAX_IMAGES - v.images.length)) {
        if (file.size > 5 * 1024 * 1024) {
          toast(`${file.name} is larger than 5 MB.`, "error");
          continue;
        }
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
          toast(`${file.name}: use JPG, PNG or WebP.`, "error");
          continue;
        }
        const form = new FormData();
        form.append("file", file);
        added.push(await call<ImageDTO>("POST", "/maker/uploads", form));
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (added.length) onChange({ ...v, images: [...v.images, ...added] });
    }
  };

  const taglineOver = v.tagline.length > TAGLINE_MAX;

  return (
    <div className="stack-24">
      <Field label="Name" htmlFor="pf-title" error={fieldError(error, "title")}>
        <input id="pf-title" className="input input-lg" value={v.title} maxLength={TITLE_MAX} onChange={(e) => set("title", e.target.value)} required />
      </Field>

      <Field
        label="Tagline"
        htmlFor="pf-tagline"
        error={fieldError(error, "tagline")}
        hint="One line that says what it does. Shown everywhere your product appears."
        aside={
          <span className="char-count" data-over={taglineOver}>
            {v.tagline.length}/{TAGLINE_MAX}
          </span>
        }
      >
        <input id="pf-tagline" className="input" value={v.tagline} onChange={(e) => set("tagline", e.target.value)} aria-invalid={taglineOver} required />
      </Field>

      <Field label="Description" htmlFor="pf-desc" error={fieldError(error, "description")} hint="Plain text with **bold**, *italic*, - lists, ## headings and [links](https://…).">
        <textarea id="pf-desc" className="textarea" style={{ minHeight: 180 }} value={v.description} maxLength={DESCRIPTION_MAX} onChange={(e) => set("description", e.target.value)} required />
      </Field>

      <Field label={`Categories (${v.categories.length}/3)`} error={fieldError(error, "categories")} hint="Pick one to three. Your product shows up in these feeds.">
        <div className="row row-wrap" style={{ gap: 8 }}>
          {categories.map((c) => {
            const on = v.categories.includes(c.slug);
            return (
              <button
                key={c.slug}
                type="button"
                className="chip chip-toggle"
                style={{ height: 34, fontSize: 14 }}
                aria-pressed={on}
                disabled={!on && v.categories.length >= 3}
                onClick={() => toggleCategory(c.slug)}
              >
                {on && <Check size={14} aria-hidden="true" />}
                {c.name}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label={`Images (${v.images.length}/${MAX_IMAGES})`} hint="The first image is the cover (16:10 works best). JPG, PNG or WebP up to 5 MB.">
        <div className="image-picker">
          {v.images.map((img, i) => (
            <div className="slot" key={img.key}>
              <img src={img.url} alt="" />
              {i === 0 && <span className="first">Cover</span>}
              <div className="tools">
                <button type="button" aria-label="Move left" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowLeft />
                </button>
                <button type="button" aria-label="Move right" onClick={() => move(i, 1)} disabled={i === v.images.length - 1}>
                  <ArrowRight />
                </button>
                <button type="button" aria-label="Remove image" onClick={() => set("images", v.images.filter((_, j) => j !== i))}>
                  <X />
                </button>
              </div>
            </div>
          ))}
          {v.images.length < MAX_IMAGES && (
            <label className="add">
              {uploading ? <Spinner /> : <ImagePlus size={20} aria-hidden="true" />}
              <span>{uploading ? "Uploading…" : "Add images"}</span>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="visually-hidden" onChange={(e) => upload(e.target.files)} disabled={uploading} />
            </label>
          )}
        </div>
      </Field>

      <div className="form-grid-2">
        <Field label="Stage">
          <Segmented<Stage>
            label="Stage"
            value={v.stage}
            onChange={(x) => set("stage", x)}
            options={[
              { value: "beta", label: "Beta" },
              { value: "launched", label: "Launched" },
            ]}
          />
        </Field>
        <Field label="Pricing">
          <Segmented<Pricing>
            label="Pricing"
            value={v.pricing}
            onChange={(x) => set("pricing", x)}
            options={[
              { value: "free", label: "Free" },
              { value: "freemium", label: "Freemium" },
              { value: "paid", label: "Paid" },
            ]}
          />
        </Field>
      </div>

      <div className="form-grid-2">
        <Field label="Feedback" hint={v.feedbackMode === "public" ? "Anyone can read it; you can reply." : v.feedbackMode === "private" ? "Only you see what people send." : "No feedback form on your page."}>
          <Segmented<FeedbackMode>
            label="Feedback"
            value={v.feedbackMode}
            onChange={(x) => set("feedbackMode", x)}
            options={[
              { value: "public", label: "Public" },
              { value: "private", label: "Private" },
              { value: "off", label: "Off" },
            ]}
          />
        </Field>
        <Field label="Roadmap" hint="Members vote on what you build next.">
          <label className="checkbox">
            <input type="checkbox" checked={v.roadmapEnabled} onChange={(e) => set("roadmapEnabled", e.target.checked)} />
            Show a public roadmap
          </label>
        </Field>
      </div>
    </div>
  );
}
