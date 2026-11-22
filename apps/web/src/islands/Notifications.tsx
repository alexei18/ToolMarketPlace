import { useEffect, useState } from "react";
import type { NotificationDTO, Page } from "@tm/shared";
import { en } from "@tm/shared/copy";
import { get, post } from "../lib/client";
import { timeAgo } from "../lib/format";
import { Button, Empty, useAction } from "./ui";

interface Props {
  initial: Page<NotificationDTO>;
}

function Content({ n }: { n: NotificationDTO }) {
  const p = n.payload;
  switch (p.kind) {
    case "digest":
      return (
        <div className="stack-8">
          {p.category ? (
            <div className="w-600">
              <a href={`/c/${p.category.slug}`}>{en.notifications.digestTitle(p.category.name, p.products.length)}</a>
            </div>
          ) : (
            <div className="w-600">
              {p.products.length} new {p.products.length === 1 ? "product" : "products"} in your categories
              <span className="muted" style={{ fontWeight: 400 }}>
                {" "}
                · {p.frequency} digest
              </span>
            </div>
          )}
          <ul className="list-plain stack-4">
            {p.products.map((x) => (
              <li key={x.slug} className="t-15">
                <a className="link" href={`/p/${x.slug}`}>
                  {x.title}
                </a>
                <span className="muted"> · {x.tagline}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "feedback_reply":
      return (
        <div className="stack-4">
          <div>
            <span className="w-600">{p.productTitle}</span> replied to your feedback
          </div>
          <p className="t-15 muted">“{p.reply}”</p>
          <a className="t-13 link" href={`/p/${p.productSlug}/feedback#f-${p.feedbackId}`}>
            View the conversation
          </a>
        </div>
      );
    case "roadmap_shipped":
      return (
        <div className="stack-4">
          <div>
            <span className="w-600">{p.productTitle}</span> shipped something you asked for: {p.itemTitle}
          </div>
          <a className="t-13 link" href={`/p/${p.productSlug}/roadmap`}>
            See the roadmap
          </a>
        </div>
      );
    case "launch":
      return (
        <div className="stack-8">
          <div className="w-600">{en.notifications.launchDay}</div>
          <ul className="list-plain stack-4">
            {p.products.map((x) => (
              <li key={x.slug} className="t-15">
                <a className="link" href={`/p/${x.slug}`}>
                  {x.title}
                </a>
                <span className="muted"> · {x.tagline}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "system":
      return (
        <div className="stack-4">
          <div className="w-600">{p.title}</div>
          <p className="t-15 muted" style={{ whiteSpace: "pre-line" }}>
            {p.body}
          </p>
          {p.href && (
            <a className="t-13 link" href={p.href}>
              Open
            </a>
          )}
        </div>
      );
  }
}

export default function Notifications({ initial }: Props) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);

  useEffect(() => {
    // Opening the page marks everything as read (the dots stay until the next visit).
    if (initial.items.some((n) => !n.readAt)) post("/me/notifications/read", {}).catch(() => {});
  }, [initial.items]);

  const more = useAction(async () => {
    if (!cursor) return;
    const page = await get<Page<NotificationDTO>>(`/me/notifications?cursor=${encodeURIComponent(cursor)}`);
    setItems((x) => [...x, ...page.items]);
    setCursor(page.nextCursor);
  });

  if (items.length === 0) {
    return <Empty title="No notifications yet" text="Digests, replies from makers and roadmap updates show up here." />;
  }

  return (
    <div>
      <ul className="list-plain">
        {items.map((n) => (
          <li key={n.id} className="notif" data-unread={!n.readAt}>
            <span className="unread" aria-label={n.readAt ? undefined : "Unread"} />
            <Content n={n} />
            <time className="t-13 muted nowrap" dateTime={new Date(n.createdAt * 1000).toISOString()}>
              {timeAgo(n.createdAt)}
            </time>
          </li>
        ))}
      </ul>
      {cursor && (
        <div className="load-more">
          <Button variant="secondary" busy={more.busy} onClick={() => more.run()}>
            Load older
          </Button>
        </div>
      )}
    </div>
  );
}
