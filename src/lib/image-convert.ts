import sharp from "sharp";

// Default resize ceiling for receipts. Receipts are visual references, not
// archival originals — 2000px on the long edge is plenty for zooming.
export const DEFAULT_MAX_WIDTH = 2000;

export type ConvertedImage = {
  buffer: Buffer;
  byteLength: number;
  quality: number;
};

export type ConvertToWebpOptions = {
  // Long-edge ceiling. Inputs smaller than this are left at their native
  // dimensions (`withoutEnlargement`).
  maxWidth?: number;
  // Compression target. We iteratively drop WebP quality until the encoded
  // buffer is under this many bytes. A target is preferred over a fixed
  // quality because input content varies wildly: a flat GCash QR encodes to
  // ~20KB at quality 90, while a phone-shot bank receipt with gradients and
  // noise can blow past 1MB at the same quality setting.
  targetBytes?: number;
  // Quality to try first. Keep this high enough that "small, easy-to-encode"
  // images come out visually pristine on the first pass.
  initialQuality?: number;
  // Floor below which we stop lowering quality — at some point text stops
  // being legible and QR scan modules start losing contrast. If we still
  // exceed targetBytes at minQuality, we return the last attempt anyway;
  // the caller's hard max (SERVER_CONVERTED_MAX_BYTES) is the real backstop.
  minQuality?: number;
  // Quality decrement per retry. 8 strikes a decent balance between search
  // granularity and the number of sharp passes for an oversized input.
  qualityStep?: number;
};

// Default receipt compression profile. Receipts embed handwritten or printed
// text we want readable, but they're not archival — 500KB keeps a facility
// under Supabase's free-tier storage quota even with heavy usage.
export const RECEIPT_CONVERT_DEFAULTS: Required<ConvertToWebpOptions> = {
  maxWidth: DEFAULT_MAX_WIDTH,
  targetBytes: 500 * 1024,
  initialQuality: 82,
  minQuality: 55,
  qualityStep: 8,
};

// QR profile. Branded QRs embed platform headers and account details in the
// image itself; we start higher and refuse to drop below 70 to protect the
// scan modules' contrast, at the cost of a slightly larger target.
export const QR_CONVERT_DEFAULTS: Required<ConvertToWebpOptions> = {
  maxWidth: 1600,
  targetBytes: 400 * 1024,
  initialQuality: 90,
  minQuality: 70,
  qualityStep: 6,
};

function toBuffer(
  input: Buffer | ArrayBuffer | Uint8Array,
): Buffer {
  if (input instanceof Buffer) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  return Buffer.from(new Uint8Array(input));
}

// Encode to WebP at a *target byte size* rather than a fixed quality. Starts
// at `initialQuality` and steps down by `qualityStep` until the output fits
// under `targetBytes`, bottoming out at `minQuality`. Always runs
// `.rotate()` so iPhone EXIF-orientation shots render upright.
export async function convertToWebp(
  input: Buffer | ArrayBuffer | Uint8Array,
  opts: ConvertToWebpOptions = {},
): Promise<ConvertedImage> {
  const {
    maxWidth = DEFAULT_MAX_WIDTH,
    targetBytes = 500 * 1024,
    initialQuality = 82,
    minQuality = 55,
    qualityStep = 8,
  } = opts;

  // Build the resize/rotate pipeline once, then clone before each encode
  // attempt — sharp pipelines are single-use, so cloning avoids redoing the
  // (expensive) decode + resize on every quality retry.
  const base = sharp(toBuffer(input), { failOn: "error" })
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true });

  let quality = initialQuality;
  let buffer = await base
    .clone()
    .webp({ quality, effort: 4 })
    .toBuffer();

  while (buffer.byteLength > targetBytes && quality > minQuality) {
    quality = Math.max(minQuality, quality - qualityStep);
    buffer = await base
      .clone()
      .webp({ quality, effort: 4 })
      .toBuffer();
  }

  return { buffer, byteLength: buffer.byteLength, quality };
}
