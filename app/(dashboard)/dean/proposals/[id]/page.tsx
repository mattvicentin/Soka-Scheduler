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

type CalendarScope = "professor" | "all";

function applySlotEdits(
  s: Slot,
  edits: {
    day_of_week?: number;
    start_time?: string;
    end_time?: string;
    building_preference?: string | null;
    room_preference?: string | null;
  }
): Slot {
  return {
    ...s,
    day_of_week: edits.day_of_week ?? s.day_of_week,
    start_time: edits.start_time ?? s.start_time,
    end_time: edits.end_time ?? s.end_time,
    building_preference:
      edits.building_preference !== undefined ? edits.building_preference : s.building_preference,
    room_preference:
      edits.room_preference !== undefined ? edits.room_preference : s.room_preference,
  };
}

export default function DeanProposalDetailPage() {
  const params = useParams();
  const id = (params?.id as string) ?? "";
  const [proposal, setProposal] = useState<Proposal | null>(null);
  /** Draft slots for this proposal’s faculty (editable; from proposal slots API). */
  const [facultySlots, setFacultySlots] = useState<Slot[]>([]);
  /** All sections in the draft term (for full-calendar view). */
  const [allDraftSlots, setAllDraftSlots] = useState<Slot[]>([]);
  const [calendarScope, setCalendarScope] = useState<CalendarScope>("professor");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    apiFetch<Proposal>(`/api/schedule-proposals/${id}`).then((propRes) => {
      const prop = propRes.data as Proposal | undefined;
      if (prop) setProposal(prop);
      if (propRes.error) {
        setError(propRes.error);
        setFacultySlots([]);
        setAllDraftSlots([]);
        setLoading(false);
        return;
      }
      if (!prop?.term_id) {
        setFacultySlots([]);
        setAllDraftSlots([]);
        setLoading(false);
        return;
      }

      Promise.all([
        apiFetch<{ data: Slot[] }>(`/api/schedule-proposals/${id}/slots`),
        apiFetch<{ data: Array<{ id: string; term_id: string; mode: string }> }>(
          "/api/schedule-versions"
        ),
      ]).then(([slotsRes, vRes]) => {
        if (slotsRes.error) setError(slotsRes.error);
        const slotData = (slotsRes.data as { data?: Slot[] })?.data ?? [];
        setFacultySlots(slotData);

        const versions =
          (vRes.data as { data?: Array<{ id: string; term_id: string; mode: string }> })?.data ??
          [];
        const draft = versions.find((v) => v.term_id === prop.term_id && v.mode === "draft");
        if (draft) {
          apiFetch<{ data: Slot[] }>(
            `/api/schedule-slots?term_id=${prop.term_id}&schedule_version_id=${draft.id}`
          ).then((sRes) => {
            const d = (sRes.data as { data?: Slot[] })?.data ?? [];
            setAllDraftSlots(d);
            setLoading(false);
          });
        } else {
          setAllDraftSlots([]);
          setLoading(false);
        }
      });
    });
  }, [id]);

  const displaySlots = calendarScope === "professor" ? facultySlots : allDraftSlots;

  const calendarSlots: CalendarSlot[] = useMemo(
    () =>
      displaySlots.map((s) => ({
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
    [displaySlots]
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

  const canEdit =
    proposal &&
    ["under_review", "revised", "approved"].includes(proposal.status);

  const editSlot = async (
    slotId: string,
    edits: {
      day_of_week?: number;
      start_time?: string;
      end_time?: string;
      building_preference?: string | null;
      room_preference?: string | null;
    }
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
    setFacultySlots((prev) =>
      prev.map((s) => (s.id === slotId ? applySlotEdits(s, edits) : s))
    );
    setAllDraftSlots((prev) =>
      prev.map((s) => (s.id === slotId ? applySlotEdits(s, edits) : s))
    );
    setProposal((p) =>
      p && res.data && typeof res.data === "object" && "status" in res.data
        ? { ...p, status: (res.data as { status: string }).status }
        : p
    );
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

  if (loading || !proposal) {
    return (
      <div>
        <Link href="/dean/proposals" className="text-soka-light-blue hover:underline">
          ← Back to proposals
        </Link>
        <p className="mt-6 text-soka-muted">{loading ? "Loading..." : "Not found."}</p>
      </div>
    );
  }

  const canApprove = ["under_review", "revised"].includes(proposal.status);
  const canFinalize = proposal.status === "approved";
  const canReturnToDirector = proposal.status === "approved";

  const slotRowCanEdit = (s: Slot) =>
    !!canEdit &&
    s.course_offering.instructors.some((i) => i.faculty_id === proposal.faculty_id);

  const hasAnySlots = facultySlots.length > 0 || allDraftSlots.length > 0;

  return (
    <div>
      <Link href="/dean/proposals" className="text-soka-light-blue hover:underline">
        ← Back to proposals
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
          {canApprove && (
            <button
              onClick={() => doAction("approved")}
              disabled={actionLoading}
              className="rounded-md bg-soka-success px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Approve
            </button>
          )}
          {canFinalize && (
            <button
              onClick={() => doAction("finalized")}
              disabled={actionLoading}
              className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover disabled:opacity-50"
            >
              Finalize
            </button>
          )}
          {canReturnToDirector && (
            <button
              onClick={() => doAction("under_review")}
              disabled={actionLoading}
              className="rounded-md border border-soka-border bg-white px-4 py-2 text-sm font-medium text-soka-body hover:bg-soka-surface disabled:opacity-50"
            >
              Return to director
            </button>
          )}
          {["under_review", "revised"].includes(proposal.status) && (
            <button
              onClick={() => doAction("draft")}
              disabled={actionLoading}
              className="rounded-md border border-soka-error bg-white px-4 py-2 text-sm font-medium text-soka-error hover:bg-soka-error/10 disabled:opacity-50"
            >
              Reject
            </button>
          )}
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-soka-body">Schedule slots</h2>
          <p className="mt-1 text-sm text-soka-muted">
            Weekly calendar and list for the draft schedule in {proposal.term.name}. Edit day, times,
            and room preferences the same way as on the director approval page.
          </p>

          {!hasAnySlots ? (
            <p className="mt-4 text-soka-muted">No draft slots for this term.</p>
          ) : (
            <>
              <div className="mt-4">
                <span className="block text-sm font-medium text-soka-body">Calendar view</span>
                <div
                  className="mt-2 inline-flex rounded-md border border-soka-border bg-soka-surface p-1"
                  role="group"
                  aria-label="Calendar scope"
                >
                  <button
                    type="button"
                    onClick={() => setCalendarScope("professor")}
                    className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                      calendarScope === "professor"
                        ? "bg-soka-blue text-white"
                        : "text-soka-muted hover:text-soka-body"
                    }`}
                  >
                    This faculty member
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarScope("all")}
                    className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                      calendarScope === "all"
                        ? "bg-soka-blue text-white"
                        : "text-soka-muted hover:text-soka-body"
                    }`}
                  >
                    Full draft (everyone)
                  </button>
                </div>
                {calendarScope === "all" ? (
                  <p className="mt-2 max-w-2xl text-xs text-soka-muted">
                    All sections in the draft for this term, including other instructors. Use this to
                    check conflicts and overall load while reviewing this proposal. Slot preferences can
                    only be edited for this proposal’s faculty member.
                  </p>
                ) : (
                  <p className="mt-2 max-w-2xl text-xs text-soka-muted">
                    Only sections where {proposal.faculty_name} is listed as an instructor.
                  </p>
                )}
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-semibold text-soka-body">Weekly calendar</h3>
                <div className="mt-2 overflow-x-auto rounded border border-soka-border bg-white">
                  <ScheduleCalendarGrid
                    slotsByDay={slotsByDay}
                    hourRange={[8, 9, 10, 11, 12, 13, 14, 15, 16, 17]}
                    slotStartHour={(time) => Math.floor(slotToMinutes(time) / 60)}
                    renderSlotActions={() => null}
                  />
                </div>
              </div>

              <h3 className="mt-8 text-sm font-semibold text-soka-body">All slots (list)</h3>
              <div className="mt-3 space-y-4">
                {displaySlots.length === 0 ? (
                  <p className="text-sm text-soka-muted">
                    {calendarScope === "professor"
                      ? "No slots for this faculty member in the draft."
                      : "No slots in the draft."}
                  </p>
                ) : (
                  displaySlots
                    .slice()
                    .sort(
                      (a, b) =>
                        a.day_of_week - b.day_of_week ||
                        slotToMinutes(a.start_time) - slotToMinutes(b.start_time)
                    )
                    .map((slot) => (
                      <div
                        key={`${slot.id}-${slot.day_of_week}-${slot.start_time}-${slot.end_time}-${slot.building_preference ?? ""}-${slot.room_preference ?? ""}`}
                        className="rounded border border-soka-border bg-soka-surface p-4 text-sm text-soka-body"
                      >
                        <div className="font-medium">
                          {slot.course_offering.course_code} {slot.course_offering.section_code} —{" "}
                          {slot.course_offering.title}
                        </div>
                        <div className="mt-1 text-soka-muted">
                          {DAY_NAMES[slot.day_of_week]} {slot.start_time}–{slot.end_time}
                        </div>
                        <div className="mt-1 text-xs text-soka-muted">
                          Instructors:{" "}
                          {slot.course_offering.instructors.map((i) => i.name).join(", ")}
                        </div>
                        <div className="mt-2 text-sm">
                          Building: {slot.building_preference ?? "—"} · Room:{" "}
                          {slot.room_preference ?? "—"}
                        </div>
                        {slotRowCanEdit(slot) && (
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
                                  building_preference: e.target.value || null,
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
                    ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
