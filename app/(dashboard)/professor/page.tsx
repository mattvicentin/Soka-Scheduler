"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";

interface ProposalSummary {
  id: string;
  term_id: string;
  term: { name: string };
  status: string;
}

export default function ProfessorDashboardPage() {
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [terms, setTerms] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    apiFetch<{ data: ProposalSummary[] }>("/api/schedule-proposals").then((r) => {
      if (r.data?.data) setProposals(r.data.data);
    });
    apiFetch<{ data: Array<{ id: string; name: string }> }>("/api/terms").then(
      (r) => {
        if (r.data?.data) setTerms(r.data.data);
      }
    );
  }, []);

  const draftProposal = proposals.find((p) => p.status === "draft");
  const submittedProposal = proposals.find(
    (p) => p.status === "submitted" || p.status === "under_review" || p.status === "revised"
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">Professor Dashboard</h1>
      <p className="mt-1 text-soka-muted">
        Manage your schedule preferences and submit proposals for review.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <section className="rounded-lg border border-soka-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-soka-body">Calendar & Offerings</h2>
          <p className="mt-2 text-sm text-soka-muted">
            Add time slots, edit building/room preferences, and submit your proposal for review.
          </p>
          <Link
            href="/professor/calendar"
            className="mt-4 inline-block rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Open calendar
          </Link>
        </section>

        <section className="rounded-lg border border-soka-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-soka-body">My Proposal</h2>
          <p className="mt-2 text-sm text-soka-muted">
            {draftProposal
              ? `Submit your proposal for ${draftProposal.term.name} when ready.`
              : submittedProposal
                ? `Proposal for ${submittedProposal.term.name} is ${submittedProposal.status.replace("_", " ")}.`
                : "Create a proposal for a term to submit your schedule preferences."}
          </p>
          <Link
            href="/professor/proposal"
            className="mt-4 inline-block rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            {draftProposal ? "Edit & submit" : "Create proposal"}
          </Link>
        </section>

        <section className="rounded-lg border border-soka-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-soka-body">Fairness</h2>
          <p className="mt-2 text-sm text-soka-muted">
            View your busy-slot percentage in the 10:00–15:00 window.
          </p>
          <Link
            href="/professor/fairness"
            className="mt-4 inline-block rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            View fairness
          </Link>
        </section>
      </div>

      {terms.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-soka-body">Available terms</h2>
          <ul className="mt-2 space-y-1 text-sm text-soka-muted">
            {terms.slice(0, 5).map((t) => (
              <li key={t.id}>{t.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
