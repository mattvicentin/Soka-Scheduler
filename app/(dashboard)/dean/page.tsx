"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";

interface Proposal {
  id: string;
  faculty_name: string;
  term: { name: string };
  status: string;
  needs_dean_approval?: boolean;
}

export default function DeanDashboardPage() {
  const [approvedCount, setApprovedCount] = useState(0);
  const [finalizedCount, setFinalizedCount] = useState(0);
  const [selfApprovalCount, setSelfApprovalCount] = useState(0);

  useEffect(() => {
    apiFetch<{ data: Proposal[] }>("/api/schedule-proposals?status=approved").then(
      (r) => {
        const d = (r.data as { data?: Proposal[] })?.data ?? [];
        setApprovedCount(d.length);
      }
    );
    apiFetch<{ data: Proposal[] }>("/api/schedule-proposals?status=finalized").then(
      (r) => {
        const d = (r.data as { data?: Proposal[] })?.data ?? [];
        setFinalizedCount(d.length);
      }
    );
    Promise.all([
      apiFetch<{ data: Proposal[] }>("/api/schedule-proposals?status=under_review"),
      apiFetch<{ data: Proposal[] }>("/api/schedule-proposals?status=revised"),
    ]).then(([ur, rev]) => {
      const urData = (ur.data as { data?: Proposal[] })?.data ?? [];
      const revData = (rev.data as { data?: Proposal[] })?.data ?? [];
      const count =
        urData.filter((p) => p.needs_dean_approval).length +
        revData.filter((p) => p.needs_dean_approval).length;
      setSelfApprovalCount(count);
    });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">Dean Dashboard</h1>
      <p className="mt-1 text-soka-muted">
        Full system management: faculty, courses, schedule, and proposals.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <section className="rounded-lg border border-soka-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-soka-body">Proposals</h2>
          <p className="mt-2 text-sm text-soka-muted">
            {approvedCount} approved (need finalization)
            {selfApprovalCount > 0 && (
              <> · {selfApprovalCount} director self-approval case(s)</>
            )}
            {finalizedCount > 0 && <> · {finalizedCount} ready to publish</>}
          </p>
          <Link
            href="/dean/proposals"
            className="mt-4 inline-block rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Review proposals
          </Link>
        </section>

        <section className="rounded-lg border border-soka-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-soka-body">Faculty</h2>
          <p className="mt-2 text-sm text-soka-muted">
            Manage faculty, load, exclusions, and affiliations.
          </p>
          <Link
            href="/dean/faculty"
            className="mt-4 inline-block rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Manage faculty
          </Link>
        </section>

        <section className="rounded-lg border border-soka-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-soka-body">Sabbaticals</h2>
          <p className="mt-2 text-sm text-soka-muted">
            Manage sabbaticals and load reductions.
          </p>
          <Link
            href="/dean/sabbaticals"
            className="mt-4 inline-block rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Manage sabbaticals
          </Link>
        </section>

        <section className="rounded-lg border border-soka-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-soka-body">Courses</h2>
          <p className="mt-2 text-sm text-soka-muted">
            Course templates, offerings, and instructor assignments.
          </p>
          <Link
            href="/dean/courses"
            className="mt-4 inline-block rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Manage courses
          </Link>
        </section>

        <section className="rounded-lg border border-soka-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-soka-body">Calendar</h2>
          <p className="mt-2 text-sm text-soka-muted">
            Full calendar: create, move, delete slots.
          </p>
          <Link
            href="/dean/calendar"
            className="mt-4 inline-block rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Open calendar
          </Link>
        </section>

        <section className="rounded-lg border border-soka-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-soka-body">Accounts</h2>
          <p className="mt-2 text-sm text-soka-muted">
            Manage accounts, roles, and program associations.
          </p>
          <Link
            href="/dean/accounts"
            className="mt-4 inline-block rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Manage accounts
          </Link>
        </section>

        <section className="rounded-lg border border-soka-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-soka-body">Invitations</h2>
          <p className="mt-2 text-sm text-soka-muted">
            Create invitations for faculty and directors.
          </p>
          <Link
            href="/dean/invitations"
            className="mt-4 inline-block rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Manage invitations
          </Link>
        </section>

        <section className="rounded-lg border border-soka-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-soka-body">Settings</h2>
          <p className="mt-2 text-sm text-soka-muted">
            Crowded time periods (warn vs block) and schedule validation.
          </p>
          <Link
            href="/dean/settings"
            className="mt-4 inline-block rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Open settings
          </Link>
        </section>
      </div>
    </div>
  );
}
