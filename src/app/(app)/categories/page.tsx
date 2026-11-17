"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Confirm, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Tag, inputCls, Toggle } from "@/components/kit";
import { ImageUpload } from "@/components/image-upload";
import { api, useApi } from "@/lib/client";

const schema = z.object({ name: z.string().trim().min(1, "Name is required").max(60), description: z.string().max(300), image: z.string(), active: z.boolean() });
type Form = z.infer<typeof schema>;

export default function Categories() {
  const { data, error, loading, reload } = useApi<any[]>("/api/categories");
  const [edit, setEdit] = useState<any | "new" | null>(null);
  const [del, setDel] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const f = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: "", description: "", image: "", active: true } });

  const open = (c: any | "new") => {
    f.reset(c === "new" ? { name: "", description: "", image: "", active: true } : { name: c.name, description: c.description ?? "", image: c.image ?? "", active: c.active });
    setEdit(c);
  };
  const save = f.handleSubmit(async (v) => {
    try {
      await api(edit === "new" ? "/api/categories" : `/api/categories/${edit._id}`, { method: edit === "new" ? "POST" : "PUT", body: v });
      toast.success("Category saved"); setEdit(null); reload();
    } catch (e: any) {
      Object.entries(e.fields ?? {}).forEach(([k, m]) => f.setError(k as any, { message: String(m) }));
      toast.error(e.message);
    }
  });

  return (
    <>
      <PageHeader title="Categories" subtitle="Group your menu for faster billing" actions={<Button onClick={() => open("new")}><Plus />Add category</Button>} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && data.length === 0 && <Empty title="No categories yet" hint="Create categories like Biryani, Beverages or Desserts." action={<Button onClick={() => open("new")}>Add category</Button>} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data?.map((c) => (
          <div key={c._id} className="flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary text-xl font-semibold text-primary">
              {c.image ? <img src={c.image} alt="" className="size-full object-cover" /> : c.name[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><p className="truncate font-semibold">{c.name}</p>{!c.active && <Tag>Inactive</Tag>}</div>
              <p className="line-clamp-1 text-sm text-muted-foreground">{c.description || "No description"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{c.foodCount} food items</p>
            </div>
            <div className="flex flex-col gap-1">
              <button aria-label="Edit" className="rounded-lg p-1.5 hover:bg-muted" onClick={() => open(c)}><Pencil className="size-4" /></button>
              <button aria-label="Delete" className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" onClick={() => setDel(c)}><Trash2 className="size-4" /></button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "Add category" : "Edit category"}
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} disabled={f.formState.isSubmitting}>{f.formState.isSubmitting && <Loader2 className="animate-spin" />}Save</Button></>}>
        <form onSubmit={save} className="space-y-4" noValidate>
          <ImageUpload value={f.watch("image")} onChange={(u) => f.setValue("image", u)} />
          <Field label="Name" error={f.formState.errors.name?.message}><input className={inputCls} autoFocus {...f.register("name")} /></Field>
          <Field label="Description" error={f.formState.errors.description?.message}><textarea className={inputCls + " h-20 py-2"} {...f.register("description")} /></Field>
          <Toggle label="Active (visible in POS)" checked={f.watch("active")} onChange={(v) => f.setValue("active", v)} />
        </form>
      </Modal>
      <Confirm open={!!del} danger busy={busy} title="Delete category?" message={`"${del?.name}" will be removed. Categories that still contain food items cannot be deleted.`} confirmLabel="Delete" onClose={() => setDel(null)}
        onConfirm={async () => {
          setBusy(true);
          try { await api(`/api/categories/${del._id}`, { method: "DELETE" }); toast.success("Category deleted"); setDel(null); reload(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
        }} />
    </>
  );
}
