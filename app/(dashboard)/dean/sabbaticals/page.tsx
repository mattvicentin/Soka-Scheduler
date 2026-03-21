"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

interface Sabbatical {
  id: string;
  faculty_id: string;
  faculty_name: string;
  term_id: string;
  term_name: string;
  type: string;
  reason: string | null;
  effective_load_reduction: number;
}

export default function DeanSabbaticalsPage() {
  const [sabbaticals, setSabbaticals] = useState<Sabbatical[]>([]);
  const [faculty, setFaculty] = useState<Array<{ id: string; name: string }>>([]);
  const [terms, setTerms] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Sabbatical | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    apiFetch<{ data: Sabbatical[] }>("/api/sabbaticals").then((r) => {
      const d = (r.data as { data?: Sabbatical[] })?.data ?? [];
      setSabbaticals(d);
    });
    apiFetch<{ data: Array<{ id: string; name: string }> }>("/api/faculty").then(
      (r) => {
        const d = (r.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];
        setFaculty(d);
      }
    );
    apiFetch<{ data: Array<{ id: string; name: string }> }>("/api/terms").then(
      (r) => {
        const d = (r.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];
        setTerms(d);
      }
    );
  };

  useEffect(() => {
    setLoading(true);
    load();
    setLoading(false);
  }, []);

  const deleteSabbatical = async (id: string) => {
    if (!confirm("Delete this sabbatical?")) return;
    setError(null);
    const res = await apiFetch(`/api/sabbaticals/${id}`, { method: "DELETE" });
    if (!res.error) setSabbaticals((prev) => prev.filter((s) => s.id !== id));
    else setError(res.error);
  };

  const createSabbatical = async (data: {
    faculty_id: string;
    term_id: string;
    type: string;
    reason?: string | null;
    effective_load_reduction: number;
  }) => {
    setError(null);
    const res = await apiFetch("/api/sabbaticals", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    setShowCreate(false);
    load();
  };

  const updateSabbatical = async (
    id: string,
    data: { type?: string; reason?: string | null; effective_load_reduction?: number }
  ) => {
    setError(null);
    const res = await apiFetch(`/api/sabbaticals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditing(null);
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">Sabbaticals</h1>
      <p className="mt-1 text-soka-muted">
        Manage sabbaticals and load reductions.
      </p>

      <div className="mt-6">
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
        >
          Create sabbatical
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded bg-soka-error/10 p-3 text-sm text-soka-error">{error}</div>
      )}

      {showCreate && (
        <SabbaticalFormModal
          faculty={faculty}
          terms={terms}
          onClose={() => setShowCreate(false)}
          onSave={createSabbatical}
        />
      )}

      {editing && (
        <SabbaticalEditModal
          sabbatical={editing}
          onClose={() => setEditing(null)}
          onSave={(data) => updateSabbatical(editing.id, data)}
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
                  Faculty
                </th>
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Term
                </th>
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Type
                </th>
                <th className="border border-soka-border px-4 py-2 text-right text-sm font-medium text-soka-body">
                  Reduction
                </th>
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sabbaticals.map((s) => (
                <tr key={s.id} className="hover:bg-soka-surface">
                  <td className="border border-soka-border px-4 py-2 text-sm text-soka-body">
                    {s.faculty_name}
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-sm text-soka-muted">
                    {s.term_name}
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-sm text-soka-muted">
                    {s.type.replace("_", " ")}
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-right text-sm text-soka-body">
                    {s.effective_load_reduction}
                  </td>
                  <td className="border border-soka-border px-4 py-2">
                    <button
                      onClick={() => setEditing(s)}
                      className="mr-2 text-soka-light-blue hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteSabbatical(s.id)}
                      className="text-soka-error hover:underline"
                    >
                      Delete
                    </button>
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

function SabbaticalFormModal({
  faculty,
  terms,
  onClose,
  onSave,
}: {
  faculty: Array<{ id: string; name: string }>;
  terms: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSave: (data: {
    faculty_id: string;
    term_id: string;
    type: string;
    reason?: string | null;
    effective_load_reduction: number;
  }) => void;
}) {
  const [facultyId, setFacultyId] = useState("");
  const [termId, setTermId] = useState("");
  const [type, setType] = useState("sabbatical");
  const [reason, setReason] = useState("");
  const [reduction, setReduction] = useState(3);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-soka-body">Create sabbatical</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-soka-body">Faculty</label>
            <select
              value={facultyId}
              onChange={(e) => setFacultyId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              <option value="">Select faculty</option>
              {faculty.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Term</label>
            <select
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              <option value="">Select term</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              <option value="sabbatical">Sabbatical</option>
              <option value="admin_release">Admin release</option>
              <option value="partial_reduction">Partial reduction</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">
              Effective load reduction
            </label>
            <input
              type="number"
              min={0.01}
              max={7}
              step={0.5}
              value={reduction}
              onChange={(e) => setReduction(parseFloat(e.target.value) || 0)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
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
              if (facultyId && termId) {
                onSave({
                  faculty_id: facultyId,
                  term_id: termId,
                  type,
                  reason: reason || null,
                  effective_load_reduction: reduction,
                });
              } else {
                alert("Select faculty and term");
              }
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

function SabbaticalEditModal({
  sabbatical,
  onClose,
  onSave,
}: {
  sabbatical: Sabbatical;
  onClose: () => void;
  onSave: (data: {
    type?: string;
    reason?: string | null;
    effective_load_reduction?: number;
  }) => void;
}) {
  const [type, setType] = useState(sabbatical.type);
  const [reason, setReason] = useState(sabbatical.reason ?? "");
  const [reduction, setReduction] = useState(sabbatical.effective_load_reduction);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-soka-body">Edit sabbatical</h2>
        <p className="mt-1 text-sm text-soka-muted">
          {sabbatical.faculty_name} — {sabbatical.term_name}
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-soka-body">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              <option value="sabbatical">Sabbatical</option>
              <option value="admin_release">Admin release</option>
              <option value="partial_reduction">Partial reduction</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">
              Effective load reduction
            </label>
            <input
              type="number"
              min={0.01}
              max={7}
              step={0.5}
              value={reduction}
              onChange={(e) => setReduction(parseFloat(e.target.value) || 0)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
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
            onClick={() =>
              onSave({
                type,
                reason: reason || null,
                effective_load_reduction: reduction,
              })
            }
            className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
