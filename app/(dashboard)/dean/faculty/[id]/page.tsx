"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";

interface Faculty {
  id: string;
  name: string;
  email: string;
  expected_annual_load: number;
  is_excluded: boolean;
  program_affiliations: Array<{ program_id: string; program_name: string }>;
}

export default function DeanFacultyEditPage() {
  const params = useParams();
  const id = (params?.id as string) ?? "";
  const [faculty, setFaculty] = useState<Faculty | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(
    null
  );

  const fetchFaculty = () => {
    if (!id) return;
    apiFetch<Faculty>(`/api/faculty/${id}`).then((r) => {
      if (r.data) setFaculty(r.data as Faculty);
    });
  };

  useEffect(() => {
    if (!id) return;
    apiFetch<Faculty>(`/api/faculty/${id}`).then((r) => {
      if (r.data) setFaculty(r.data as Faculty);
      setLoading(false);
    });
  }, [id]);

  const save = async () => {
    if (!faculty) return;
    setFeedback(null);
    setSaving(true);
    const res = await apiFetch(`/api/faculty/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: faculty.name,
        email: faculty.email,
        expected_annual_load: faculty.expected_annual_load,
        is_excluded: faculty.is_excluded,
      }),
    });
    setSaving(false);
    if (!res.error) {
      setFaculty((f) => (f ? { ...f, ...(res.data as Partial<Faculty>) } : null));
      setFeedback({ kind: "success", message: "Changes saved." });
      window.setTimeout(() => setFeedback((prev) => (prev?.kind === "success" ? null : prev)), 4000);
    } else {
      setFeedback({ kind: "error", message: res.error });
    }
  };

  if (loading || !faculty) {
    return (
      <div>
        <Link href="/dean/faculty" className="text-soka-light-blue hover:underline">
          ← Back
        </Link>
        <p className="mt-6 text-soka-muted">{loading ? "Loading..." : "Not found."}</p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/dean/faculty" className="text-soka-light-blue hover:underline">
        ← Back to faculty
      </Link>

      <div className="mt-6 max-w-md rounded-lg border border-soka-border bg-white p-6">
        <h1 className="text-xl font-bold text-soka-body">Edit faculty</h1>
        {feedback && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-4 rounded-md border px-3 py-2 text-sm ${
              feedback.kind === "success"
                ? "border-soka-success/40 bg-soka-success/10 text-soka-success"
                : "border-soka-error/40 bg-soka-error/10 text-soka-error"
            }`}
          >
            {feedback.message}
          </div>
        )}
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-soka-body">Name</label>
            <input
              type="text"
              value={faculty.name}
              onChange={(e) => setFaculty((f) => (f ? { ...f, name: e.target.value } : null))}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Email</label>
            <input
              type="email"
              value={faculty.email}
              onChange={(e) => setFaculty((f) => (f ? { ...f, email: e.target.value } : null))}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Expected load</label>
            <input
              type="number"
              min={1}
              max={7}
              value={faculty.expected_annual_load}
              onChange={(e) =>
                setFaculty((f) =>
                  f ? { ...f, expected_annual_load: parseInt(e.target.value, 10) || 1 } : null
                )
              }
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="excluded"
              checked={faculty.is_excluded}
              onChange={(e) =>
                setFaculty((f) => (f ? { ...f, is_excluded: e.target.checked } : null))
              }
            />
            <label htmlFor="excluded" className="text-sm text-soka-body">
              Excluded from scheduling
            </label>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-soka-body">Program affiliations</label>
            <FacultyAffiliationsSection
              facultyId={id}
              affiliations={faculty.program_affiliations}
              onUpdate={fetchFaculty}
            />
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="mt-6 rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

interface Program {
  id: string;
  name: string;
}

function FacultyAffiliationsSection({
  facultyId,
  affiliations,
  onUpdate,
}: {
  facultyId: string;
  affiliations: Array<{ program_id: string; program_name: string; is_primary?: boolean }>;
  onUpdate: () => void;
}) {
  const [list, setList] = useState(affiliations);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [adding, setAdding] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [affiliationOk, setAffiliationOk] = useState<string | null>(null);

  useEffect(() => setList(affiliations), [affiliations]);

  useEffect(() => {
    apiFetch<{ data: Program[] }>("/api/programs").then((r) => {
      const d = (r.data as { data?: Program[] })?.data ?? [];
      setPrograms(d);
    });
  }, []);

  const flashOk = (msg: string) => {
    setAffiliationOk(msg);
    window.setTimeout(() => setAffiliationOk(null), 3500);
  };

  const addAffiliation = async (programId: string) => {
    if (!programId) return;
    setErr(null);
    setAffiliationOk(null);
    const res = await apiFetch(`/api/faculty/${facultyId}/affiliations`, {
      method: "POST",
      body: JSON.stringify({ program_id: programId }),
    });
    if (res.error) {
      setErr(res.error);
      return;
    }
    const p = programs.find((x) => x.id === programId);
    if (p) setList((prev) => [...prev, { program_id: p.id, program_name: p.name }]);
    setAdding("");
    flashOk("Program affiliation added.");
    onUpdate();
  };

  const removeAffiliation = async (programId: string) => {
    if (list.length <= 1) {
      setErr("Faculty must have at least one program affiliation");
      return;
    }
    setErr(null);
    const res = await apiFetch(
      `/api/faculty/${facultyId}/affiliations?program_id=${programId}`,
      { method: "DELETE" }
    );
    if (res.error) {
      setErr(res.error);
      return;
    }
    setList((prev) => prev.filter((p) => p.program_id !== programId));
    flashOk("Program affiliation removed.");
    onUpdate();
  };

  return (
    <div className="mt-2">
      {affiliationOk && (
        <p className="mb-2 text-sm text-soka-success" role="status" aria-live="polite">
          {affiliationOk}
        </p>
      )}
      {err && <p className="text-xs text-soka-error">{err}</p>}
      <div className="space-y-1">
        {list.map((p) => (
          <div key={p.program_id} className="flex items-center justify-between rounded bg-soka-surface px-2 py-1">
            <span className="text-sm">
              {p.program_name}
              {p.is_primary && <span className="ml-1 text-xs text-soka-muted">(primary)</span>}
            </span>
            {list.length > 1 && (
              <button
                onClick={() => removeAffiliation(p.program_id)}
                className="text-xs text-soka-error hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className="rounded border border-soka-border px-2 py-1 text-sm"
          >
            <option value="">Add program</option>
            {programs
              .filter((p) => !list.some((x) => x.program_id === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <button
            onClick={() => addAffiliation(adding)}
            disabled={!adding}
            className="rounded bg-soka-border px-2 py-1 text-sm hover:bg-soka-muted/20 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
