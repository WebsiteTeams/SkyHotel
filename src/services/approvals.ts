import { z } from "zod";
import { bad, conflict, forbidden, notFound } from "@/lib/api";
import type { Actor } from "@/lib/access";
import { loadActor } from "@/lib/access";
import { ApprovalRequest, Order, User } from "@/lib/models";
import { audit } from "./audit";
import { cancelOrder, refundOrder } from "./billing";
import { verifyApprover } from "./approver";

export const requestInput = z.object({
  type: z.enum(["cancel_bill", "refund"]),
  reason: z.string().trim().min(3, "A reason is required").max(200),
  amount: z.number().int().min(1).optional(), // refund, paise
  method: z.enum(["cash", "upi", "card"]).optional(), // refund
  /** Optional: a manager authorises on the spot by typing their email + PIN. */
  approval: z.object({ managerEmail: z.string().email(), pin: z.string().min(4).max(6) }).optional(),
});
export type RequestInput = z.infer<typeof requestInput>;

/** Runs the approved operation as the original requester, recording the approver on the audit trail. */
async function execute(req: any, approverId: string) {
  const requester = await loadActor({ userId: String(req.requestedBy), hotelId: String(req.hotel), role: "cashier", name: "", email: "" });
  if (!requester) throw conflict("The requesting user is no longer active");
  const orderId = String(req.relatedBill);
  if (req.requestType === "cancel_bill") return cancelOrder(orderId, req.reason, requester, { approvedBy: approverId });
  return refundOrder(orderId, { amount: req.payload.amount, method: req.payload.method, reason: req.reason }, requester, { approvedBy: approverId });
}

async function finalize(req: any, approverId: string, note?: string) {
  // Atomic status flip so two managers can't approve (and execute) the same request twice.
  const claimed = await ApprovalRequest.findOneAndUpdate({ _id: req._id, status: "pending" }, { status: "approved", approvedBy: approverId, approvedAt: new Date(), decisionNote: note }, { returnDocument: "after" });
  if (!claimed) throw conflict("This request was already decided");
  try {
    await execute(claimed, approverId);
  } catch (e: any) {
    await ApprovalRequest.updateOne({ _id: req._id }, { status: "failed", decisionNote: e?.message ?? "Failed" });
    throw e;
  }
  return ApprovalRequest.findById(req._id);
}

/** Cashier asks for a cancellation / refund. With manager credentials it is approved and executed immediately. */
export async function requestApproval(a: Actor, orderId: string, input: RequestInput) {
  const order = await Order.findOne({ _id: orderId, hotel: a.hotelId });
  // Cashiers may only touch their own bills unless granted view-all.
  if (!order || (!a.can("billing.view_all") && String(order.createdBy) !== a.userId)) throw notFound("Bill not found");
  if (order.status === "cancelled") throw conflict("This bill is already cancelled");
  if (input.type === "refund") {
    if (!input.amount || !input.method) throw bad("Enter the refund amount and method", { amount: "Required" });
    const refundable = order.paidAmount - order.refundedAmount;
    if (input.amount > refundable) throw bad(`Only ₹${(refundable / 100).toFixed(2)} can be refunded`);
  }
  if (await ApprovalRequest.exists({ relatedBill: orderId, requestType: input.type, status: "pending" })) throw conflict("A request for this bill is already waiting for approval");

  const req = await ApprovalRequest.create({
    hotel: a.hotelId, requestedBy: a.userId, requestType: input.type, relatedBill: orderId, reason: input.reason,
    payload: input.type === "refund" ? { amount: input.amount, method: input.method } : undefined,
  });
  await audit(a, { action: `${input.type}.requested`, module: "approval", entity: "ApprovalRequest", entityId: req._id, reason: input.reason, meta: { orderNo: order.orderNo } });

  if (!input.approval) return { request: req, executed: false };
  const mgr = await verifyApprover(a.hotelId, input.approval.managerEmail, input.approval.pin, a.userId);
  const done = await finalize(req, mgr.id, "Approved on the spot with manager PIN");
  return { request: done, executed: true };
}

/** A logged-in manager / admin approves or rejects from the Approvals screen. */
export async function decideApproval(a: Actor, id: string, decision: "approve" | "reject", note?: string) {
  if (!a.can("approvals.manage")) throw forbidden();
  const req = await ApprovalRequest.findOne({ _id: id, hotel: a.hotelId });
  if (!req) throw notFound("Request not found");
  if (req.status !== "pending") throw conflict("This request was already decided");
  if (String(req.requestedBy) === a.userId) throw forbidden("You cannot decide your own request");
  if (decision === "reject") {
    const r = await ApprovalRequest.findOneAndUpdate({ _id: id, status: "pending" }, { status: "rejected", approvedBy: a.userId, approvedAt: new Date(), decisionNote: note }, { returnDocument: "after" });
    if (!r) throw conflict("This request was already decided");
    await audit(a, { action: `${req.requestType}.rejected`, module: "approval", entity: "ApprovalRequest", entityId: id, reason: note });
    return r;
  }
  return finalize(req, a.userId, note);
}

export async function listApprovals(hotelId: string, status?: string) {
  return ApprovalRequest.find({ hotel: hotelId, ...(status ? { status } : {}) })
    .sort({ createdAt: -1 }).limit(100)
    .populate("requestedBy", "name").populate("approvedBy", "name").populate("relatedBill", "orderNo grandTotal paidAmount").lean();
}
void User;
