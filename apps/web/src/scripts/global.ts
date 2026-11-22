/* Small behaviors shared by every page. Kept framework-free so public pages ship almost no JS. */
import { beacon, del, errorMessage, get, goToLogin, hasSession, put, toast } from "../lib/client";
import { utmParams, withUtm } from "../lib/utm";

const SAVED_KEY = "tm:saved-ids";

async function savedIds(): Promise<Set<string>> {
  if (!hasSession()) return new Set();
  try {
    const cached = JSON.parse(sessionStorage.getItem(SAVED_KEY) ?? "null") as { at: number; ids: string[] } | null;
    if (cached && Date.now() - cached.at < 60_000) return new Set(cached.ids);
  } catch {
    /* ignore */
  }
  try {
    const { ids } = await get<{ ids: string[] }>("/me/saved-ids");
    sessionStorage.setItem(SAVED_KEY, JSON.stringify({ at: Date.now(), ids }));
    return new Set(ids);
  } catch {
    return new Set();
  }
}

function rememberSaved(id: string, saved: boolean) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(SAVED_KEY) ?? "null") as { at: number; ids: string[] } | null;
    if (!cached) return;
    const ids = new Set(cached.ids);
    if (saved) ids.add(id);
    else ids.delete(id);
    sessionStorage.setItem(SAVED_KEY, JSON.stringify({ at: cached.at, ids: [...ids] }));
  } catch {
    /* ignore */
  }
}

export function setSaveButton(btn: HTMLElement, saved: boolean, count?: number) {
  btn.setAttribute("aria-pressed", String(saved));
  btn.setAttribute("aria-label", saved ? "Remove from saved" : "Save");
  const label = btn.querySelector("[data-save-label]");
  if (label) label.textContent = saved ? "Saved" : "Save";
  const n = btn.querySelector("[data-save-count]");
  if (n && count !== undefined) n.textContent = String(count);
}

export async function markSaved(root: ParentNode = document) {
  const buttons = root.querySelectorAll<HTMLElement>("[data-save]");
  if (!buttons.length || !hasSession()) return;
  const ids = await savedIds();
  buttons.forEach((b) => setSaveButton(b, ids.has(b.dataset.save!)));
}

document.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;

  const save = target.closest<HTMLElement>("[data-save]");
  if (save) {
    e.preventDefault();
    if (!hasSession()) return goToLogin("save");
    const id = save.dataset.save!;
    const next = save.getAttribute("aria-pressed") !== "true";
    const countEl = save.querySelector("[data-save-count]");
    const count = Number(countEl?.textContent ?? "0");
    setSaveButton(save, next, Math.max(0, count + (next ? 1 : -1)));
    try {
      if (next) await put(`/me/saves/${id}`);
      else await del(`/me/saves/${id}`);
      rememberSaved(id, next);
      if (next) toast("Saved. Find it under Saved.");
    } catch (err) {
      setSaveButton(save, !next, count);
      toast(errorMessage(err), "error");
    }
    return;
  }

  const link = target.closest<HTMLAnchorElement>("a[data-click]");
  if (link) beacon(`/products/${link.dataset.click}/click`);

  const more = target.closest<HTMLButtonElement>("[data-load-more]");
  if (more) {
    e.preventDefault();
    await loadMore(more);
  }
});

/** "Load more": fetches the next page as server-rendered HTML from /_fragments and appends it. */
async function loadMore(btn: HTMLButtonElement) {
  const list = document.getElementById(btn.dataset.target!);
  const cursor = btn.dataset.cursor;
  if (!list || !cursor) return;
  if (btn.dataset.requiresAuth === "true" && !hasSession()) return;
  btn.setAttribute("aria-busy", "true");
  btn.disabled = true;
  try {
    const url = new URL(btn.dataset.source!, location.origin);
    url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(String(res.status));
    const html = await res.text();
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const meta = tpl.content.querySelector<HTMLElement>("[data-next-cursor]");
    const next = meta?.dataset.nextCursor ?? "";
    meta?.remove();
    const fresh = document.createElement("div");
    fresh.append(tpl.content);
    await markSaved(fresh);
    list.append(...Array.from(fresh.children));
    if (next) {
      btn.dataset.cursor = next;
      btn.disabled = false;
    } else {
      btn.closest(".load-more")?.remove();
    }
  } catch {
    btn.disabled = false;
    toast("Couldn't load more. Try again.", "error");
  } finally {
    btn.removeAttribute("aria-busy");
  }
}

markSaved();

// First-touch source: internal links keep the landing link's utm_* params until sign-up (lib/utm.ts).
const utm = utmParams(location.search);
if (utm) {
  const carry = (e: Event) => {
    const a = (e.target as HTMLElement).closest?.<HTMLAnchorElement>("a[href^='/']:not([href^='//'])");
    if (a) a.setAttribute("href", withUtm(a.getAttribute("href")!, utm));
  };
  document.addEventListener("click", carry, true);
  document.addEventListener("auxclick", carry, true);
}
