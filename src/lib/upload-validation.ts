// Client-safe constants + helpers for screenshot uploads. Lives separate from
// `image-convert.ts` so importing from a client component doesn't drag `sharp`
// (a native Node module) into the browser bundle.

export const SCREENSHOT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type ScreenshotMimeType = (typeof SCREENSHOT_MIME_TYPES)[number];

export function isAcceptedScreenshotMime(type: string): boolean {
  return (SCREENSHOT_MIME_TYPES as readonly string[]).includes(type);
}

export const SCREENSHOT_ACCEPT_ATTRIBUTE = SCREENSHOT_MIME_TYPES.join(",");

// Client-side upper bound before sharp gets the file. Larger than the
// compressed cap to forgive phone photos, but small enough that we never
// parse a multi-hundred-MB file.
export const CLIENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

// Post-compression cap enforced on the server. If a converted WebP is still
// over this size the input was either malicious or pathological.
export const SERVER_CONVERTED_MAX_BYTES = 2 * 1024 * 1024;
