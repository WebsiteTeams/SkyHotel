"use client";
import { useRef, useState, type DragEvent } from "react";
import { FileText, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/client";
import { IMAGE_ACCEPT, isAcceptedUpload } from "@/lib/upload-types";

/* eslint-disable @next/next/no-img-element */
const PREVIEWABLE = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico)$/i;

export function ImageUpload({ value, onChange, label = "Upload image", accept = IMAGE_ACCEPT }: { value?: string; onChange: (url: string) => void; label?: string; accept?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const isPdf = value?.toLowerCase().endsWith(".pdf");
  const canPreview = !!value && !isPdf && PREVIEWABLE.test(value);

  const upload = async (file?: File) => {
    if (!file) return;
    if (!isAcceptedUpload(file, accept)) {
      toast.error("That file type is not supported here");
      return;
    }
    setBusy(true);
    try { onChange(await uploadFile(file)); } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  };

  const draggingFiles = (e: DragEvent<HTMLDivElement>) => e.dataTransfer.types.includes("Files");

  return (
    <div
      className="flex items-center gap-3"
      onDragEnter={(e) => {
        if (!draggingFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!draggingFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void upload(e.dataTransfer.files?.[0]);
      }}
    >
      <button
        type="button"
        aria-label={label}
        onClick={() => ref.current?.click()}
        className={cn(
          "grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-input bg-muted/50 text-muted-foreground transition hover:border-primary hover:text-primary",
          dragging && "border-primary bg-primary/10 text-primary",
        )}
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : canPreview ? <img src={value} alt="" className="size-full object-cover" /> : value ? <FileText className="size-5" /> : <ImagePlus className="size-5" />}
      </button>
      <div className="text-sm">
        <button type="button" className="font-medium text-primary" onClick={() => ref.current?.click()}>{value ? "Replace" : label}</button>
        {value && <button type="button" className="ml-3 inline-flex items-center gap-1 text-muted-foreground hover:text-red-600" onClick={() => onChange("")}><X className="size-3" />Remove</button>}
        {value && !canPreview && <a href={value} target="_blank" className="mt-1 block text-xs text-primary underline">View {isPdf ? "document" : "file"}</a>}
        <p className="text-xs text-muted-foreground">{dragging ? "Drop to upload" : "Drop a file here or click to browse · Max 5MB"}</p>
      </div>
      <input ref={ref} type="file" accept={accept} hidden onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        void upload(file);
      }} />
    </div>
  );
}
