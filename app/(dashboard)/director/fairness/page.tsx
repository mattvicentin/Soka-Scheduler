"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

interface FairnessResult {
  faculty_id: string;
  busy_slot_percentage: number;
  total_minutes: number;
  busy_minutes: number;
  instructional_minutes?: number;
}

interface FacultyInfo {
  id: string;
  name: string;
}

export default function DirectorFairnessPage() {
  const [programId, setProgramId] = useState("");
  const [programs, setPrograms] = useState<Array<{ program_id: string; program_name: string }>>([]);
  const [results, setResults] = useState<FairnessResult[]>([]);
  const [facultyNames, setFacultyNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [programsReady, setProgramsReady] = useState(false);

  useEffect(() => {
    apiFetch<{ program_associations?: Array<{ program_id: string; program_name: string }> }>(
      "/api/accounts/me"
    ).then((r) => {
      const a = (r.data as { program_associations?: Array<{ program_id: string; program_name: string }> })?.program_associations ?? [];
      setPrograms(a);
      if (a.length > 0) setProgramId((prev) => prev || a[0].program_id);
      setProgramsReady(true);
    });
  }, []);

  useEffect(() => {
    if (!programsReady) return;
    if (!programId) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<{ data: FairnessResult[] }>(
      `/api/fairness?program_id=${programId}`
    ).then((r) => {
      const d = (r.data as { data?: FairnessResult[] })?.data ?? [];
      setResults(d);
      if (d.length > 0) {
        apiFetch<{ data: Array<{ id: string; name: string }> }>(
          `/api/faculty?program_id=${programId}`
        ).then((fRes) => {
          const faculty = (fRes.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];
          const map: Record<string, string> = {};
          faculty.forEach((f) => {
            map[f.id] = f.name;
          });
          setFacultyNames(map);
        });
      }
      setLoading(false);
    });
  }, [programsReady, programId]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">Fairness Table</h1>
      <p className="mt-1 text-soka-muted">
        Busy-slot percentage (10:00–15:00) for faculty in your program(s).
      </p>

      <div className="mt-6">
        <label className="block text-sm font-medium text-soka-body">Program</label>
        <select
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
          className="mt-1 block w-64 rounded-md border border-soka-border px-3 py-2 text-sm"
        >
          <option value="">Select program</option>
          {programs.map((p) => (
            <option key={p.program_id} value={p.program_id}>
              {p.program_name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="mt-6 text-soka-muted">Loading...</p>
      ) : results.length === 0 ? (
        <p className="mt-6 text-soka-muted">
          {programId ? "No faculty in this program." : "Select a program."}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-collapse border border-soka-border">
            <thead>
              <tr className="bg-soka-surface">
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Faculty
                </th>
                <th className="border border-soka-border px-4 py-2 text-right text-sm font-medium text-soka-body">
                  Busy %
                </th>
                <th className="border border-soka-border px-4 py-2 text-right text-sm font-medium text-soka-body">
                  Busy min
                </th>
                <th className="border border-soka-border px-4 py-2 text-right text-sm font-medium text-soka-body">
                  Instr. min
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.faculty_id} className="hover:bg-soka-surface">
                  <td className="border border-soka-border px-4 py-2 text-sm text-soka-body">
                    {facultyNames[r.faculty_id] ?? r.faculty_id}
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-right text-sm text-soka-body">
                    {r.busy_slot_percentage}%
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-right text-sm text-soka-muted">
                    {r.busy_minutes}
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-right text-sm text-soka-muted">
                    {r.instructional_minutes ?? "—"}
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
