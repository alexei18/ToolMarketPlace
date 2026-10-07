import type { Env } from "../env";

export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const EXT: Record<ImageType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
export const MAX_IMAGE_WIDTH = 1600;
export const IMAGE_KEY_RE = /^img\/[a-f0-9]{32}\.(webp|jpg|png|gif)$/;

/** Detects the real file type from magic bytes (the declared content type is never trusted). SVG is never accepted. */
export function sniffImageType(b: Uint8Array): ImageType | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  return null;
}

/** Reads width/height from the image header without decoding it. */
export function imageSize(b: Uint8Array, type: ImageType): { width: number; height: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    switch (type) {
      case "image/png":
        return { width: dv.getUint32(16), height: dv.getUint32(20) };
      case "image/gif":
        return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
      case "image/webp": {
        const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
        if (chunk === "VP8 ") return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
        if (chunk === "VP8L") {
          const bits = dv.getUint32(21, true);
          return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
        }
        if (chunk === "VP8X") {
          const w = (b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1;
          const h = (b[27]! | (b[28]! << 8) | (b[29]! << 16)) + 1;
          return { width: w, height: h };
        }
        return null;
      }
      case "image/jpeg": {
        let i = 2;
        while (i + 9 < b.length) {
          if (b[i] !== 0xff) {
            i++;
            continue;
          }
          const marker = b[i + 1]!;
          if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            i += 2;
            continue;
          }
          const len = dv.getUint16(i + 2);
          if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
          }
          i += 2 + len;
        }
        return null;
      }
    }
  } catch {
    return null;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, "0")).join("");
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new Response(bytes).body as ReadableStream<Uint8Array>;
}

export interface StoredImage {
  key: string;
  width: number | null;
  height: number | null;
  contentType: string;
}

/**
 * Validates an image, resizes it to at most 1600 px wide and re-encodes it to WebP with the
 * Cloudflare Images binding, then stores it in R2 under a content-hash name (cached for a year).
 * Without the Images binding (local dev) the original bytes are stored after validation.
 */
export async function storeImage(
  env: Env,
  bytes: Uint8Array,
  opts: { source: "og" | "screenshot" | "upload"; allowGif?: boolean; ownerId: string },
): Promise<StoredImage> {
  const type = sniffImageType(bytes);
  if (!type || (type === "image/gif" && !opts.allowGif)) throw new Error("Unsupported image type. Use JPG, PNG or WebP.");
  const size = imageSize(bytes, type);
  if (size && (size.width < 16 || size.height < 16 || size.width > 12000 || size.height > 12000)) throw new Error("Image dimensions are out of range.");

  let out = bytes;
  let contentType: string = type;
  let width = size?.width ?? null;
  let height = size?.height ?? null;

  if (env.IMAGES) {
    try {
      const result = await env.IMAGES.input(streamOf(bytes))
        .transform({ width: MAX_IMAGE_WIDTH, fit: "scale-down" })
        .output({ format: "image/webp", quality: 82 });
      out = new Uint8Array(await new Response(result.image()).arrayBuffer());
      contentType = "image/webp";
      if (width && height && width > MAX_IMAGE_WIDTH) {
        height = Math.round((height * MAX_IMAGE_WIDTH) / width);
        width = MAX_IMAGE_WIDTH;
      }
    } catch (err) {
      console.error("[images] transform failed, storing original", err);
    }
  }

  const ext = EXT[contentType as ImageType] ?? "webp";
  const key = `img/${(await sha256Hex(out)).slice(0, 32)}.${ext}`;
  await env.IMAGES_BUCKET.put(key, out, {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { w: String(width ?? ""), h: String(height ?? ""), source: opts.source, owner: opts.ownerId },
  });
  return { key, width, height, contentType };
}

/** Reads back the stored dimensions of an uploaded image; null when the key does not exist. */
export async function headImage(env: Env, key: string): Promise<{ width: number | null; height: number | null; source: string } | null> {
  if (!IMAGE_KEY_RE.test(key)) return null;
  const obj = await env.IMAGES_BUCKET.head(key);
  if (!obj) return null;
  const w = Number(obj.customMetadata?.w);
  const h = Number(obj.customMetadata?.h);
  return { width: Number.isFinite(w) && w > 0 ? w : null, height: Number.isFinite(h) && h > 0 ? h : null, source: obj.customMetadata?.source ?? "upload" };
}
