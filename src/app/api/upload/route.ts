import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { route, bad } from "@/lib/api";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };

// Stores to /public/uploads. For production/serverless swap this for S3 / Cloudinary.
export const POST = route(["catalog.manage", "purchases.manage", "expenses.manage", "settings.manage"], async ({ req }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw bad("No file provided");
  const ext = TYPES[file.type];
  if (!ext) throw bad("Only PNG, JPG, WEBP or PDF files are allowed");
  if (file.size > 5 * 1024 * 1024) throw bad("File must be 5MB or smaller");
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return { url: `/uploads/${name}` };
});
