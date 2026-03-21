"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import {
  ScheduleCalendarGrid,
  DAY_NAMES as CAL_DAY_NAMES,
} from "@/app/(dashboard)/components/ScheduleCalendarGrid";
import type { CalendarSlot } from "@/app/(dashboard)/components/ScheduleCalendarGrid";

interface Proposal {
  id: string;
  faculty_id: string;
  faculty_name: string;
  term_id: string;
  term: { name: string };
  status: string;
}

interface Slot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  building_preference: string | null;
  room_preference: string | null;
  course_offering: {
    course_code: string;
    title: string;
    section_code: string;
    instructors: Array<{ faculty_id: string; name: string }>;
  };
}

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

function slotToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Accepts "9:30" or "09:30"; returns HH:MM or null if invalid. */
function normalizeTimeInput(raw: string): string | null {
  const v = raw.trim();
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function formatApiError(res: { error?: string; details?: unknown }): string {
  if (!res.error) return "Request failed";
  if (res.details == null) return res.error;
  const extra =
    typeof res.details === "string"
      ? res.details
      : JSON.stringify(res.details, null, 2);
  return `${res.error}\n${extra}`;
}
const BUILDING_OPTIONS = [
  { value: "", label: "—" },
  { value: "ikeda", label: "Ikeda" },
  { value: "gandhi", label: "Gandhi" },
  { value: "pauling", label: "Pauling" },
  { value: "curie", label: "Curie" },
  { value: "maathai", label: "Maathai" },
  { value: "other", label: "Other" },
];

type SlotEditLog = {
  slot_id?: string;
  day_of_week?: number;
  start_time?: string;
  end_time?: string;
  building_preference?: string | null;
  room_preference?: string | null;
};

function buildingPreferenceLabel(v: string | null | undefined): string {
  if (v == null || v === "") return "none";
  const o = BUILDING_OPTIONS.find((b) => b.value === v);
  return o?.label ?? v;
}

/** Turns API log lines like `350 01: {"start_time":"09:30"}` into plain language. */
function phrasesForSlotEdit(edit: SlotEditLog): string[] {
  const parts: string[] = [];
  if (edit.day_of_week !== undefined) {
    const d = DAY_NAMES[edit.day_of_week] ?? `weekday ${edit.day_of_week}`;
    parts.push(`class moved to ${d}`);
  }
  if (edit.start_time !== undefined) parts.push(`start time set to ${edit.start_time}`);
  if (edit.end_time !== undefined) parts.push(`end time set to ${edit.end_time}`);
  if (edit.building_preference !== undefined) {
    parts.push(`building set to ${buildingPreferenceLabel(edit.building_preference)}`);
  }
  if (edit.room_preference !== undefined) {
    parts.push(`room set to ${edit.room_preference?.trim() ? edit.room_preference : "none"}`);
  }
  return parts;
}

function parseRevisionLogLine(line: string): { course: string; summary: string } | null {
  const m = line.match(/^(.+): (\{[\s\S]*\})$/);
  if (!m) return null;
  const course = m[1].trim();
  try {
    const edit = JSON.parse(m[2]) as SlotEditLog;
    const phrases = phrasesForSlotEdit(edit);
    if (phrases.length === 0) return { course, summary: "Slot was updated." };
    return { course, summary: phrases.join("; ") };
  } catch {
    return { course, summary: "Schedule change recorded." };
  }
}

/** Human-readable bullets from stored `changes_summary` (director slot edits). */
function revisionSummaryLines(changes_summary: unknown): string[] {
  if (
    changes_summary &&
    typeof changes_summary === "object" &&
    "changes" in changes_summary &&
    Array.isArray((changes_summary as { changes: unknown }).changes)
  ) {
    const changes = (changes_summary as { changes: unknown[] }).changes;
    const out: string[] = [];
    for (const line of changes) {
      if (typeof line !== "string") continue;
      const parsed = parseRevisionLogLine(line);
      out.push(parsed ? `${parsed.course} — ${parsed.summary}` : line);
    }
    return out.length > 0 ? out : ["No details were saved for this entry."];
  }
  return ["Change recorded, but details are not in a readable format."];
}

export default function DirectorProposalDetailPage() {
  const params = useParams();
  const id = (params?.id as string) ?? "";
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [revisions, setRevisions] = useState<
    Array<{ id: string; edited_at: string; edited_by_email: string; changes_summary: unknown }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<Proposal>(`/api/schedule-proposals/${id}`),
      apiFetch<{ data: Slot[] }>(`/api/schedule-proposals/${id}/slots`),
      apiFetch<{
        data: Array<{ id: string; edited_at: string; edited_by_email: string; changes_summary: unknown }>;
      }>(`/api/schedule-proposals/${id}/revisions`),
    ]).then(([propRes, slotsRes, revRes]) => {
      const prop = propRes.data as Proposal | undefined;
      if (prop) setProposal(prop);
      if (propRes.error) setError(propRes.error);
      else if (slotsRes.error) setError(slotsRes.error);

      const slotData = (slotsRes.data as { data?: Slot[] })?.data ?? [];
      setSlots(slotData);

      const revData =
        (revRes.data as {
          data?: Array<{ id: string; edited_at: string; edited_by_email: string; changes_summary: unknown }>;
        })?.data ?? [];
      setRevisions(revData);
      setLoading(false);
    });
  }, [id]);

  const proposalSlots = slots;

  const calendarSlots: CalendarSlot[] = useMemo(
    () =>
      proposalSlots.map((s) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        course_offering: {
          course_code: s.course_offering.course_code,
          section_code: s.course_offering.section_code,
          instructors: s.course_offering.instructors.map((i) => ({ name: i.name })),
        },
      })),
    [proposalSlots]
  );

  const slotsByDay = useMemo(
    () =>
      CAL_DAY_NAMES.slice(1).map((_, i) => {
        const day = i + 1;
        return calendarSlots
          .filter((s) => s.day_of_week === day)
          .sort((a, b) => slotToMinutes(a.start_time) - slotToMinutes(b.start_time));
      }),
    [calendarSlots]
  );

  const canEdit = proposal && ["under_review", "revised", "submitted"].includes(proposal.status);
  const canApprove = proposal && ["under_review", "revised"].includes(proposal.status);
  const canReject = proposal && ["under_review", "revised"].includes(proposal.status);

  const editSlot = async (
    slotId: string,
    edits: { day_of_week?: number; start_time?: string; end_time?: string; building_preference?: string | null; room_preference?: string | null }
  ) => {
    if (!id) return;
    setActionLoading(true);
    setError(null);
    const res = await apiFetch(`/api/schedule-proposals/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        slot_edits: [{ slot_id: slotId, ...edits }],
      }),
    });
    setActionLoading(false);
    if (res.error) {
      setError(formatApiError(res as { error?: string; details?: unknown }));
      return;
    }
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? {
              ...s,
              day_of_week: edits.day_of_week ?? s.day_of_week,
              start_time: edits.start_time ?? s.start_time,
              end_time: edits.end_time ?? s.end_time,
              building_preference: edits.building_preference !== undefined ? edits.building_preference : s.building_preference,
              room_preference: edits.room_preference !== undefined ? edits.room_preference : s.room_preference,
            }
          : s
      )
    );
    setProposal((p) => (p && res.data && typeof res.data === "object" && "status" in res.data ? { ...p, status: (res.data as { status: string }).status } : p));
  };

  const doAction = async (status: string) => {
    if (!id) return;
    setActionLoading(true);
    setError(null);
    const res = await apiFetch(`/api/schedule-proposals/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setActionLoading(false);
    if (res.error) {
      setError(formatApiError(res as { error?: string; details?: unknown }));
      return;
    }
    if (res.data && typeof res.data === "object" && "status" in res.data) {
      setProposal((p) => (p ? { ...p, status: (res.data as { status: string }).status } : null));
    }
  };

  const pickUp = async () => {
    await doAction("under_review");
  };

  if (loading || !proposal) {
    return (
      <div>
        <Link href="/director/approvals" className="text-soka-light-blue hover:underline">
          ← Back to approvals
        </Link>
        <p className="mt-6 text-soka-muted">
          {loading ? "Loading..." : "Proposal not found."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/director/approvals" className="text-soka-light-blue hover:underline">
        ← Back to approvals
      </Link>

      <div className="mt-6 rounded-lg border border-soka-border bg-white p-6">
        <h1 className="text-xl font-bold text-soka-body">
          {proposal.faculty_name} — {proposal.term.name}
        </h1>
        <p className="mt-1 text-soka-muted">Status: {proposal.status.replace("_", " ")}</p>

        {error && (
          <div className="mt-4 whitespace-pre-wrap rounded bg-soka-error/10 p-3 text-sm text-soka-error">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {proposal.status === "submitted" && (
            <button
              onClick={pickUp}
              disabled={actionLoading}
              className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover disabled:opacity-50"
            >
              Pick up for review
            </button>
          )}
          {canApprove && (
            <button
              onClick={() => doAction("approved")}
              disabled={actionLoading}
              className="rounded-md bg-soka-success px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Approve
            </button>
          )}
          {canReject && (
            <button
              onClick={() => doAction("draft")}
              disabled={actionLoading}
              className="rounded-md border border-soka-error bg-white px-4 py-2 text-sm font-medium text-soka-error hover:bg-soka-error/10 disabled:opacity-50"
            >
              Reject (return to draft)
            </button>
          )}
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-soka-body">Schedule slots</h2>
          <p className="mt-1 text-sm text-soka-muted">
            Weekly view and list of draft slots for this faculty member in {proposal.term.name}.
          </p>
          {proposalSlots.length === 0 ? (
            <p className="mt-4 text-soka-muted">No slots assigned yet for this faculty in the draft schedule.</p>
          ) : (
            <>
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-soka-body">Weekly calendar</h3>
                <div className="mt-2 overflow-x-auto rounded border border-soka-border bg-white">
                  <ScheduleCalendarGrid
                    slotsByDay={slotsByDay}
                    hourRange={[8, 9, 10, 11, 12, 13, 14, 15, 16, 17]}
                    slotStartHour={(t) => Math.floor(slotToMinutes(t) / 60)}
                    renderSlotActions={() => null}
                  />
                </div>
              </div>

              <h3 className="mt-8 text-sm font-semibold text-soka-body">All slots (list)</h3>
              <div className="mt-3 space-y-4">
              {proposalSlots.map((slot) => (
                <div
                  key={`${slot.id}-${slot.day_of_week}-${slot.start_time}-${slot.end_time}-${slot.building_preference ?? ""}-${slot.room_preference ?? ""}`}
                  className="rounded border border-soka-border bg-soka-surface p-4"
                >
                  <div className="font-medium text-soka-body">
                    {slot.course_offering.course_code} {slot.course_offering.section_code} —{" "}
                    {slot.course_offering.title}
                  </div>
                  <div className="mt-1 text-sm text-soka-muted">
                    {DAY_NAMES[slot.day_of_week]} {slot.start_time}–{slot.end_time}
                  </div>
                  <div className="mt-1 text-sm text-soka-muted">
                    Instructors:{" "}
                    {slot.course_offering.instructors.map((i) => i.name).join(", ")}
                  </div>
                  <div className="mt-2 text-sm">
                    Building: {slot.building_preference ?? "—"} · Room:{" "}
                    {slot.room_preference ?? "—"}
                  </div>
                  {canEdit && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <select
                        defaultValue={slot.day_of_week}
                        onChange={(e) =>
                          editSlot(slot.id, {
                            day_of_week: parseInt(e.target.value, 10),
                          })
                        }
                        className="rounded border border-soka-border px-2 py-1 text-xs"
                      >
                        {[1, 2, 3, 4, 5].map((d) => (
                          <option key={d} value={d}>
                            {DAY_NAMES[d]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        defaultValue={slot.start_time}
                        onBlur={(e) => {
                          const normalized = normalizeTimeInput(e.target.value);
                          if (normalized && normalized !== slot.start_time) {
                            editSlot(slot.id, { start_time: normalized });
                          }
                        }}
                        className="w-16 rounded border border-soka-border px-2 py-1 text-xs"
                        placeholder="Start"
                      />
                      <input
                        type="text"
                        defaultValue={slot.end_time}
                        onBlur={(e) => {
                          const normalized = normalizeTimeInput(e.target.value);
                          if (normalized && normalized !== slot.end_time) {
                            editSlot(slot.id, { end_time: normalized });
                          }
                        }}
                        className="w-16 rounded border border-soka-border px-2 py-1 text-xs"
                        placeholder="End"
                      />
                      <select
                        defaultValue={slot.building_preference ?? ""}
                        onChange={(e) =>
                          editSlot(slot.id, {
                            building_preference:
                              e.target.value || null,
                          })
                        }
                        className="rounded border border-soka-border px-2 py-1 text-xs"
                      >
                        {BUILDING_OPTIONS.map((o) => (
                          <option key={o.value || "x"} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        defaultValue={slot.room_preference ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim() || null;
                          if (v !== (slot.room_preference ?? "")) {
                            editSlot(slot.id, { room_preference: v });
                          }
                        }}
                        className="w-24 rounded border border-soka-border px-2 py-1 text-xs"
                        placeholder="Room"
                      />
                    </div>
                  )}
                </div>
              ))}
              </div>
            </>
          )}
        </div>

        {revisions.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-soka-body">Revision history</h2>
            <p className="mt-1 text-sm text-soka-muted">
              A short log of when someone with scheduling access changed draft class times or room
              preferences on this proposal. Faculty do not see this page; it is for your records.
            </p>
            <ul className="mt-4 space-y-3">
              {revisions.map((r) => (
                <li
                  key={r.id}
                  className="rounded border border-soka-border bg-soka-surface p-3 text-sm"
                >
                  <div className="font-medium text-soka-body">
                    {new Date(r.edited_at).toLocaleString()}
                  </div>
                  <div className="text-soka-muted">By {r.edited_by_email}</div>
                  {r.changes_summary != null ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-soka-body">
                      {revisionSummaryLines(r.changes_summary).map((line, j) => (
                        <li key={j}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
