interface DohAnswer {
  name: string;
  type: number;
  data: string;
}

const DOH_URL = "https://cloudflare-dns.com/dns-query";

async function doh(name: string, type: "A" | "AAAA" | "TXT"): Promise<DohAnswer[]> {
  const url = `${DOH_URL}?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`);
  const data = (await res.json()) as { Status: number; Answer?: DohAnswer[] };
  return data.Answer ?? [];
}

/** TXT record values for `name`, with the DNS quoting removed and split strings joined. */
export async function lookupTxt(name: string): Promise<string[]> {
  const answers = await doh(name, "TXT");
  return answers
    .filter((a) => a.type === 16)
    .map((a) =>
      a.data
        .match(/"((?:[^"\\]|\\.)*)"/g)
        ?.map((part) => part.slice(1, -1))
        .join("") ?? a.data,
    );
}

/** All A and AAAA addresses for a host (CNAME chains are followed by the resolver). */
export async function resolveIps(host: string): Promise<string[]> {
  const [a, aaaa] = await Promise.all([doh(host, "A"), doh(host, "AAAA")]);
  return [...a.filter((x) => x.type === 1), ...aaaa.filter((x) => x.type === 28)].map((x) => x.data);
}
