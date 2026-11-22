import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ClientError, errorMessage, toast, turnstileToken } from "../lib/client";

/** Runs an async action with busy/error state; errors are shown as toasts unless `silent`. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts: { silent?: boolean } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientError | null>(null);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setBusy(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err) {
        const e = err instanceof ClientError ? err : new ClientError(0, "ERROR", errorMessage(err));
        setError(e);
        if (!opts.silent) toast(e.message, "error");
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [fn, opts.silent],
  );
  return { run, busy, error, setError };
}

/**
 * Adopts what was typed or autofilled into server-rendered fields before the island hydrated.
 * That text is in the DOM but not in React state, so the next render (or a submit) would lose it.
 * `fields` maps an element id to the setter of its state.
 */
export function useAdoptTyped(fields: Record<string, (value: string) => void>) {
  useEffect(() => {
    // Recorded by the inline script in Base.astro; React resets a textarea while hydrating, so the
    // DOM alone is not enough. The DOM check still covers autofill, which fires no input event.
    const typed = (window as unknown as { __typed?: Record<string, string> }).__typed ?? {};
    for (const [id, set] of Object.entries(fields)) {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      if (id in typed) set(typed[id]!);
      else if (el && el.value !== el.defaultValue) set(el.value);
      delete typed[id];
    }
    // Once, right after hydration.
  }, []);
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function Button({
  busy,
  children,
  variant = "primary",
  size,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; variant?: "primary" | "secondary" | "dark" | "ghost" | "text" | "danger"; size?: "sm" | "lg" }) {
  return (
    <button {...rest} className={`btn btn-${variant} ${size ? `btn-${size}` : ""} ${className}`} disabled={rest.disabled || busy} aria-busy={busy || undefined}>
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, htmlFor, aside }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; aside?: ReactNode }) {
  return (
    <div className="field">
      <div className="spread">
        <label htmlFor={htmlFor}>{label}</label>
        {aside}
      </div>
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function fieldError(err: ClientError | null, name: string): string | null {
  return err?.fields?.[name]?.[0] ?? null;
}

export function Notice({ kind = "info", children }: { kind?: "info" | "warning" | "danger" | "success"; children: ReactNode }) {
  return <div className={`notice ${kind !== "info" ? `notice-${kind}` : ""}`}>{children}</div>;
}

/** Container + helper that produces a Turnstile token right before a protected request. */
export function useTurnstile() {
  const ref = useRef<HTMLDivElement>(null);
  const getToken = useCallback(async () => (ref.current ? turnstileToken(ref.current) : undefined), []);
  return { ref, getToken, element: <div ref={ref} /> };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function Empty({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton s-img" />
          <div>
            <div className="skeleton s-line" style={{ width: "40%" }} />
            <div className="skeleton s-line" style={{ width: "70%" }} />
            <div className="skeleton s-line" style={{ width: "30%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Small "copy to clipboard" input used for DNS records and codes. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-field" aria-label={label}>
      <code>{value}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard?.writeText(value).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
