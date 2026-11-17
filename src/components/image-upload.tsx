"use client";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { uploadFile } from "@/lib/client";

/* eslint-disable @next/next/no-img-element */
export function ImageUpload({ value, onChange, label = "Upload image", accept = "image/png,image/jpeg,image/webp" }: { value?: string; onChange: (url: string) => void; label?: string; accept?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const isPdf = value?.endsWith(".pdf");
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => ref.current?.click()} className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-input bg-muted/50 text-muted-foreground hover:border-primary hover:text-primary">
        {busy ? <Loader2 className="size-5 animate-spin" /> : value && !isPdf ? <img src={value} alt="" className="size-full object-cover" /> : <ImagePlus className="size-5" />}
      </button>
      <div className="text-sm">
        <button type="button" className="font-medium text-primary" onClick={() => ref.current?.click()}>{value ? "Replace" : label}</button>
        {value && <button type="button" className="ml-3 inline-flex items-center gap-1 text-muted-foreground hover:text-red-600" onClick={() => onChange("")}><X className="size-3" />Remove</button>}
        {isPdf && <a href={value} target="_blank" className="mt-1 block text-xs text-primary underline">View document</a>}
        <p className="text-xs text-muted-foreground">Max 5MB</p>
      </div>
      <input ref={ref} type="file" accept={accept} hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        setBusy(true);
        try { onChange(await uploadFile(f)); } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
      }} />
    </div>
  );
}
