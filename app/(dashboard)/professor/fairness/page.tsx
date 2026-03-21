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

export default function ProfessorFairnessPage() {
  const [result, setResult] = useState<FairnessResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ data: FairnessResult[] }>("/api/fairness").then((r) => {
      const data = (r.data as { data?: FairnessResult[] })?.data;
      if (data && data.length > 0) setResult(data[0]);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <p className="text-soka-muted">Loading...</p>;
  }

  if (!result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-soka-body">Fairness</h1>
        <p className="mt-4 text-soka-muted">
          Unable to load your fairness metric.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">My Fairness Metric</h1>
      <p className="mt-1 text-soka-muted">
        Busy-slot percentage in the 10:00–15:00 window (Mon–Fri), based on
        historical offerings.
      </p>

      <div className="mt-8 max-w-md rounded-lg border border-soka-border bg-white p-6 shadow-sm">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-soka-body">
            {result.busy_slot_percentage}%
          </span>
          <span className="text-soka-muted">busy</span>
        </div>
        <p className="mt-2 text-sm text-soka-muted">
          {result.busy_minutes} of {result.total_minutes} minutes in the window
        </p>
        {result.instructional_minutes != null && (
          <p className="mt-1 text-sm text-soka-muted">
            Total instructional minutes: {result.instructional_minutes}
          </p>
        )}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-soka-surface">
          <div
            className="h-full bg-soka-light-blue transition-all"
            style={{ width: `${Math.min(result.busy_slot_percentage, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
