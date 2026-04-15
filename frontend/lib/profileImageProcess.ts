/** Client-side square center crop + downscale to JPEG for avatar upload. */

const IMAGE_FILENAME_RE = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i;

const MAX_SIDE = 512;

/** Some OS/browsers omit `file.type`; fall back to extension. */
export function looksLikeImageFile(file: File): boolean {
  const mime = file.type.trim().toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (mime === "" || mime === "application/octet-stream") {
    return IMAGE_FILENAME_RE.test(file.name);
  }
  return false;
}
const JPEG_QUALITY = 0.88;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode"));
    img.src = src;
  });
}

/**
 * Reads an image file, center-crops to a square, scales to at most `MAX_SIDE`, returns JPEG blob.
 */
export async function imageFileToResizedSquareJpegBlob(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
  const img = await loadImageElement(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) {
    throw new Error("empty");
  }
  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = MAX_SIDE;
  canvas.height = MAX_SIDE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas");
  }
  ctx.drawImage(img, sx, sy, side, side, 0, 0, MAX_SIDE, MAX_SIDE);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
  });
  if (!blob) {
    throw new Error("blob");
  }
  return blob;
}

export function isAllowedProfileImageUrlInput(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  const low = s.toLowerCase();
  if (low.startsWith("data:") || low.startsWith("javascript:")) {
    return false;
  }
  if (s.startsWith("/api/public/profile-images/")) {
    return /^\/api\/public\/profile-images\/[a-f0-9]{32}\.jpg$/i.test(s);
  }
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
