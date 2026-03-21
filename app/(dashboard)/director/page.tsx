"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";

interface ProposalSummary {
  id: string;
  faculty_name: string;
  term: { name: string };
  status: string;
}

export default function DirectorDashboardPage() {
  const [pendingCount, setPendingCount] = useState(0);
  const [programs, setPrograms] = useState<Array<{ program_id: string; program_name: string }>>([]);

  useEffect(() => {
    apiFetch<{ data: ProposalSummary[] }>(
      "/api/schedule-proposals?status=submitted"
    ).then((r) => {
      const data = (r.data as { data?: ProposalSummary[] })?.data ?? [];
      setPendingCount(data.length);
    });
    apiFetch<{ program_associations?: Array<{ program_id: string; program_name: string }> }>(
      "/api/accounts/me"
    ).then((r) => {
      const assocs = (r.data as { program_associations?: Array<{ program_id: string; program_name: string }> })?.program_associations ?? [];
      setPrograms(assocs);
    });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">Director Dashboard</h1>
      <p className="mt-1 text-soka-muted">
        Manage your program schedule and review faculty proposals.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <section className="rounded-lg border border-soka-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-soka-body">Weekly Calendar</h2>
          <p className="mt-2 text-sm text-soka-muted">
            View and move classes within your program scope.
          </p>
          <Link
            href="/director/calendar"
            className="mt-4 inline-block rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Open calendar
          </Link>
        </section>

        <section className="rounded-lg border border-soka-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-soka-body">Pending Approvals</h2>
          <p className="mt-2 text-sm text-soka-muted">
            {pendingCount > 0
              ? `${pendingCount} proposal(s) awaiting review.`
              : "No proposals pending."}
          </p>
          <Link
            href="/director/approvals"
            className="mt-4 inline-block rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Review proposals
          </Link>
        </section>

        <section className="rounded-lg border border-soka-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-soka-body">Fairness</h2>
          <p className="mt-2 text-sm text-soka-muted">
            View busy-slot percentages for faculty in your program(s).
          </p>
          <Link
            href="/director/fairness"
            className="mt-4 inline-block rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            View fairness table
          </Link>
        </section>
      </div>

      {programs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-soka-body">Your programs</h2>
          <ul className="mt-2 space-y-1 text-sm text-soka-muted">
            {programs.map((p) => (
              <li key={p.program_id}>{p.program_name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
