"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";

interface Proposal {
  id: string;
  faculty_name: string;
  term_id: string;
  term: { name: string };
  status: string;
  needs_dean_approval?: boolean;
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

export default function DeanProposalsPage() {
  const [filter, setFilter] = useState("approved");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [terms, setTerms] = useState<Array<{ id: string; name: string }>>([]);
  const [versions, setVersions] = useState<Array<{ id: string; term_id: string; mode: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ data: Array<{ id: string; name: string }> }>("/api/terms").then(
      (r) => {
        const d = (r.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];
        setTerms(d);
      }
    );
    apiFetch<{ data: Array<{ id: string; term_id: string; mode: string }> }>(
      "/api/schedule-versions"
    ).then((r) => {
      const d = (r.data as { data?: Array<{ id: string; term_id: string; mode: string }> })?.data ?? [];
      setVersions(d);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ data: Proposal[] }>(
      `/api/schedule-proposals?status=${filter}`
    ).then((r) => {
      const d = (r.data as { data?: Proposal[] })?.data ?? [];
      setProposals(d);
      setLoading(false);
    });
  }, [filter]);

  const publishTerm = async (termId: string) => {
    const draft = versions.find((v) => v.term_id === termId && v.mode === "draft");
    if (!draft) {
      alert("No draft version for this term");
      return;
    }
    const res = await apiFetch(`/api/schedule-versions/${draft.id}/publish`, {
      method: "POST",
    });
    if (res.error) {
      alert(res.error);
      return;
    }
    setProposals((prev) => prev.filter((p) => p.term_id !== termId || p.status !== "finalized"));
    setFilter("approved");
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">Proposals</h1>
      <p className="mt-1 text-soka-muted">
        Review, finalize, and publish. Director self-approval cases require dean approval.
      </p>

      <div className="mt-6">
        <label className="block text-sm font-medium text-soka-body">Status</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mt-1 block w-48 rounded-md border border-soka-border px-3 py-2 text-sm"
        >
          <option value="submitted">Submitted</option>
          <option value="under_review">Under review</option>
          <option value="revised">Revised</option>
          <option value="approved">Approved (need finalize)</option>
          <option value="finalized">Finalized (ready to publish)</option>
          <option value="published">Published</option>
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
              className="flex items-center justify-between rounded-lg border border-soka-border bg-white p-4 shadow-sm"
            >
              <div>
                <h2 className="font-semibold text-soka-body">{p.faculty_name}</h2>
                <p className="text-sm text-soka-muted">
                  {p.term.name} · {STATUS_LABELS[p.status] ?? p.status}
                  {p.needs_dean_approval && (
                    <span className="ml-2 rounded bg-soka-warning/15 px-2 py-0.5 text-xs text-soka-warning">
                      Self-approval (director)
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/dean/proposals/${p.id}`}
                  className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
                >
                  Review
                </Link>
                {filter === "finalized" && (
                  <button
                    onClick={() => publishTerm(p.term_id)}
                    className="rounded-md bg-soka-success px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Publish term
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
