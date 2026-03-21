"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";

interface Account {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  faculty: { name: string } | null;
  program_associations: Array<{ program_id: string; program_name: string }>;
}

interface Program {
  id: string;
  name: string;
}

export default function DeanAccountEditPage() {
  const params = useParams();
  const id = (params?.id as string) ?? "";
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchAccount = () => {
    if (!id) return;
    apiFetch<Account>(`/api/accounts/${id}`).then((r) => {
      if (r.data) setAccount(r.data as Account);
    });
  };

  useEffect(() => {
    if (!id) return;
    apiFetch<Account>(`/api/accounts/${id}`).then((r) => {
      if (r.data) setAccount(r.data as Account);
      setLoading(false);
    });
  }, [id]);

  const save = async () => {
    if (!account) return;
    setSaving(true);
    const res = await apiFetch(`/api/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        role: account.role,
        is_active: account.is_active,
      }),
    });
    setSaving(false);
    if (!res.error) setAccount((a) => (a ? { ...a, ...(res.data as Partial<Account>) } : null));
    else alert(res.error);
  };

  if (loading || !account) {
    return (
      <div>
        <Link href="/dean/accounts" className="text-soka-light-blue hover:underline">
          ← Back
        </Link>
        <p className="mt-6 text-soka-muted">{loading ? "Loading..." : "Not found."}</p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/dean/accounts" className="text-soka-light-blue hover:underline">
        ← Back to accounts
      </Link>

      <div className="mt-6 max-w-md rounded-lg border border-soka-border bg-white p-6">
        <h1 className="text-xl font-bold text-soka-body">Edit account</h1>
        <p className="mt-1 text-sm text-soka-muted">{account.email}</p>
        <p className="text-sm text-soka-muted">
          Faculty: {account.faculty?.name ?? "—"}
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-soka-body">Role</label>
            <select
              value={account.role}
              onChange={(e) => setAccount((a) => (a ? { ...a, role: e.target.value } : null))}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              <option value="professor">Professor</option>
              <option value="director">Director</option>
              <option value="dean">Dean</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={account.is_active}
              onChange={(e) =>
                setAccount((a) => (a ? { ...a, is_active: e.target.checked } : null))
              }
            />
            <label htmlFor="active" className="text-sm text-soka-body">
              Active
            </label>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-soka-body">Program associations (director scope)</label>
          <ProgramAssociationsSection accountId={id} associations={account.program_associations} onUpdate={fetchAccount} />
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

function ProgramAssociationsSection({
  accountId,
  associations,
  onUpdate,
}: {
  accountId: string;
  associations: Array<{ program_id: string; program_name: string }>;
  onUpdate: () => void;
}) {
  const [list, setList] = useState(associations);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [adding, setAdding] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setList(associations), [associations]);

  useEffect(() => {
    apiFetch<{ data: Program[] }>("/api/programs").then((r) => {
      const d = (r.data as { data?: Program[] })?.data ?? [];
      setPrograms(d);
    });
  }, []);

  const addProgram = async (programId: string) => {
    if (!programId) return;
    setErr(null);
    const res = await apiFetch(`/api/accounts/${accountId}/programs`, {
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
    onUpdate();
  };

  const removeProgram = async (programId: string) => {
    setErr(null);
    const res = await apiFetch(
      `/api/accounts/${accountId}/programs?program_id=${programId}`,
      { method: "DELETE" }
    );
    if (res.error) {
      setErr(res.error);
      return;
    }
    setList((prev) => prev.filter((p) => p.program_id !== programId));
    onUpdate();
  };

  return (
    <div className="mt-2">
      {err && <p className="text-xs text-soka-error">{err}</p>}
      <div className="space-y-1">
        {list.map((p) => (
          <div key={p.program_id} className="flex items-center justify-between rounded bg-soka-surface px-2 py-1">
            <span className="text-sm">{p.program_name}</span>
            <button
              onClick={() => removeProgram(p.program_id)}
              className="text-xs text-soka-error hover:underline"
            >
              Remove
            </button>
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
            onClick={() => addProgram(adding)}
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
