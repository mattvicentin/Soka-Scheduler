"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

interface Invitation {
  id: string;
  faculty_id: string;
  faculty_name: string;
  faculty_email: string;
  expires_at: string;
  used_at: string | null;
  status: "pending" | "used" | "expired";
}

interface Faculty {
  id: string;
  name: string;
}

export default function DeanInvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [facultyWithAccounts, setFacultyWithAccounts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitingAll, setInvitingAll] = useState(false);

  const load = () => {
    apiFetch<{ data: Invitation[] }>("/api/invitations").then((r) => {
      const d = (r.data as { data?: Invitation[] })?.data ?? [];
      setInvitations(d);
    });
    apiFetch<{ data: Faculty[] }>("/api/faculty").then((r) => {
      const d = (r.data as { data?: Faculty[] })?.data ?? [];
      setFaculty(d);
    });
    apiFetch<{ data: Array<{ faculty: { id: string } | null }> }>("/api/accounts").then((r) => {
      const accounts = (r.data as { data?: Array<{ faculty: { id: string } | null }> })?.data ?? [];
      setFacultyWithAccounts(
        new Set(accounts.map((a) => a.faculty?.id).filter(Boolean) as string[])
      );
    });
  };

  useEffect(() => {
    setLoading(true);
    load();
    setLoading(false);
  }, []);

  const createInvitation = async (facultyId: string) => {
    setError(null);
    const res = await apiFetch("/api/invitations", {
      method: "POST",
      body: JSON.stringify({ faculty_id: facultyId }),
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    setShowCreate(false);
    load();
  };

  const inviteAll = async () => {
    setError(null);
    setInvitingAll(true);
    const res = await apiFetch<{ created?: number; message?: string }>("/api/invitations/invite-all", {
      method: "POST",
    });
    setInvitingAll(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    load();
    if (res.data?.message) {
      setError(null);
      alert(res.data.message);
    }
  };

  const facultyWithoutAccounts = faculty.filter((f) => !facultyWithAccounts.has(f.id));
  const pendingByFaculty = new Map(
    invitations.filter((i) => i.status === "pending").map((i) => [i.faculty_id, i])
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">Invitations</h1>
      <p className="mt-1 text-soka-muted">
        Create invitations for faculty and directors to set up accounts.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
        >
          Create invitation
        </button>
        <button
          onClick={inviteAll}
          disabled={invitingAll || facultyWithoutAccounts.filter((f) => !pendingByFaculty.has(f.id)).length === 0}
          className="rounded-md border border-soka-border bg-white px-4 py-2 text-sm font-medium text-soka-body hover:bg-soka-surface disabled:opacity-50"
        >
          {invitingAll ? "Inviting..." : "Invite All"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded bg-soka-error/10 p-3 text-sm text-soka-error">{error}</div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-soka-body">Create invitation</h2>
            <p className="mt-1 text-sm text-soka-muted">
              Select a faculty member who does not yet have an account.
            </p>
            <div className="mt-4 max-h-60 overflow-auto">
              {facultyWithoutAccounts
                .filter((f) => !pendingByFaculty.has(f.id))
                .map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded border border-soka-border px-3 py-2"
                  >
                    <span className="text-sm">{f.name}</span>
                    <button
                      onClick={() => createInvitation(f.id)}
                      className="rounded bg-soka-blue px-3 py-1 text-sm text-white hover:bg-soka-blue-hover"
                    >
                      Invite
                    </button>
                  </div>
                ))}
              {facultyWithoutAccounts.filter((f) => !pendingByFaculty.has(f.id)).length === 0 && (
                <p className="text-sm text-soka-muted">
                  All faculty have accounts or pending invitations.
                </p>
              )}
            </div>
            <button
              onClick={() => setShowCreate(false)}
              className="mt-4 rounded-md border border-soka-border px-4 py-2 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-soka-muted">Loading...</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-collapse border border-soka-border">
            <thead>
              <tr className="bg-soka-surface">
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Faculty
                </th>
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Email
                </th>
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Status
                </th>
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Expires
                </th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((i) => (
                <tr key={i.id} className="hover:bg-soka-surface">
                  <td className="border border-soka-border px-4 py-2 text-sm text-soka-body">
                    {i.faculty_name}
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-sm text-soka-muted">
                    {i.faculty_email}
                  </td>
                  <td className="border border-soka-border px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        i.status === "pending"
                          ? "bg-soka-warning/15 text-soka-warning"
                          : i.status === "used"
                            ? "bg-soka-success/15 text-soka-success"
                            : "bg-soka-surface text-soka-muted"
                      }`}
                    >
                      {i.status}
                    </span>
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-sm text-soka-muted">
                    {new Date(i.expires_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm text-soka-muted">{invitations.length} invitation(s)</p>
        </div>
      )}
    </div>
  );
}
