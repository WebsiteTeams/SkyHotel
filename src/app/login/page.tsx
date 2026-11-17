"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/kit";
import { api } from "@/lib/client";

const schema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(1, "Password is required") });
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const [error, setError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  const submit = async (v: Form) => {
    setError("");
    try {
      await api("/api/auth/login", { body: v });
      window.location.href = "/dashboard";
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-[#171717] p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary"><Store className="size-5" /></div>
          <span className="text-xl font-semibold tracking-tight">SkyHotel</span>
        </div>
        <div>
          <h2 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">Every bill, every ingredient, <span className="text-primary">accounted for.</span></h2>
          <p className="mt-4 max-w-md text-neutral-400">Fast billing at the counter. Automatic stock deduction behind the scenes. Clear profit at the end of the day.</p>
        </div>
        <p className="text-xs text-neutral-500">Billing · Inventory · Recipes · Purchases · Reports</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={handleSubmit(submit)} className="w-full max-w-sm space-y-5" noValidate>
          <div className="lg:hidden flex items-center gap-2"><div className="grid size-9 place-items-center rounded-xl bg-primary text-white"><Store className="size-5" /></div><span className="text-lg font-semibold">SkyHotel</span></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to continue to your dashboard.</p>
          </div>
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <Field label="Email" error={errors.email?.message}><input className={inputCls} type="email" autoComplete="username" autoFocus {...register("email")} /></Field>
          <Field label="Password" error={errors.password?.message}><input className={inputCls} type="password" autoComplete="current-password" {...register("password")} /></Field>
          <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin" />}Sign in</Button>
        </form>
      </div>
    </div>
  );
}
