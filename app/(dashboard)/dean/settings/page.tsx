"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

type CrowdedPolicy = "warn" | "block";

export default function DeanSettingsPage() {
  const [policy, setPolicy] = useState<CrowdedPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ crowded_period_policy?: CrowdedPolicy; faculty_conflict_policy?: CrowdedPolicy }>(
      "/api/settings"
    ).then((r) => {
      setLoading(false);
      const p = r.data?.crowded_period_policy ?? r.data?.faculty_conflict_policy;
      if (p) setPolicy(p);
      else if (r.error) setError(r.error);
    });
  }, []);

  const updatePolicy = async (next: CrowdedPolicy) => {
    setSaving(true);
    setError(null);
    setSavedHint(null);
    const res = await apiFetch<{ crowded_period_policy?: CrowdedPolicy }>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ crowded_period_policy: next }),
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const p = res.data?.crowded_period_policy;
    if (p) {
      setPolicy(p);
      setSavedHint("Saved.");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">Settings</h1>
      <p className="mt-1 text-soka-muted">Schedule validation and system behavior.</p>

      {error && (
        <div className="mt-4 rounded bg-soka-error/10 p-3 text-sm text-soka-error">{error}</div>
      )}
      {savedHint && (
        <div className="mt-4 rounded bg-soka-success/10 p-3 text-sm text-soka-success">{savedHint}</div>
      )}

      <section className="mt-8 max-w-xl rounded-lg border border-soka-border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-soka-body">Crowded time periods</h2>
        <p className="mt-2 text-sm text-soka-muted">
          When a time block already has many classes (per your crowded-slot threshold), you can let schedulers
          continue with a <strong className="text-soka-body">warning</strong>, or{" "}
          <strong className="text-soka-body">block</strong> the action so they must choose another time. Use{" "}
          <strong className="text-soka-body">Block</strong> when periods are too packed and warnings are no
          longer enough.
        </p>

        <fieldset className="mt-6" disabled={loading || saving || policy === null}>
          <legend className="sr-only">Crowded time period policy</legend>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-soka-border p-3 hover:bg-soka-surface/80">
              <input
                type="radio"
                name="crowded_period_policy"
                className="mt-1"
                checked={policy === "warn"}
                onChange={() => void updatePolicy("warn")}
              />
              <span>
                <span className="font-medium text-soka-body">Warn</span>
                <span className="mt-0.5 block text-sm text-soka-muted">
                  Schedulers see a note but can still save the slot.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-soka-border p-3 hover:bg-soka-surface/80">
              <input
                type="radio"
                name="crowded_period_policy"
                className="mt-1"
                checked={policy === "block"}
                onChange={() => void updatePolicy("block")}
              />
              <span>
                <span className="font-medium text-soka-body">Block</span>
                <span className="mt-0.5 block text-sm text-soka-muted">
                  Saving is not allowed until they pick a less crowded time.
                </span>
              </span>
            </label>
          </div>
        </fieldset>
        {loading && <p className="mt-4 text-sm text-soka-muted">Loading settings…</p>}
        {saving && <p className="mt-2 text-sm text-soka-muted">Saving…</p>}

        <p className="mt-8 text-sm text-soka-muted">
          <strong className="text-soka-body">Same instructor, two overlapping classes</strong> is never allowed:
          one person cannot teach two classes that overlap in time. That rule is always enforced and cannot be
          turned off. Professors, directors, and deans must resolve it before a slot can be saved.
        </p>
      </section>
    </div>
  );
}
