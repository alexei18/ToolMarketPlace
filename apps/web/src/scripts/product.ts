/* Product page behaviors: view counting, personal state, perk claiming, gallery, report dialog. */
import type { PerkPublicDTO, ViewerProductStateDTO } from "@tm/shared";
import { beacon, ClientError, del, errorMessage, getMe, goToLogin, hasSession, post, put, toast, turnstileToken } from "../lib/client";
import { setSaveButton } from "./global";

const root = document.querySelector<HTMLElement>("[data-product]");
const productId = root?.dataset.product;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function renderClaimed(perkId: string, code: string | null | undefined, redeemUrl: string | null | undefined) {
  const li = document.querySelector<HTMLElement>(`[data-perk="${perkId}"]`);
  if (!li) return;
  li.querySelector("[data-claim]")?.replaceWith(Object.assign(document.createElement("span"), { className: "t-13 muted", textContent: "Claimed" }));
  const out = li.querySelector<HTMLElement>("[data-perk-result]");
  if (!out) return;
  out.innerHTML = `${code ? `<div class="code-reveal"><span>${esc(code)}</span><button type="button" class="btn btn-secondary btn-sm" data-copy="${esc(code)}">Copy</button></div>` : ""}
    ${redeemUrl ? `<a class="btn btn-secondary btn-sm" style="justify-self:start" href="${esc(redeemUrl)}" target="_blank" rel="noopener">Redeem on the maker's site ↗</a>` : ""}
    ${!code && !redeemUrl ? `<p class="t-13 muted">Claimed. The maker will honor this perk for your account email.</p>` : ""}`;
}

function applyViewer(v: ViewerProductStateDTO) {
  document.querySelectorAll<HTMLElement>(`[data-save="${productId}"]`).forEach((b) => setSaveButton(b, v.saved));
  v.perks.filter((p: PerkPublicDTO) => p.claimed).forEach((p) => renderClaimed(p.id, p.code, p.redeemUrl));
  if (v.isOwner) document.querySelectorAll<HTMLElement>(".owner-only").forEach((el) => (el.hidden = false));
  if (v.reported) {
    const btn = document.querySelector<HTMLButtonElement>("[data-report]");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "You reported this product";
    }
  }
  document.querySelectorAll<HTMLElement>("[data-vote]").forEach((b) => {
    if (v.votes.includes(b.dataset.vote!)) b.setAttribute("aria-pressed", "true");
  });
  document.dispatchEvent(new CustomEvent("viewer-state", { detail: v }));
}

async function init() {
  if (!productId) return;
  if (!hasSession()) {
    beacon(`/products/${productId}/view`);
    return;
  }
  try {
    const { viewer } = await post<{ viewer: ViewerProductStateDTO | null }>(`/products/${productId}/view`);
    if (viewer) applyViewer(viewer);
  } catch {
    /* personal state is optional */
  }
}

document.addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;

  const thumb = t.closest<HTMLButtonElement>("[data-thumb]");
  if (thumb) {
    const img = document.querySelector<HTMLImageElement>("#hero-image img");
    if (img) img.src = thumb.dataset.thumb!;
    document.querySelectorAll("[data-thumb]").forEach((b) => b.setAttribute("aria-current", String(b === thumb)));
    return;
  }

  const copy = t.closest<HTMLButtonElement>("[data-copy]");
  if (copy) {
    await navigator.clipboard?.writeText(copy.dataset.copy!).catch(() => {});
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy"), 1500);
    return;
  }

  const claim = t.closest<HTMLButtonElement>("[data-claim]");
  if (claim) {
    if (!hasSession()) return goToLogin("perk");
    const me = await getMe();
    if (me && !me.emailVerified) return toast("Confirm your email first. Check the banner at the top.", "error");
    const perkId = claim.dataset.claim!;
    claim.setAttribute("aria-busy", "true");
    claim.disabled = true;
    try {
      const holder = claim.closest("[data-perk]")?.querySelector<HTMLElement>("[data-perk-result]");
      const token = holder ? await turnstileToken(holder) : undefined;
      const r = await post<{ code: string | null; redeemUrl: string | null }>(`/perks/${perkId}/claim`, { turnstileToken: token });
      renderClaimed(perkId, r.code, r.redeemUrl);
      toast("Perk claimed. It's also saved under Your perks.");
    } catch (err) {
      claim.disabled = false;
      if (err instanceof ClientError && err.status === 401) return goToLogin("perk");
      toast(errorMessage(err), "error");
    } finally {
      claim.removeAttribute("aria-busy");
    }
    return;
  }

  const vote = t.closest<HTMLButtonElement>("[data-vote]");
  if (vote) {
    if (!hasSession()) return goToLogin("vote");
    const id = vote.dataset.vote!;
    const on = vote.getAttribute("aria-pressed") !== "true";
    const countEl = vote.querySelector("[data-count]");
    const before = Number(countEl?.textContent ?? "0");
    vote.setAttribute("aria-pressed", String(on));
    if (countEl) countEl.textContent = String(Math.max(0, before + (on ? 1 : -1)));
    try {
      const r = on ? await put<{ voteCount: number }>(`/roadmap/${id}/vote`) : await del<{ voteCount: number }>(`/roadmap/${id}/vote`);
      if (countEl) countEl.textContent = String(r.voteCount);
    } catch (err) {
      vote.setAttribute("aria-pressed", String(!on));
      if (countEl) countEl.textContent = String(before);
      toast(errorMessage(err), "error");
    }
    return;
  }

  if (t.closest("[data-report]")) {
    if (!hasSession()) return goToLogin("report");
    document.querySelector<HTMLDialogElement>("#report-dialog")?.showModal();
  }
});

const reportDialog = document.querySelector<HTMLDialogElement>("#report-dialog");
reportDialog?.addEventListener("close", async () => {
  if (reportDialog.returnValue !== "send" || !productId) return;
  const form = document.querySelector<HTMLFormElement>("#report-form")!;
  const data = new FormData(form);
  try {
    const token = await turnstileToken(form.querySelector<HTMLElement>("[data-turnstile]")!);
    await post(`/products/${productId}/report`, { reason: data.get("reason"), note: data.get("note") || null, turnstileToken: token });
    toast("Thanks. The report was sent.");
    const btn = document.querySelector<HTMLButtonElement>("[data-report]");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "You reported this product";
    }
    form.reset();
  } catch (err) {
    toast(errorMessage(err), "error");
  }
});

init();
