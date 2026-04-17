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

interface AssignmentTermRow {
  term_id: string;
  term_name: string;
  courses: Array<{ id: string; course_code: string; title: string; section_code: string }>;
  progress: {
    submitted: boolean;
    director_approved: boolean;
    dean_finalized: boolean;
    status: string | null;
    proposal_id: string | null;
  };
}

function statusBlurb(status: string | null): string {
  if (!status) return "No proposal yet — create one and add your preferred slots.";
  switch (status) {
    case "draft":
      return "Draft — submit when your calendar preferences are ready.";
    case "submitted":
      return "Submitted — waiting for your program director to pick up.";
    case "under_review":
      return "Under review with your program director.";
    case "revised":
      return "Director sent revisions — update slots if needed and resubmit.";
    case "approved":
      return "Director approved — with the dean for finalization.";
    case "finalized":
      return "Dean finalized — schedule is being published.";
    case "published":
      return "Published — your preferences are on the official schedule.";
    default:
      return status.replace(/_/g, " ");
  }
}

export default function ProfessorDashboardPage() {
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [terms, setTerms] = useState<Array<{ id: string; name: string }>>([]);
  const [assignments, setAssignments] = useState<AssignmentTermRow[]>([]);

  useEffect(() => {
    apiFetch<{ data: ProposalSummary[] }>("/api/schedule-proposals").then((r) => {
      if (r.data?.data) setProposals(r.data.data);
    });
    apiFetch<{ data: Array<{ id: string; name: string }> }>("/api/terms").then(
      (r) => {
        if (r.data?.data) setTerms(r.data.data);
      }
    );
    apiFetch<{ data: AssignmentTermRow[] }>("/api/professor/assignment-summary").then((r) => {
      if (r.data?.data) setAssignments(r.data.data);
    });
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

      <section className="mt-8 rounded-lg border border-soka-border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-soka-body">Assignments</h2>
        <p className="mt-1 text-sm text-soka-muted">
          Courses assigned to you for scheduling, and where your proposal stands with your director and
          the dean.
        </p>
        {assignments.length === 0 ? (
          <p className="mt-4 text-sm text-soka-muted">
            You don’t have any course assignments in scheduling terms yet. When the dean assigns sections
            to you, they will appear here.
          </p>
        ) : (
          <ul className="mt-6 space-y-6">
            {assignments.map((row) => {
              const { progress: p } = row;
              const steps = [
                { key: "submitted", label: "Submitted for review", done: p.submitted },
                { key: "director", label: "Director approved", done: p.director_approved },
                { key: "dean", label: "Dean finalized", done: p.dean_finalized },
              ] as const;
              return (
                <li
                  key={row.term_id}
                  className="rounded-md border border-soka-border bg-soka-surface/40 px-4 py-4 sm:px-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-medium text-soka-body">{row.term_name}</h3>
                      <ul className="mt-2 space-y-1 text-sm text-soka-muted">
                        {row.courses.map((c) => (
                          <li key={c.id}>
                            <span className="font-medium text-soka-body">{c.course_code}</span>{" "}
                            <span className="text-soka-muted">§{c.section_code}</span>
                            <span className="text-soka-muted"> — {c.title}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Link
                      href={`/professor/calendar?term_id=${row.term_id}`}
                      className="shrink-0 rounded-md border border-soka-border bg-white px-3 py-1.5 text-sm font-medium text-soka-body hover:bg-soka-surface"
                    >
                      Calendar
                    </Link>
                  </div>
                  <div className="mt-4 border-t border-soka-border pt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-soka-muted">
                      Proposal progress
                    </p>
                    <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
                      {steps.map((s, i) => (
                        <li key={s.key} className="flex items-center gap-2 text-sm">
                          <span
                            className={
                              s.done
                                ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-soka-blue text-xs font-bold text-white"
                                : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-soka-border text-xs font-medium text-soka-muted"
                            }
                            aria-hidden
                          >
                            {s.done ? "\u2713" : i + 1}
                          </span>
                          <span className={s.done ? "text-soka-body" : "text-soka-muted"}>{s.label}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-3 text-sm text-soka-body">{statusBlurb(p.status)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
