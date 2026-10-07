import { inArray } from "drizzle-orm";
import { notifications, pushSubscriptions, type Database } from "@tm/db";
import { newId, nowSec, type NotificationPayload, type NotificationType } from "@tm/shared";
import type { Env } from "../env";
import { sendPush, type VapidKeys } from "./webpush";

export interface NewNotification {
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
}

export function pushMessage(env: Env, payload: NotificationPayload): { title: string; body: string; url: string } {
  const web = env.WEB_ORIGIN.replace(/\/$/, "");
  switch (payload.kind) {
    case "digest": {
      const n = payload.products.length;
      return {
        title: `${n} new ${n === 1 ? "product" : "products"} in your categories`,
        body: payload.products
          .slice(0, 3)
          .map((p) => p.title)
          .join(" · "),
        url: `${web}/feed`,
      };
    }
    case "feedback_reply":
      return { title: `Reply from ${payload.productTitle}`, body: payload.reply.slice(0, 140), url: `${web}/p/${payload.productSlug}/feedback#f-${payload.feedbackId}` };
    case "roadmap_shipped":
      return { title: `Shipped in ${payload.productTitle}`, body: payload.itemTitle, url: `${web}/p/${payload.productSlug}/roadmap` };
    case "system":
      return { title: payload.title, body: payload.body, url: payload.href ? `${web}${payload.href}` : `${web}/notifications` };
  }
}

/** Writes notifications to the in-site notification center (one D1 batch). */
export async function createNotifications(db: Database, items: NewNotification[]): Promise<void> {
  if (items.length === 0) return;
  const now = nowSec();
  // D1 caps bound parameters per statement, so insert in chunks.
  for (let i = 0; i < items.length; i += 15) {
    const chunk = items.slice(i, i + 15);
    await db.insert(notifications).values(
      chunk.map((n) => ({ id: newId(), userId: n.userId, type: n.type, payload: JSON.stringify(n.payload), createdAt: now })),
    );
  }
}

export function vapidFromEnv(env: Env): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return { subject: env.VAPID_SUBJECT || `mailto:admin@${new URL(env.WEB_ORIGIN).hostname}`, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
}

/** Sends web push to every subscription of the given users; drops subscriptions the push service reports as gone. */
export async function pushToUsers(db: Database, env: Env, messages: Map<string, ReturnType<typeof pushMessage>>): Promise<{ sent: number; removed: number }> {
  const vapid = vapidFromEnv(env);
  if (!vapid || messages.size === 0) return { sent: 0, removed: 0 };
  const userIds = [...messages.keys()];
  const subs: (typeof pushSubscriptions.$inferSelect)[] = [];
  for (let i = 0; i < userIds.length; i += 90) {
    subs.push(...(await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds.slice(i, i + 90))).all()));
  }
  const gone: string[] = [];
  let sent = 0;
  // Workers allow 6 simultaneous outgoing connections.
  for (let i = 0; i < subs.length; i += 6) {
    await Promise.all(
      subs.slice(i, i + 6).map(async (s) => {
        try {
          const status = await sendPush(vapid, s, messages.get(s.userId));
          if (status === 404 || status === 410) gone.push(s.id);
          else if (status < 300) sent++;
        } catch (err) {
          console.error("[push] send failed", err);
        }
      }),
    );
  }
  for (let i = 0; i < gone.length; i += 90) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone.slice(i, i + 90)));
  }
  return { sent, removed: gone.length };
}
