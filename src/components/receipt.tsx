"use client";
import { fmtINR } from "@/lib/money";
import { fmtDateTime } from "@/lib/client";

export type Paper = "58mm" | "80mm" | "A4";

/** Prints the element with class .print-area using the right @page size for the chosen paper. */
export function printReceipt(paper: Paper) {
  const id = "sky-page-style";
  document.getElementById(id)?.remove();
  const st = document.createElement("style");
  st.id = id;
  st.textContent = paper === "A4" ? "@page { size: A4; margin: 8mm }" : `@page { size: ${paper} auto; margin: 0 }`;
  document.head.appendChild(st);
  window.print();
}

const money = (p: number) => (p / 100).toFixed(2);

const Row = ({ l, r, bold, muted }: { l: string; r: string; bold?: boolean; muted?: boolean }) => (
  <div className="rc-row" style={{ fontWeight: bold ? 700 : 400, opacity: muted ? 0.7 : 1 }}><span>{l}</span><span>{r}</span></div>
);
const Dash = () => <div className="rc-dash" />;
const Label = ({ children }: { children: string }) => <div className="rc-label">{children}</div>;

/* eslint-disable @next/next/no-img-element */
export function Receipt({ snapshot: s, payments = [], paper, status }: { snapshot: any; payments?: any[]; paper: Paper; status?: string }) {
  const paid = payments.filter((p) => p.kind === "payment");
  const refunds = payments.filter((p) => p.kind === "refund");
  const paidTotal = paid.reduce((a, p) => a + p.amount, 0);
  const due = s.grandTotal - paidTotal;
  const saved = (s.itemDiscount ?? 0) + (s.billDiscount ?? 0);
  const type = String(s.type).replace("_", " ");

  return (
    <div className={`receipt print-area paper-${paper}`}>
      {/* Header */}
      <header className="rc-head">
        {s.hotel.logo && <img src={s.hotel.logo} alt="" className="rc-logo" />}
        <div className="rc-name">{s.hotel.name}</div>
        {s.hotel.address && <div className="rc-small">{s.hotel.address}</div>}
        {(s.hotel.phone || s.hotel.gstin) && (
          <div className="rc-small">{[s.hotel.phone && `Tel ${s.hotel.phone}`, s.hotel.gstin && `GSTIN ${s.hotel.gstin}`].filter(Boolean).join("  ·  ")}</div>
        )}
      </header>

      {status === "cancelled" && <div className="rc-stamp">CANCELLED</div>}

      {/* Meta */}
      <div className="rc-meta">
        <div><Label>Invoice</Label><b>{s.invoiceNo}</b></div>
        <div style={{ textAlign: "right" }}><Label>Date</Label>{fmtDateTime(s.date)}</div>
        <div><Label>Order</Label><span style={{ textTransform: "capitalize" }}>{type}{s.table ? ` · Table ${s.table}` : ""}</span></div>
        <div style={{ textAlign: "right" }}><Label>{s.customerName ? "Customer" : "Cashier"}</Label>{s.customerName || s.customerPhone || s.cashier || "-"}</div>
      </div>

      <Dash />

      {/* Items */}
      <table className="rc-items">
        <thead>
          <tr><th style={{ textAlign: "left" }}>Item</th><th>Qty</th><th>Rate</th><th style={{ textAlign: "right" }}>Amt</th></tr>
        </thead>
        <tbody>
          {s.items.map((it: any, i: number) => (
            <tr key={i}>
              <td>
                <div className="rc-item">{it.name}{it.variation ? ` (${it.variation})` : ""}</div>
                {it.addons?.length > 0 && <div className="rc-sub">+ {it.addons.map((a: any) => a.name).join(", ")}</div>}
                {it.notes && <div className="rc-sub"><i>{it.notes}</i></div>}
                {it.discount > 0 && <div className="rc-sub">Discount −{money(it.discount)}</div>}
              </td>
              <td className="rc-num">{it.qty}</td>
              <td className="rc-num">{money(it.unitPrice)}</td>
              <td className="rc-num" style={{ textAlign: "right" }}>{money(it.unitPrice * it.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dash />

      {/* Totals */}
      <Row l="Subtotal" r={money(s.subtotal)} />
      {saved > 0 && <Row l="Discount" r={`−${money(saved)}`} />}
      {s.gstBreakup.filter((b: any) => b.rate > 0).map((b: any) => (
        <Row key={b.rate} muted l={`CGST ${b.rate / 2}% + SGST ${b.rate / 2}%`} r={money(b.gst)} />
      ))}
      {s.roundOff !== 0 && <Row muted l="Round off" r={`${s.roundOff > 0 ? "+" : "−"}${money(Math.abs(s.roundOff))}`} />}

      <div className="rc-total"><span>TOTAL</span><span>{fmtINR(s.grandTotal)}</span></div>

      {/* Payments */}
      {(paid.length > 0 || refunds.length > 0) && <Dash />}
      {paid.map((p, i) => <Row key={`p${i}`} l={`Paid · ${p.method.toUpperCase()}`} r={money(p.amount)} />)}
      {refunds.map((p, i) => <Row key={`r${i}`} l={`Refund · ${p.method.toUpperCase()}`} r={`−${money(p.amount)}`} />)}
      {due > 0 && status !== "cancelled" && <Row bold l="Balance due" r={money(due)} />}

      {s.taxNote !== false && s.gst > 0 && <div className="rc-small" style={{ marginTop: 6 }}>Taxable {money(s.taxable)} · GST {money(s.gst)} included in total</div>}

      <Dash />
      <footer className="rc-foot">{s.footer}</footer>
    </div>
  );
}
