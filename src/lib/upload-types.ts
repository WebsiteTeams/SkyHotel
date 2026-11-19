export const IMAGE_ACCEPT = "image/*";
export const IMAGE_OR_PDF_ACCEPT = "image/*,application/pdf";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/apng": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/tiff": "tiff",
  "image/svg+xml": "svg",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

const NAME_EXTENSIONS: Record<string, string> = {
  jpg: "jpg",
  jpeg: "jpg",
  png: "png",
  apng: "png",
  webp: "webp",
  gif: "gif",
  avif: "avif",
  bmp: "bmp",
  ico: "ico",
  tif: "tiff",
  tiff: "tiff",
  svg: "svg",
  heic: "heic",
  heif: "heif",
  pdf: "pdf",
};

type FileLike = { name: string; type: string };

/** Returns a safe extension for any supported image file, plus PDF. */
export function uploadExtension(file: FileLike): string | null {
  const mime = file.type.toLowerCase().split(";")[0];

  if (mime) {
    if (MIME_EXTENSIONS[mime]) return MIME_EXTENSIONS[mime];
    if (mime.startsWith("image/")) {
      const subtype = mime.slice("image/".length).replace(/\+/g, "-").replace(/[^a-z0-9-]/g, "");
      return subtype || "img";
    }
    return null;
  }

  // Some browsers leave type empty for dragged files, so fall back to the name.
  const ext = file.name.toLowerCase().split(".").pop();
  return ext ? NAME_EXTENSIONS[ext] ?? null : null;
}

export function isAcceptedUpload(file: FileLike, accept: string): boolean {
  const rules = accept.split(",").map((rule) => rule.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;

  const type = file.type.toLowerCase().split(";")[0];
  const name = file.name.toLowerCase();
  const ext = uploadExtension(file);

  return rules.some((rule) => {
    if (rule.startsWith(".")) return name.endsWith(rule);

    if (rule.endsWith("/*")) {
      if (type.startsWith(rule.slice(0, -1))) return true;
      return rule === "image/*" && ext !== null && ext !== "pdf";
    }

    if (type === rule) return true;
    if (type) return false;

    const ruleExt = MIME_EXTENSIONS[rule];
    return ruleExt !== undefined && ext === ruleExt;
  });
}
