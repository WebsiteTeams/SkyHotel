/** Indian mobile numbers: keep the last 10 digits ("+91 98765-43210" -> "9876543210"). Returns "" if invalid/empty. */
export function normalizePhone(raw?: string | null) {
  const d = String(raw ?? "").replace(/\D/g, "");
  const t = d.length > 10 ? d.slice(-10) : d;
  return /^[6-9]\d{9}$/.test(t) ? t : "";
}
