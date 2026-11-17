import { requirePage } from "@/lib/guard";

// Server-side guard: a direct URL to a page you may not use redirects before anything renders.
export default async function Guard({ children }: { children: React.ReactNode }) {
  await requirePage(["inventory.view"]);
  return children;
}
