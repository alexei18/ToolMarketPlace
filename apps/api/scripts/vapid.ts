/* Prints a new VAPID key pair for web push. Usage: bun run apps/api/scripts/vapid.ts */
import { generateVapidKeys } from "../src/lib/webpush";

const { publicKey, privateKey } = await generateVapidKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("\nPut the public key in apps/api/wrangler.jsonc vars (or .dev.vars) and the private key in .dev.vars / `wrangler secret put VAPID_PRIVATE_KEY`.");
