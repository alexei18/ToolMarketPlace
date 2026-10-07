/*
 * Minimal D1 and R2 stand-ins for Bun tests, backed by bun:sqlite and memory.
 * They mimic the D1 behaviors the app depends on: object rows from all()/batch (so duplicate
 * column names collapse exactly like in D1), array rows from raw(), atomic batches, foreign keys
 * on, and no SQL-level transactions (D1 rejects BEGIN/COMMIT).
 */
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../packages/db/migrations");

type Value = string | number | null | Uint8Array;

function toBindable(params: unknown[]): Value[] {
  return params.map((p) => {
    if (p === undefined) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
    if (typeof p === "boolean") return p ? 1 : 0;
    if (p instanceof ArrayBuffer) return new Uint8Array(p);
    return p as Value;
  });
}

function assertNoTransaction(sql: string) {
  if (/^\s*(begin|commit|rollback|savepoint|release)\b/i.test(sql)) {
    throw new Error("D1_ERROR: To execute a transaction, please use the state.storage.transaction() or batch() APIs");
  }
}

class Stmt {
  constructor(
    private db: Database,
    readonly sql: string,
    readonly params: Value[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new Stmt(this.db, this.sql, toBindable(params));
  }

  private prepared() {
    assertNoTransaction(this.sql);
    return this.db.prepare(this.sql);
  }

  execAll() {
    const st = this.prepared();
    const meta = () => ({ changes: (this.db.query("select changes() as c").get() as { c: number }).c, last_row_id: 0, duration: 0 });
    if (st.columnNames.length > 0) {
      const results = st.all(...(this.params as SQLQueryBindings[])) as Record<string, unknown>[];
      return { success: true, results, meta: meta() };
    }
    st.run(...(this.params as SQLQueryBindings[]));
    return { success: true, results: [], meta: meta() };
  }

  async all() {
    return this.execAll();
  }

  async run() {
    return this.execAll();
  }

  async first(col?: string) {
    const row = this.execAll().results[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return col ? row[col] : row;
  }

  async raw() {
    const st = this.prepared();
    if (st.columnNames.length === 0) {
      st.run(...(this.params as SQLQueryBindings[]));
      return [];
    }
    return st.values(...(this.params as SQLQueryBindings[]));
  }
}

export function createD1(): { d1: D1Database; sqlite: Database } {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const chunk of text.split("--> statement-breakpoint")) {
      if (chunk.trim()) sqlite.exec(chunk);
    }
  }
  const d1 = {
    prepare: (sql: string) => new Stmt(sqlite, sql),
    async batch(stmts: Stmt[]) {
      const run = sqlite.transaction(() => stmts.map((s) => s.execAll()));
      return run();
    },
    async exec(sql: string) {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
    dump() {
      throw new Error("not supported");
    },
    withSession() {
      return d1;
    },
  };
  return { d1: d1 as unknown as D1Database, sqlite };
}

interface StoredObject {
  body: Uint8Array;
  httpMetadata: R2HTTPMetadata;
  customMetadata: Record<string, string>;
  etag: string;
}

export function createR2(): R2Bucket & { objects: Map<string, StoredObject> } {
  const objects = new Map<string, StoredObject>();
  const meta = (key: string, o: StoredObject) => ({
    key,
    size: o.body.byteLength,
    etag: o.etag,
    httpEtag: `"${o.etag}"`,
    httpMetadata: o.httpMetadata,
    customMetadata: o.customMetadata,
    writeHttpMetadata(h: Headers) {
      if (o.httpMetadata.contentType) h.set("content-type", o.httpMetadata.contentType);
      if (o.httpMetadata.cacheControl) h.set("cache-control", o.httpMetadata.cacheControl);
    },
  });
  const bucket = {
    objects,
    async put(key: string, value: Uint8Array | ArrayBuffer | string, opts: R2PutOptions = {}) {
      const body = typeof value === "string" ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
      const o: StoredObject = { body, httpMetadata: (opts.httpMetadata as R2HTTPMetadata) ?? {}, customMetadata: opts.customMetadata ?? {}, etag: crypto.randomUUID() };
      objects.set(key, o);
      return meta(key, o);
    },
    async head(key: string) {
      const o = objects.get(key);
      return o ? meta(key, o) : null;
    },
    async get(key: string) {
      const o = objects.get(key);
      if (!o) return null;
      return { ...meta(key, o), body: new Response(o.body).body, arrayBuffer: async () => o.body.buffer };
    },
    async delete(key: string) {
      objects.delete(key);
    },
  };
  return bucket as unknown as R2Bucket & { objects: Map<string, StoredObject> };
}
