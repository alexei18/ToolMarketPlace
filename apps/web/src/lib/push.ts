import { ClientError, del, get, post } from "./client";

export type PushState = "unsupported" | "unavailable" | "needs-install" | "denied" | "on" | "off";

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function pushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const { publicKey } = await get<{ publicKey: string | null }>("/me/push-config");
  if (!publicKey) return "unavailable";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** Asks for permission (must run from a click) and registers this browser for digest pushes. */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const { publicKey } = await get<{ publicKey: string | null }>("/me/push-config");
  if (!publicKey) throw new Error("Push notifications aren't configured on this server yet.");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  // Private windows (and some locked-down browsers) have a PushManager that refuses to subscribe.
  const sub = await reg.pushManager
    .getSubscription()
    .then((existing) => existing ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }))
    .catch(() => {
      throw new ClientError(0, "PUSH_UNAVAILABLE", "This browser couldn't turn on notifications. Private windows don't support them.");
    });
  const json = sub.toJSON();
  await post("/me/push-subscriptions", { endpoint: json.endpoint, keys: json.keys });
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await del("/me/push-subscriptions", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return "off";
}
