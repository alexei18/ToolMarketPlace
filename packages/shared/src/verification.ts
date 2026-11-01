/** DNS TXT record name prefix: the record lives at `_verify.<domain>`. */
export const VERIFY_DNS_PREFIX = "_verify";
/** `<meta name="tryworthy-verification" content="<token>">` in the homepage <head>. */
export const VERIFY_META_NAME = "tryworthy-verification";
/** The name used before the rename to Tryworthy; tags already placed with it still verify. */
export const LEGACY_VERIFY_META_NAME = "toolmarket-verification";

export function verificationInstructions(hostname: string, token: string) {
  return {
    dnsName: `${VERIFY_DNS_PREFIX}.${hostname}`,
    dnsValue: token,
    metaTag: `<meta name="${VERIFY_META_NAME}" content="${token}">`,
  };
}
