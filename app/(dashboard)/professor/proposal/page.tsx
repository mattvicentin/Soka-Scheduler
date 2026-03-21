"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";

interface Proposal {
  id: string;
  term_id: string;
  term: { name: string; semester: string; academic_year: number };
  status: string;
  submitted_at: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft (editing)",
  submitted: "Submitted (awaiting review)",
  under_review: "Under review",
  revised: "Revised (director made changes)",
  approved: "Approved (awaiting dean)",
  finalized: "Finalized (ready to publish)",
  published: "Published",
};

export default function ProfessorProposalPage() {
  const [termId, setTermId] = useState<string>("");
  const [terms, setTerms] = useState<Array<{ id: string; name: string }>>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<{ data: Array<{ id: string; name: string }> }>("/api/terms").then(
      (r) => {
        if (r.data?.data) {
          setTerms(r.data.data);
          if (r.data.data.length > 0 && !termId) {
            setTermId(r.data.data[0].id);
          }
        }
      }
    );
  }, []);

  useEffect(() => {
    if (!termId) return;
    setLoading(true);
    apiFetch<{ data: Proposal[] }>(
      `/api/schedule-proposals?term_id=${termId}`
    ).then((r) => {
      const data = (r.data as { data?: Proposal[] })?.data ?? [];
      setProposal(data[0] ?? null);
      setLoading(false);
    });
  }, [termId]);

  const createProposal = async () => {
    if (!termId) return;
    setSubmitting(true);
    const res = await apiFetch<Proposal>("/api/schedule-proposals", {
      method: "POST",
      body: JSON.stringify({ term_id: termId }),
    });
    setSubmitting(false);
    if (res.data) setProposal(res.data as Proposal);
  };

  const submitProposal = async () => {
    if (!proposal || proposal.status !== "draft") return;
    setSubmitting(true);
    const res = await apiFetch(`/api/schedule-proposals/${proposal.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "submitted" }),
    });
    setSubmitting(false);
    if (!res.error) {
      setProposal((p) =>
        p ? { ...p, status: "submitted", submitted_at: new Date().toISOString() } : null
      );
    } else {
      alert(res.error);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">My Proposal</h1>
      <p className="mt-1 text-soka-muted">
        Create and submit your schedule proposal for director review.
      </p>

      <div className="mt-6">
        <label className="block text-sm font-medium text-soka-body">Term</label>
        <select
          value={termId}
          onChange={(e) => setTermId(e.target.value)}
          className="mt-1 block w-48 rounded-md border border-soka-border px-3 py-2 text-sm focus:border-soka-light-blue focus:outline-none focus:ring-1 focus:ring-soka-light-blue"
        >
          <option value="">Select term</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="mt-6 text-soka-muted">Loading...</p>
      ) : !proposal ? (
        <div className="mt-8 rounded-lg border border-soka-border bg-white p-6">
          <p className="text-soka-muted">
            No proposal for this term yet. Create one to submit your schedule
            preferences.
          </p>
          <button
            onClick={createProposal}
            disabled={submitting || !termId}
            className="mt-4 rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create proposal"}
          </button>
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-soka-border bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-soka-body">
                {proposal.term.name}
              </h2>
              <p className="mt-1 text-sm text-soka-muted">
                Status:{" "}
                <span className="font-medium">
                  {STATUS_LABELS[proposal.status] ?? proposal.status}
                </span>
              </p>
              {proposal.submitted_at && (
                <p className="mt-1 text-xs text-soka-muted">
                  Submitted:{" "}
                  {new Date(proposal.submitted_at).toLocaleString()}
                </p>
              )}
            </div>
            {proposal.status === "draft" && (
              <div className="flex gap-2">
                <Link
                  href={`/professor/calendar?term_id=${encodeURIComponent(proposal.term_id)}`}
                  className="rounded-md border border-soka-border px-4 py-2 text-sm font-medium text-soka-body hover:bg-soka-surface"
                >
                  Edit slots & preferences
                </Link>
                <button
                  onClick={submitProposal}
                  disabled={submitting}
                  className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit for review"}
                </button>
              </div>
            )}
          </div>

          {proposal.status === "revised" && (
            <p className="mt-4 rounded bg-soka-warning/10 p-3 text-sm text-soka-warning">
              Your director has made changes. You may review your offerings and
              resubmit when ready.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
