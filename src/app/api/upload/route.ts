import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { route, bad } from "@/lib/api";
import { uploadExtension } from "@/lib/upload-types";

// Stores to /public/uploads. For production/serverless swap this for S3 / Cloudinary.
export const POST = route(["catalog.manage", "purchases.manage", "expenses.manage", "settings.manage"], async ({ req }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw bad("No file provided");
  const ext = uploadExtension(file);
  if (!ext) throw bad("Only image files and PDFs are allowed");
  if (file.size > 5 * 1024 * 1024) throw bad("File must be 5MB or smaller");
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return { url: `/uploads/${name}` };
});
