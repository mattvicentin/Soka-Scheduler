"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";

interface Proposal {
  id: string;
  faculty_id: string;
  faculty_name: string;
  term_id: string;
  term: { name: string };
  status: string;
  submitted_at: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  revised: "Revised",
  approved: "Approved",
  finalized: "Finalized",
  published: "Published",
};

export default function DirectorApprovalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [filter, setFilter] = useState("submitted");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const path =
      filter === "all"
        ? "/api/schedule-proposals"
        : `/api/schedule-proposals?status=${encodeURIComponent(filter)}`;
    apiFetch<{ data: Proposal[] }>(path).then((r) => {
      const d = (r.data as { data?: Proposal[] })?.data ?? [];
      setProposals(d);
      setLoading(false);
    });
  }, [filter]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">Pending Approvals</h1>
      <p className="mt-1 text-soka-muted">
        Review and approve faculty schedule proposals in your program(s).
      </p>

      <div className="mt-6">
        <label className="block text-sm font-medium text-soka-body">
          Filter by status
        </label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mt-1 block w-48 rounded-md border border-soka-border px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="under_review">Under review</option>
          <option value="revised">Revised</option>
          <option value="approved">Approved</option>
        </select>
      </div>

      {loading ? (
        <p className="mt-6 text-soka-muted">Loading...</p>
      ) : proposals.length === 0 ? (
        <p className="mt-6 text-soka-muted">No proposals match the filter.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {proposals.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-soka-border bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-soka-body">
                    {p.faculty_name}
                  </h2>
                  <p className="text-sm text-soka-muted">
                    {p.term.name} · {STATUS_LABELS[p.status] ?? p.status}
                  </p>
                  {p.submitted_at && (
                    <p className="text-xs text-soka-muted">
                      Submitted:{" "}
                      {new Date(p.submitted_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <Link
                  href={`/director/approvals/${p.id}`}
                  className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
                >
                  Review
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
