"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";

interface Faculty {
  id: string;
  name: string;
  email: string;
  expected_annual_load: number;
  is_excluded: boolean;
  program_affiliations: Array<{ program_name: string }>;
}

interface Program {
  id: string;
  name: string;
}

interface Offering {
  id: string;
  course_template: { course_code: string; title: string };
  term: { name: string };
  section_code: string;
}

export default function DeanFacultyPage() {
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateFaculty, setShowCreateFaculty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadFaculty = () =>
    apiFetch<{ data: Faculty[] }>("/api/faculty").then((r) => {
      const d = (r.data as { data?: Faculty[] })?.data ?? [];
      setFaculty(d);
    });

  useEffect(() => {
    setLoading(true);
    loadFaculty().then(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">Faculty</h1>
      <p className="mt-1 text-soka-muted">
        Manage faculty, load, exclusions, and program affiliations.
      </p>

      <div className="mt-6">
        <button
          onClick={() => setShowCreateFaculty(true)}
          className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
        >
          Add faculty
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded bg-soka-error/10 p-3 text-sm text-soka-error">{error}</div>
      )}

      {showCreateFaculty && (
        <CreateFacultyModal
          onClose={() => {
            setShowCreateFaculty(false);
            setError(null);
          }}
          onSave={async (data) => {
            setError(null);
            const res = await apiFetch("/api/faculty", {
              method: "POST",
              body: JSON.stringify(data),
            });
            if (res.error) {
              setError(res.error);
              return;
            }
            setShowCreateFaculty(false);
            loadFaculty();
          }}
        />
      )}

      {loading ? (
        <p className="mt-6 text-soka-muted">Loading...</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-collapse border border-soka-border">
            <thead>
              <tr className="bg-soka-surface">
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Name
                </th>
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Email
                </th>
                <th className="border border-soka-border px-4 py-2 text-right text-sm font-medium text-soka-body">
                  Load
                </th>
                <th className="border border-soka-border px-4 py-2 text-center text-sm font-medium text-soka-body">
                  Excluded
                </th>
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Programs
                </th>
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {faculty.map((f) => (
                <tr key={f.id} className="hover:bg-soka-surface">
                  <td className="border border-soka-border px-4 py-2 text-sm text-soka-body">
                    {f.name}
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-sm text-soka-muted">
                    {f.email}
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-right text-sm text-soka-body">
                    {f.expected_annual_load}
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-center text-sm">
                    {f.is_excluded ? (
                      <span className="rounded bg-soka-error/15 px-2 py-0.5 text-soka-error">
                        Yes
                      </span>
                    ) : (
                      <span className="text-soka-muted">No</span>
                    )}
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-sm text-soka-muted">
                    {f.program_affiliations.map((p) => p.program_name).join(", ") || "—"}
                  </td>
                  <td className="border border-soka-border px-4 py-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/dean/faculty/${f.id}`}
                        className="text-soka-light-blue hover:underline"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        disabled={deletingId === f.id}
                        onClick={async () => {
                          if (
                            !confirm(
                              `Delete ${f.name}? Their login account (if any) will remain but unlinked. Schedule proposals and related records for this faculty will be removed.`
                            )
                          ) {
                            return;
                          }
                          setError(null);
                          setDeletingId(f.id);
                          const res = await apiFetch(`/api/faculty/${f.id}`, { method: "DELETE" });
                          setDeletingId(null);
                          if (res.error) {
                            setError(res.error);
                            return;
                          }
                          loadFaculty();
                        }}
                        className="text-sm text-soka-error hover:underline disabled:opacity-50"
                      >
                        {deletingId === f.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateFacultyModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: {
    email: string;
    name: string;
    expected_annual_load: number;
    program_ids: string[];
    course_offering_ids?: string[];
  }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [expectedLoad, setExpectedLoad] = useState(5);
  const [programIds, setProgramIds] = useState<string[]>([]);
  const [courseOfferingIds, setCourseOfferingIds] = useState<string[]>([]);
  const [termId, setTermId] = useState("");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [terms, setTerms] = useState<Array<{ id: string; name: string }>>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);

  useEffect(() => {
    apiFetch<{ data: Program[] }>("/api/programs").then((r) => {
      const d = (r.data as { data?: Program[] })?.data ?? [];
      setPrograms(d);
    });
    apiFetch<{ data: Array<{ id: string; name: string }> }>("/api/terms").then((r) => {
      const d = (r.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];
      setTerms(d);
      if (d.length > 0 && !termId) setTermId(d[0].id);
    });
  }, []);

  useEffect(() => {
    if (!termId) {
      setOfferings([]);
      return;
    }
    apiFetch<{ data: Offering[] }>(
      `/api/course-offerings?term_id=${termId}&participates_in_scheduling=true`
    ).then((r) => {
      const d = (r.data as { data?: Offering[] })?.data ?? [];
      setOfferings(d);
    });
  }, [termId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-soka-body">Add faculty</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-soka-body">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Expected load</label>
            <input
              type="number"
              min={1}
              max={7}
              value={expectedLoad}
              onChange={(e) => setExpectedLoad(parseInt(e.target.value, 10) || 5)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Program affiliations</label>
            <div className="mt-2 space-y-2">
              {programs.map((p) => (
                <label key={p.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={programIds.includes(p.id)}
                    onChange={(e) =>
                      setProgramIds((prev) =>
                        e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                      )
                    }
                  />
                  <span className="text-sm">{p.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">
              Assign to courses <span className="font-normal text-soka-muted">(optional)</span>
            </label>
            <select
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <div className="mt-2 max-h-40 space-y-2 overflow-auto">
              {offerings.map((o) => (
                <label key={o.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={courseOfferingIds.includes(o.id)}
                    onChange={(e) =>
                      setCourseOfferingIds((prev) =>
                        e.target.checked ? [...prev, o.id] : prev.filter((id) => id !== o.id)
                      )
                    }
                  />
                  <span className="text-sm">
                    {o.course_template.course_code} {o.section_code} — {o.course_template.title} ({o.term.name})
                  </span>
                </label>
              ))}
              {offerings.length === 0 && termId && (
                <p className="text-sm text-soka-muted">No offerings in this term</p>
              )}
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-soka-border px-4 py-2 text-sm font-medium text-soka-body hover:bg-soka-surface"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!name || !email) {
                alert("Name and email required");
                return;
              }
              if (programIds.length === 0) {
                alert("Select at least one program");
                return;
              }
              onSave({
                name,
                email,
                expected_annual_load: expectedLoad,
                program_ids: programIds,
                course_offering_ids:
                  courseOfferingIds.length > 0 ? courseOfferingIds : undefined,
              });
            }}
            className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
