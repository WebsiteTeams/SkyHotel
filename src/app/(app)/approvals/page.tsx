"use client";
import { ApprovalsList } from "@/components/approvals-list";
import { PageHeader } from "@/components/kit";

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader title="Approvals" subtitle="Cancellation and refund requests from cashiers" />
      <ApprovalsList />
    </>
  );
}
