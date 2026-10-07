/* Browser-side helpers shared by the small page scripts and the React islands. */
import type { ApiErrorBody, MeDTO } from "@tm/shared";

export class ClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string[]> = {},
    public existing?: string,
  ) {
    super(message);
  }
}

export function apiOrigin(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="api-origin"]')?.content ?? "http://localhost:8787";
}

export async function call<T = unknown>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let payload: BodyInit | undefined;
  if (body instanceof FormData || body instanceof Blob) {
    payload = body;
  } else if (body !== undefined) {
    headers.set("content-type", "application/json");
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`${apiOrigin()}${path}`, { ...init, method, headers, body: payload, credentials: "include" });
  } catch {
    throw new ClientError(0, "NETWORK", "You seem to be offline. Check your connection and try again.");
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    // Better Auth errors use { message, code } at the top level.
    const ba = json as { message?: string; code?: string } | null;
    throw new ClientError(res.status, err?.code ?? ba?.code ?? "ERROR", err?.message ?? ba?.message ?? `Request failed (${res.status})`, err?.fields, err?.existing);
  }
  return json as T;
}

export const get = <T>(path: string) => call<T>("GET", path);
export const post = <T>(path: string, body?: unknown) => call<T>("POST", path, body ?? {});
export const put = <T>(path: string, body?: unknown) => call<T>("PUT", path, body ?? {});
export const patch = <T>(path: string, body?: unknown) => call<T>("PATCH", path, body ?? {});
export const del = <T>(path: string, body?: unknown) => call<T>("DELETE", path, body ?? {});

/** True when the readable hint cookie says a session probably exists. */
export function hasSession(): boolean {
  return /(?:^|;\s*)tm_auth=1/.test(document.cookie);
}

let mePromise: Promise<MeDTO | null> | null = null;

/** The signed-in user, fetched once per page (null for visitors). */
export function getMe(): Promise<MeDTO | null> {
  if (!hasSession()) return Promise.resolve(null);
  mePromise ??= get<MeDTO>("/me").catch(() => null);
  return mePromise;
}

export function toast(message: string, kind: "info" | "error" = "info"): void {
  let root = document.getElementById("toasts");
  if (!root) {
    root = document.createElement("div");
    root.id = "toasts";
    root.className = "toasts";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    document.body.append(root);
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.dataset.kind = kind;
  el.textContent = message;
  root.append(el);
  setTimeout(() => el.remove(), kind === "error" ? 6000 : 3500);
}

export function errorMessage(err: unknown): string {
  if (err instanceof ClientError) return err.message;
  return "Something went wrong. Please try again.";
}

/** Redirects to login and back to the current page. */
export function goToLogin(reason?: string): void {
  const next = encodeURIComponent(location.pathname + location.search);
  location.href = `/login?next=${next}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`;
}

/** Fires a fire-and-forget beacon (view/click counters). */
export function beacon(path: string): void {
  const url = `${apiOrigin()}${path}`;
  if (navigator.sendBeacon?.(url, new Blob([], { type: "text/plain" }))) return;
  fetch(url, { method: "POST", credentials: "include", keepalive: true }).catch(() => {});
}

let turnstileLoaded: Promise<void> | null = null;

/** Loads Turnstile on demand and renders an invisible-when-possible widget; resolves with a token. */
export async function turnstileToken(container: HTMLElement): Promise<string | undefined> {
  const siteKey = document.querySelector<HTMLMetaElement>('meta[name="turnstile-site-key"]')?.content;
  if (!siteKey) return undefined;
  turnstileLoaded ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.append(s);
  });
  await turnstileLoaded;
  const ts = (window as unknown as { turnstile: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void } }).turnstile;
  return new Promise((resolve, reject) => {
    container.replaceChildren();
    const id = ts.render(container, {
      sitekey: siteKey,
      size: "flexible",
      appearance: "interaction-only",
      callback: (token: string) => {
        resolve(token);
        setTimeout(() => ts.remove(id), 0);
      },
      "error-callback": () => reject(new ClientError(0, "TURNSTILE_FAILED", "The anti-bot check failed. Please try again.")),
    });
  });
}
