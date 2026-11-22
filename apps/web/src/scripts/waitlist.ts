/*
 * The waitlist form (components/Waitlist.astro). Campaign tags and the share code are read from the
 * page address when the form is sent; nothing is stored in the browser. All text comes from the HTML.
 */
import { track } from "../lib/analytics";
import { ClientError, call, turnstileToken } from "../lib/client";

const UTM = ["source", "medium", "campaign", "content"] as const;
const INTERESTS_MAX = 5;

const form = document.querySelector<HTMLFormElement>("#wl-form");
if (form) init(form);

function init(form: HTMLFormElement) {
  const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const email = $<HTMLInputElement>("#wl-email");
  const error = $<HTMLParagraphElement>("#wl-error");
  const sent = $<HTMLDivElement>("#wl-sent");
  const shareLink = $<HTMLInputElement>("#wl-share-link");
  const copy = $<HTMLButtonElement>("#wl-copy");
  const copyLabel = copy.textContent;
  const chips = [...form.querySelectorAll<HTMLButtonElement>("[data-category]")];

  const role = () => form.querySelector<HTMLInputElement>('input[name="role"]:checked')?.value === "maker" ? "maker" : "explorer";
  const applyRole = () => {
    const r = role();
    form.dataset.role = r;
    for (const el of form.querySelectorAll<HTMLElement>("[data-for]")) el.hidden = el.dataset.for !== r;
    submit.textContent = submit.dataset[r] ?? submit.textContent;
  };
  form.addEventListener("change", (e) => {
    if ((e.target as HTMLInputElement).name === "role") applyRole();
  });
  // The browser may restore the maker option on back/forward.
  applyRole();

  const picked = () => chips.filter((c) => c.getAttribute("aria-pressed") === "true");
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true"));
      const full = picked().length >= INTERESTS_MAX;
      for (const c of chips) c.disabled = full && c.getAttribute("aria-pressed") !== "true";
    });
  }

  const showError = (text: string | undefined) => {
    error.textContent = text ?? "";
    error.hidden = !text;
  };
  email.addEventListener("input", () => {
    email.removeAttribute("aria-invalid");
    showError(undefined);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submit.getAttribute("aria-busy") === "true") return;
    const address = email.value.trim();
    if (!address || !email.checkValidity()) {
      email.setAttribute("aria-invalid", "true");
      showError(error.dataset.email);
      email.focus();
      return;
    }
    showError(undefined);

    const params = new URLSearchParams(location.search);
    const utm: Record<string, string> = {};
    for (const k of UTM) {
      const v = params.get(`utm_${k}`)?.trim();
      if (v) utm[k] = v.slice(0, 100);
    }
    const r = role();
    const category = $<HTMLSelectElement>("#wl-category").value;
    const body = {
      email: address,
      role: r,
      interests: r === "explorer" ? picked().map((c) => c.dataset.category!) : category ? [category] : [],
      productUrl: r === "maker" ? $<HTMLInputElement>("#wl-url").value.trim() || null : null,
      foundVia: $<HTMLSelectElement>("#wl-found").value || null,
      utm: Object.keys(utm).length ? utm : null,
      ref: params.get("ref")?.trim().slice(0, 32) || null,
      turnstileToken: null as string | null,
    };

    submit.setAttribute("aria-busy", "true");
    try {
      body.turnstileToken = (await turnstileToken($<HTMLDivElement>("#wl-turnstile"))) ?? null;
      const { refCode } = await call<{ refCode: string }>("POST", "/waitlist", body);
      // No email or URL: PostHog gets only the shape of the sign-up (docs/ANALYTICS.md).
      track("waitlist_joined", {
        role: r,
        interests_count: body.interests.length,
        has_product_url: Boolean(body.productUrl),
        found_via: body.foundVia,
        referred: Boolean(body.ref),
      });
      const variant = r === "maker" ? "maker" : body.interests.length ? "explorer" : "explorerNoCategories";
      for (const p of sent.querySelectorAll<HTMLElement>("[data-variant]")) p.hidden = p.dataset.variant !== variant;
      shareLink.value = `${sent.dataset.site}/?ref=${refCode}`;
      form.hidden = true;
      sent.hidden = false;
      sent.focus();
    } catch (err) {
      const code = err instanceof ClientError ? err.code : "";
      track("waitlist_failed", { role: r, code: code || "NETWORK" });
      if (code === "VALIDATION") email.setAttribute("aria-invalid", "true");
      showError(code === "VALIDATION" ? error.dataset.email : code === "RATE_LIMITED" ? error.dataset.rate : error.dataset.generic);
    } finally {
      submit.removeAttribute("aria-busy");
    }
  });

  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareLink.value);
    } catch {
      // No clipboard access (some in-app browsers): leave the link selected to copy by hand.
      shareLink.select();
      return;
    }
    track("waitlist_share_copied", { role: role() });
    copy.textContent = copy.dataset.copied!;
    setTimeout(() => (copy.textContent = copyLabel), 2000);
  });

  $<HTMLButtonElement>("#wl-restart").addEventListener("click", () => {
    sent.hidden = true;
    form.hidden = false;
    email.focus();
    email.select();
  });
}
