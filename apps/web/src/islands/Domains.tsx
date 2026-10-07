import { useState } from "react";
import type { DomainDTO } from "@tm/shared";
import { del, post, toast } from "../lib/client";
import { shortDate } from "../lib/format";
import { Trash2 } from "./icons";
import { Button, CopyField, Empty, Field, Notice, Segmented, useAction } from "./ui";

interface Props {
  initial: DomainDTO[];
  emailVerified: boolean;
}

export default function Domains({ initial, emailVerified }: Props) {
  const [domains, setDomains] = useState(initial);
  const [input, setInput] = useState("");
  const add = useAction(async () => {
    const d = await post<DomainDTO>("/me/domains", { domain: input });
    setDomains((ds) => [d, ...ds.filter((x) => x.id !== d.id)]);
    setInput("");
  });

  if (!emailVerified) {
    return (
      <Notice kind="warning">
        <span>Confirm your email address first; then you can verify domains and publish. Check the banner at the top of the page to resend the email.</span>
      </Notice>
    );
  }

  return (
    <div className="stack-32">
      <form
        className="stack-12"
        onSubmit={(e) => {
          e.preventDefault();
          add.run();
        }}
      >
        <Field label="Add a domain" htmlFor="dom" hint="The domain your product lives on, e.g. myapp.com. Verifying it also covers its subdomains.">
          <div className="row">
            <input id="dom" className="input" placeholder="myapp.com" value={input} onChange={(e) => setInput(e.target.value)} required />
            <Button type="submit" variant="dark" busy={add.busy}>
              Add
            </Button>
          </div>
        </Field>
      </form>

      {domains.length === 0 ? (
        <Empty title="No domains yet" text="Add the domain of your product, then prove you own it with a DNS record or a meta tag." />
      ) : (
        <ul className="list-plain stack-16">
          {domains.map((d) => (
            <DomainCard key={d.id} d={d} onChange={(nd) => setDomains((ds) => ds.map((x) => (x.id === nd.id ? nd : x)))} onRemove={() => setDomains((ds) => ds.filter((x) => x.id !== d.id))} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DomainCard({ d, onChange, onRemove }: { d: DomainDTO; onChange: (d: DomainDTO) => void; onRemove: () => void }) {
  const [method, setMethod] = useState<"dns" | "meta">("dns");
  const verify = useAction(
    async () => {
      const res = await post<DomainDTO>(`/me/domains/${d.id}/verify`, { method });
      onChange(res);
      toast(`${d.hostname} is verified. You can publish now.`);
    },
    { silent: true },
  );
  const remove = useAction(async () => {
    await del(`/me/domains/${d.id}`);
    onRemove();
  });

  return (
    <li className="box stack-16">
      <div className="spread">
        <div className="stack-4">
          <div className="w-600 t-17">{d.hostname}</div>
          <span className="status" data-status={d.verifiedAt ? "verified" : "pending"}>
            {d.verifiedAt ? `Verified ${shortDate(d.verifiedAt)} via ${d.method === "dns" ? "DNS" : "meta tag"}` : "Waiting for verification"}
          </span>
        </div>
        <div className="row">
          {d.verifiedAt ? (
            <a className="btn btn-dark btn-sm" href="/dashboard/new">
              Publish a product
            </a>
          ) : null}
          <Button variant="ghost" size="sm" aria-label={`Remove ${d.hostname}`} busy={remove.busy} onClick={() => remove.run()}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      {!d.verifiedAt && (
        <div className="stack-16">
          <Segmented
            label="Verification method"
            value={method}
            onChange={setMethod}
            options={[
              { value: "dns", label: "DNS TXT record" },
              { value: "meta", label: "Meta tag" },
            ]}
          />
          {method === "dns" ? (
            <div className="stack-12">
              <p className="t-15 muted">At your DNS provider, add a TXT record with this name and value. Changes usually show up within minutes.</p>
              <Field label="Name">
                <CopyField value={d.dnsName} label="TXT record name" />
              </Field>
              <Field label="Value">
                <CopyField value={d.dnsValue} label="TXT record value" />
              </Field>
            </div>
          ) : (
            <div className="stack-12">
              <p className="t-15 muted">
                Add this tag inside the <code className="mono">&lt;head&gt;</code> of https://{d.hostname}/ and deploy.
              </p>
              <CopyField value={d.metaTag} label="Meta tag" />
            </div>
          )}
          {verify.error && <Notice kind="danger">{verify.error.message}</Notice>}
          <div>
            <Button variant="primary" busy={verify.busy} onClick={() => verify.run()}>
              Verify {d.hostname}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
