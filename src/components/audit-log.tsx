"use client";
import { useState } from "react";
import { Empty, ErrorBox, Loading, Pagination, Table, Td, inputCls } from "@/components/kit";
import { fmtDateTime, qs, useApi } from "@/lib/client";

const MODULES = ["billing", "approval", "shift", "staff", "security", "inventory"];

function show(v: unknown) {
  if (v == null) return "";
  const t = JSON.stringify(v);
  return t.length > 90 ? t.slice(0, 90) + "…" : t;
}

export function AuditLogTable() {
  const [page, setPage] = useState(1), [module, setModule] = useState("");
  const { data, error, loading, reload } = useApi<any>(`/api/audit${qs({ page, module })}`);
  return (
    <>
      <div className="mb-4"><select className={inputCls + " w-48"} value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }}><option value="">All modules</option>{MODULES.map((m) => <option key={m} value={m} className="capitalize">{m}</option>)}</select></div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="rounded-2xl border border-border bg-card">
        {loading && !data ? <div className="p-5"><Loading /></div> : data?.items.length === 0 ? <Empty title="No audit entries" /> : (
          <>
            <Table head={["When", "User", "Action", "Reason", "Approved by", "Details"]}>
              {data?.items.map((a: any) => (
                <tr key={a._id}>
                  <Td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(a.createdAt)}</Td><Td>{a.userName}</Td><Td className="font-medium">{a.action}</Td>
                  <Td className="max-w-48 truncate text-muted-foreground">{a.reason ?? "-"}</Td><Td>{a.approvedBy?.name ?? "-"}</Td>
                  <Td className="max-w-72 truncate font-mono text-xs text-muted-foreground">{show(a.newValue ?? a.meta)}</Td>
                </tr>
              ))}
            </Table>
            {data && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>
    </>
  );
}
