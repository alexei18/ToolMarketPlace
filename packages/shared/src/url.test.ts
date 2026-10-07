import { describe, expect, test } from "bun:test";
import { domainCandidates, hostBelongsToDomain, isPrivateIp, isPublicHostname, normalizeUrl, parseDomainInput } from "./url";

describe("normalizeUrl", () => {
  test.each([
    ["http://www.MyApp.com/", "https://myapp.com"],
    ["myapp.com", "https://myapp.com"],
    ["https://myapp.com/pricing/", "https://myapp.com/pricing"],
    ["https://myapp.com/?utm_source=x&utm_medium=y&ref=ph&fbclid=1&gclid=2", "https://myapp.com"],
    ["https://myapp.com/a?b=1&utm_campaign=z#section", "https://myapp.com/a?b=1"],
    ["https://WWW.myapp.com:443/A/B//", "https://myapp.com/A/B"],
    ["https://app.myapp.com/?REF=x", "https://app.myapp.com"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  test.each(["", "ftp://x.com", "javascript:alert(1)", "http://localhost:3000", "http://127.0.0.1", "http://[::1]/", "https://user:pw@x.com", "https://intranet", "https://x.local"])(
    "rejects %s",
    (input) => {
      expect(normalizeUrl(input)).toBeNull();
    },
  );
});

describe("domains", () => {
  test("parseDomainInput", () => {
    expect(parseDomainInput("https://www.MyApp.com/path")).toBe("myapp.com");
    expect(parseDomainInput("myapp.com")).toBe("myapp.com");
    expect(parseDomainInput("192.168.1.1")).toBeNull();
    expect(parseDomainInput("localhost")).toBeNull();
  });

  test("hostBelongsToDomain", () => {
    expect(hostBelongsToDomain("myapp.com", "myapp.com")).toBe(true);
    expect(hostBelongsToDomain("app.myapp.com", "myapp.com")).toBe(true);
    expect(hostBelongsToDomain("evilmyapp.com", "myapp.com")).toBe(false);
    expect(hostBelongsToDomain("myapp.com", "app.myapp.com")).toBe(false);
  });

  test("domainCandidates", () => {
    expect(domainCandidates("a.b.example.com")).toEqual(["a.b.example.com", "b.example.com", "example.com"]);
  });

  test("isPublicHostname", () => {
    expect(isPublicHostname("example.com")).toBe(true);
    expect(isPublicHostname("foo.internal")).toBe(false);
    expect(isPublicHostname("0x7f000001")).toBe(false);
    expect(isPublicHostname("2130706433")).toBe(false);
  });

  test("isPrivateIp", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "172.20.1.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
    for (const ip of ["1.1.1.1", "8.8.8.8", "172.32.0.1", "2606:4700::1111"]) {
      expect(isPrivateIp(ip)).toBe(false);
    }
  });
});
