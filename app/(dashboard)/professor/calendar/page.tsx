"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import {
  ScheduleCalendarGrid,
  DAY_NAMES,
  hourRangeIncludingSlots,
} from "@/app/(dashboard)/components/ScheduleCalendarGrid";
import { HeatmapTable } from "@/app/(dashboard)/components/HeatmapTable";

interface Slot {
  id: string;
  course_offering_id: string;
  schedule_version_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  building_preference: string | null;
  room_preference: string | null;
  course_offering: {
    course_code: string;
    title: string;
    section_code: string;
    instructors: Array<{ name: string; load_share?: number }>;
    programs?: Array<{ program_id: string; program_name: string }>;
  };
}

interface OfferingSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  building_preference: string | null;
  room_preference: string | null;
}

interface AssignedOffering {
  id: string;
  course_template: {
    course_code: string;
    title: string;
    programs: Array<{ program_id: string; program_name: string }>;
  };
  section_code: string;
  my_load_share?: number | null;
  co_instructors: Array<{ name: string }>;
  slots?: OfferingSlot[];
}

/** Standard class blocks (professor calendar). Programs matching EXEMPT use free-form times instead. */
const PRESET_TIME_BLOCKS: Array<{ label: string; start: string; end: string }> = [
  { label: "07:50 - 09:50", start: "07:50", end: "09:50" },
  { label: "08:15 - 09:45", start: "08:15", end: "09:45" },
  { label: "09:00 - 12:00", start: "09:00", end: "12:00" },
  { label: "10:00 - 11:00", start: "10:00", end: "11:00" },
  { label: "10:00 - 11:30", start: "10:00", end: "11:30" },
  { label: "10:00 - 12:00", start: "10:00", end: "12:00" },
  { label: "10:30 - 12:00", start: "10:30", end: "12:00" },
  { label: "12:50 - 14:50", start: "12:50", end: "14:50" },
  { label: "13:00 - 14:30", start: "13:00", end: "14:30" },
  { label: "15:00 - 16:00", start: "15:00", end: "16:00" },
  { label: "15:00 - 16:30", start: "15:00", end: "16:30" },
  { label: "15:00 - 16:50", start: "15:00", end: "16:50" },
  { label: "15:00 - 17:00", start: "15:00", end: "17:00" },
];

const EXEMPT_PROGRAM_FRAGMENTS = ["creative arts", "distinguished topics", "career building"] as const;

function normalizeTimeHm(t: string): string {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t.trim();
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function isExemptFromTimePresets(programs: Array<{ program_name: string }> | undefined): boolean {
  if (!programs?.length) return false;
  return programs.some((p) => {
    const n = p.program_name.toLowerCase();
    return EXEMPT_PROGRAM_FRAGMENTS.some((frag) => n.includes(frag));
  });
}

function findMatchingPresetIndex(start: string, end: string): number | null {
  const s = normalizeTimeHm(start);
  const e = normalizeTimeHm(end);
  const idx = PRESET_TIME_BLOCKS.findIndex(
    (b) => normalizeTimeHm(b.start) === s && normalizeTimeHm(b.end) === e
  );
  return idx >= 0 ? idx : null;
}

function isValidHm(t: string): boolean {
  return /^\d{2}:\d{2}$/.test(normalizeTimeHm(t));
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

function slotToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function messageFromSlotApiError(
  res: { error?: string; details?: unknown }
): string {
  const details = res.details as { errors?: Array<{ message: string }> } | undefined;
  if (details?.errors?.length) {
    return details.errors.map((e) => e.message).join("; ");
  }
  return res.error ?? "Request failed";
}

export default function ProfessorCalendarPage() {
  const searchParams = useSearchParams();
  const termFromUrl = searchParams?.get("term_id");
  const [termId, setTermId] = useState(termFromUrl ?? "");
  const [terms, setTerms] = useState<Array<{ id: string; name: string }>>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [offerings, setOfferings] = useState<AssignedOffering[]>([]);
  const [versions, setVersions] = useState<Array<{ id: string; term_id: string; mode: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [heatmap, setHeatmap] = useState<Array<{ day_of_week: number; hour: number; slot_count: number; pressure: number }>>([]);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [proposal, setProposal] = useState<{ id: string; status: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingPreference, setSavingPreference] = useState<string | null>(null);
  /** Shown above Add/Edit slot modals (z-60) so validation errors aren’t hidden behind them */
  const [slotModalAlert, setSlotModalAlert] = useState<{ title: string; message: string } | null>(
    null
  );

  const draftVersion = termId
    ? versions.find((v) => v.term_id === termId && v.mode === "draft")
    : null;
  const officialVersion = termId
    ? versions.find((v) => v.term_id === termId && v.mode === "official")
    : null;

  useEffect(() => {
    apiFetch<{ data: Array<{ id: string; name: string }> }>("/api/terms").then((r) => {
      const d = (r.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];
      setTerms(d);
      if (d.length > 0 && !termId) setTermId(termFromUrl ?? d[0].id);
    });
    apiFetch<{ data: Array<{ id: string; term_id: string; mode: string }> }>(
      "/api/schedule-versions"
    ).then((r) => {
      const d = (r.data as { data?: Array<{ id: string; term_id: string; mode: string }> })?.data ?? [];
      setVersions(d);
    });
  }, []);

  useEffect(() => {
    if (!termId) return;
    setLoading(true);
    setError(null);
    const version = draftVersion ?? officialVersion;
    Promise.all([
      apiFetch<{ data: AssignedOffering[] }>(`/api/professor/assigned-offerings?term_id=${termId}`),
      version
        ? apiFetch<{ data: Slot[] }>(
            `/api/schedule-slots?term_id=${termId}&schedule_version_id=${version.id}`
          )
        : Promise.resolve({ data: { data: [] } }),
      version
        ? apiFetch<{ data: { cells: Array<{ day_of_week: number; hour: number; slot_count: number; pressure: number }> } }>(
            `/api/heatmap?term_id=${termId}&schedule_version_id=${version.id}`
          )
        : Promise.resolve({ data: { data: { cells: [] } } }),
      apiFetch<{ data: Array<{ id: string; status: string }> }>(`/api/schedule-proposals?term_id=${termId}`),
    ]).then(([offeringsRes, slotsRes, heatmapRes, proposalsRes]) => {
      const o = (offeringsRes.data as { data?: AssignedOffering[] })?.data ?? [];
      const s = (slotsRes.data as { data?: Slot[] })?.data ?? [];
      const h = (heatmapRes.data as { data?: { cells?: Array<{ day_of_week: number; hour: number; slot_count: number; pressure: number }> } })?.data?.cells ?? [];
      const proposals = (proposalsRes.data as { data?: Array<{ id: string; status: string }> })?.data ?? [];
      setOfferings(o);
      setSlots(s);
      setHeatmap(h);
      setProposal(proposals.find((p) => p.status === "draft") ?? proposals[0] ?? null);
      setLoading(false);
    });
  }, [termId, versions, draftVersion?.id, officialVersion?.id]);

  useEffect(() => {
    if (termFromUrl) setTermId(termFromUrl);
  }, [termFromUrl]);

  const ensureDraft = async (): Promise<string | null> => {
    if (draftVersion) return draftVersion.id;
    const res = await apiFetch<{ id: string }>("/api/schedule-versions", {
      method: "POST",
      body: JSON.stringify({ term_id: termId, mode: "draft" }),
    });
    if (res.data?.id) {
      setVersions((v) => [...v, { id: res.data!.id, term_id: termId, mode: "draft" }]);
      return res.data.id;
    }
    if (res.status === 409) {
      const listRes = await apiFetch<{ data: Array<{ id: string; term_id: string; mode: string }> }>(
        `/api/schedule-versions?term_id=${termId}`
      );
      const rows = (listRes.data as { data?: Array<{ id: string; term_id: string; mode: string }> })?.data ?? [];
      const draft = rows.find((v) => v.term_id === termId && v.mode === "draft");
      if (draft) {
        setVersions((prev) => {
          const have = new Set(prev.map((x) => x.id));
          return [...prev, ...rows.filter((r) => !have.has(r.id))];
        });
        return draft.id;
      }
    }
    setError(res.error ?? "Could not create working draft for this term");
    return null;
  };

  const createSlot = async (data: {
    course_offering_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  }) => {
    const versionId = await ensureDraft();
    if (!versionId) return;
    setError(null);
    const res = await apiFetch<{ error?: string; details?: { errors?: Array<{ message: string }> } }>("/api/schedule-slots", {
      method: "POST",
      body: JSON.stringify({
        course_offering_id: data.course_offering_id,
        schedule_version_id: versionId,
        day_of_week: data.day_of_week,
        start_time: data.start_time,
        end_time: data.end_time,
      }),
    });
    if (res.error) {
      setSlotModalAlert({
        title: "Can't add this slot",
        message: messageFromSlotApiError(res),
      });
      setWarnings([]);
      return;
    }
    const created = res.data as { warnings?: Array<{ message: string }>; id: string };
    setWarnings(created?.warnings?.map((w) => w.message) ?? []);
    setSlotModalAlert(null);
    setShowCreate(false);
    const o = offerings.find((x) => x.id === data.course_offering_id);
    setSlots((prev) => [
      ...prev,
      {
        id: created.id,
        course_offering_id: data.course_offering_id,
        schedule_version_id: versionId,
        day_of_week: data.day_of_week,
        start_time: data.start_time,
        end_time: data.end_time,
        building_preference: null,
        room_preference: null,
        course_offering: o
          ? {
              course_code: o.course_template.course_code,
              title: o.course_template.title,
              section_code: o.section_code,
              instructors: o.co_instructors.map((i) => ({ name: i.name })),
            }
          : { course_code: "", title: "", section_code: "", instructors: [] },
      },
    ]);
  };

  const updateSlot = async (
    slotId: string,
    updates: { day_of_week?: number; start_time?: string; end_time?: string; building_preference?: string | null; room_preference?: string | null }
  ) => {
    setError(null);
    const res = await apiFetch(`/api/schedule-slots/${slotId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    if (res.error) {
      setSlotModalAlert({
        title: "Can't update this slot",
        message: messageFromSlotApiError(res),
      });
      return;
    }
    const updated = res.data as { warnings?: Array<{ message: string }> };
    setWarnings(updated?.warnings?.map((w) => w.message) ?? []);
    setSlotModalAlert(null);
    setEditingSlot(null);
    setEditing(null);
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? {
              ...s,
              ...updates,
              start_time: updates.start_time ?? s.start_time,
              end_time: updates.end_time ?? s.end_time,
              day_of_week: updates.day_of_week ?? s.day_of_week,
              building_preference: updates.building_preference !== undefined ? updates.building_preference : s.building_preference,
              room_preference: updates.room_preference !== undefined ? updates.room_preference : s.room_preference,
            }
          : s
      )
    );
  };

  const moveSlot = async (
    slotId: string,
    newDay: number,
    newStart: string,
    newEnd: string
  ) => {
    setEditing(slotId);
    setError(null);
    await updateSlot(slotId, { day_of_week: newDay, start_time: newStart, end_time: newEnd });
    setEditing(null);
  };

  const deleteSlot = async (slotId: string) => {
    if (!confirm("Delete this slot?")) return;
    setError(null);
    const res = await apiFetch(`/api/schedule-slots/${slotId}`, { method: "DELETE" });
    if (res.error) {
      setError(res.error);
      return;
    }
    setSlots((prev) => prev.filter((s) => s.id !== slotId));
    setEditingSlot(null);
  };

  const updateSlotPreference = async (
    slotId: string,
    building: string | null,
    room: string | null
  ) => {
    setSavingPreference(slotId);
    setError(null);
    const res = await apiFetch(`/api/schedule-slots/${slotId}`, {
      method: "PATCH",
      body: JSON.stringify({
        building_preference: building || null,
        room_preference: room || null,
      }),
    });
    setSavingPreference(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? { ...s, building_preference: building, room_preference: room }
          : s
      )
    );
  };

  const getOrCreateDraftProposal = async (): Promise<string | null> => {
    const proposalsRes = await apiFetch<{ data: Array<{ id: string; status: string }> }>(
      `/api/schedule-proposals?term_id=${termId}`
    );
    const proposals = (proposalsRes.data as { data?: Array<{ id: string; status: string }> })?.data ?? [];
    let draft = proposals.find((p) => p.status === "draft");
    if (!draft) {
      const createRes = await apiFetch<{ id: string }>("/api/schedule-proposals", {
        method: "POST",
        body: JSON.stringify({ term_id: termId }),
      });
      const created = createRes.data as { id: string } | undefined;
      if (created?.id) {
        draft = { id: created.id, status: "draft" };
        setProposal(draft);
      }
    }
    return draft?.id ?? null;
  };

  const submitProposal = async () => {
    const proposalId = await getOrCreateDraftProposal();
    if (!proposalId) {
      setError("Could not create or find draft proposal.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await apiFetch(`/api/schedule-proposals/${proposalId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "submitted" }),
    });
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setProposal((p) => (p ? { ...p, status: "submitted" } : null));
  };

  // Use schedule-slots when available; otherwise derive from offerings (which always include slots server-side)
  const effectiveSlots: Slot[] =
    slots.length > 0
      ? slots
      : offerings.flatMap((o) =>
          (o.slots ?? []).map((s) => ({
            id: s.id,
            course_offering_id: o.id,
            schedule_version_id: "",
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
            building_preference: s.building_preference,
            room_preference: s.room_preference,
            course_offering: {
              course_code: o.course_template.course_code,
              title: o.course_template.title,
              section_code: o.section_code,
              instructors: [{ name: "You" }, ...o.co_instructors],
              programs: o.course_template.programs,
            },
          }))
        );

  const offeringsWithSlots = offerings.map((o) => ({
    ...o,
    slots: effectiveSlots.filter((s) => s.course_offering_id === o.id),
  }));

  const slotsByDay = DAY_NAMES.slice(1).map((_, i) => {
    const day = i + 1;
    return effectiveSlots
      .filter((s) => s.day_of_week === day)
      .sort((a, b) => slotToMinutes(a.start_time) - slotToMinutes(b.start_time));
  });

  const offeringsForModal = offerings.map((o) => ({
    id: o.id,
    course_template: o.course_template,
    section_code: o.section_code,
    instructors: o.co_instructors.map((i) => ({ faculty_name: i.name })),
  }));

  function slotWithPrograms(s: Slot): Slot {
    const o = offerings.find((x) => x.id === s.course_offering_id);
    const programs = o?.course_template.programs;
    if (!programs?.length && !s.course_offering.programs?.length) return s;
    return {
      ...s,
      course_offering: {
        ...s.course_offering,
        programs: programs ?? s.course_offering.programs,
      },
    };
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">My Calendar</h1>
      <p className="mt-1 text-soka-muted">
        Add preferred time slots for courses you teach. View and edit your slots.
      </p>

      <div className="mt-6 flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-soka-body">Term</label>
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="mt-1 block w-48 rounded-md border border-soka-border px-3 py-2 text-sm"
          >
            <option value="">Select term</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {termId && (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
            <button
              type="button"
              onClick={() => {
                setSlotModalAlert(null);
                setShowCreate(true);
              }}
              className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
            >
              Add slot
            </button>
            {!draftVersion && (
              <p className="text-sm text-soka-muted">
                {officialVersion
                  ? "New slots are added on a working draft (the published schedule stays unchanged until a dean publishes updates)."
                  : "Your slots are stored on the term’s working draft schedule."}
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded bg-soka-error/10 p-3 text-sm text-soka-error">{error}</div>
      )}
      {warnings.length > 0 && (
        <div className="mt-4 rounded bg-soka-warning/10 p-3 text-sm text-soka-warning">
          Note: {warnings.join(" ")}
        </div>
      )}

      {showCreate && (
        <CreateSlotModal
          offerings={offeringsForModal}
          onClose={() => {
            setShowCreate(false);
            setSlotModalAlert(null);
          }}
          onCreate={createSlot}
        />
      )}

      {editingSlot && (
        <EditSlotModal
          slot={slotWithPrograms(editingSlot)}
          onClose={() => {
            setEditingSlot(null);
            setSlotModalAlert(null);
          }}
          onSave={(updates) => updateSlot(editingSlot.id, updates)}
          onDelete={() => deleteSlot(editingSlot.id)}
        />
      )}

      {slotModalAlert && (
        <SlotBlockingAlertModal
          title={slotModalAlert.title}
          message={slotModalAlert.message}
          onDismiss={() => setSlotModalAlert(null)}
        />
      )}

      {loading ? (
        <p className="mt-6 text-soka-muted">Loading...</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <ScheduleCalendarGrid
            slotsByDay={slotsByDay}
            hourRange={hourRangeIncludingSlots(slotsByDay)}
            slotStartHour={(time) => Math.floor(slotToMinutes(time) / 60)}
            highlightedSlotId={editing}
            renderSlotActions={(slot) =>
              !draftVersion ? null : editing === slot.id ? (
                <span className="text-soka-disabled">Moving...</span>
              ) : (
                <>
                  <button
                    onClick={() => {
                      const full = slots.find((s) => s.id === slot.id);
                      if (full) setEditingSlot(full);
                    }}
                    className="text-soka-light-blue hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      const newDay = prompt("New day (1-5):", String(slot.day_of_week));
                      const newStart = prompt("New start (HH:MM):", slot.start_time);
                      const newEnd = prompt("New end (HH:MM):", slot.end_time);
                      if (newDay && newStart && newEnd) {
                        moveSlot(slot.id, parseInt(newDay, 10), newStart, newEnd);
                      }
                    }}
                    className="ml-2 text-soka-light-blue hover:underline"
                  >
                    Move
                  </button>
                  <button
                    onClick={() => deleteSlot(slot.id)}
                    className="ml-2 text-soka-error hover:underline"
                  >
                    Delete
                  </button>
                </>
              )
            }
          />
          <div className="mt-4 text-sm text-soka-muted">
            {effectiveSlots.length} slot(s) for your courses.
          </div>

          {offeringsWithSlots.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-soka-body">My offerings</h2>
              <p className="mt-1 text-sm text-soka-muted">
                {draftVersion
                  ? "Edit building/room preferences and delete slots as needed. Submit when ready for director review."
                  : "Viewing published schedule. Slots cannot be edited."}
              </p>
              <div className="mt-4 space-y-6">
                {offeringsWithSlots.map((o) => (
                  <div
                    key={o.id}
                    className="rounded-lg border border-soka-border bg-white p-4 shadow-sm"
                  >
                    <h3 className="font-medium text-soka-body">
                      {o.course_template.course_code} — {o.course_template.title}
                    </h3>
                    <p className="mt-1 text-sm text-soka-muted">
                      Section {o.section_code}
                      {o.my_load_share != null && ` · Your load: ${o.my_load_share}`}
                      {o.co_instructors.length > 0 && (
                        <> · Co-instructors: {o.co_instructors.map((c) => c.name).join(", ")}</>
                      )}
                    </p>
                    {o.slots.length === 0 ? (
                      <p className="mt-3 text-sm text-soka-muted">No slots yet. Add slots above.</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {o.slots.map((s) => (
                          <div
                            key={s.id}
                            className="flex flex-wrap items-center gap-3 rounded border border-soka-border bg-soka-surface p-3"
                          >
                            <span className="font-medium text-soka-body">
                              {DAY_NAMES[s.day_of_week]} {s.start_time}–{s.end_time}
                            </span>
                            {draftVersion && (
                              <>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-soka-muted">Building</label>
                                  <select
                                    value={s.building_preference ?? ""}
                                    onChange={(e) =>
                                      updateSlotPreference(
                                        s.id,
                                        e.target.value || null,
                                        s.room_preference
                                      )
                                    }
                                    disabled={savingPreference === s.id}
                                    className="rounded border border-soka-border px-2 py-1 text-sm"
                                  >
                                    {BUILDING_OPTIONS.map((opt) => (
                                      <option key={opt.value || "none"} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-soka-muted">Room</label>
                                  <input
                                    key={`${s.id}-${s.room_preference ?? ""}`}
                                    type="text"
                                    defaultValue={s.room_preference ?? ""}
                                    onBlur={(e) => {
                                      const v = e.target.value.trim() || null;
                                      if (v !== (s.room_preference ?? "")) {
                                        updateSlotPreference(s.id, s.building_preference, v);
                                      }
                                    }}
                                    placeholder="Optional"
                                    disabled={savingPreference === s.id}
                                    className="w-28 rounded border border-soka-border px-2 py-1 text-sm"
                                  />
                                </div>
                                <button
                                  onClick={() => deleteSlot(s.id)}
                                  className="text-sm text-soka-error hover:underline"
                                >
                                  Delete
                                </button>
                                {savingPreference === s.id && (
                                  <span className="text-xs text-soka-muted">Saving...</span>
                                )}
                              </>
                            )}
                            {!draftVersion && (s.building_preference || s.room_preference) && (
                              <span className="text-sm text-soka-muted">
                                {[s.building_preference, s.room_preference].filter(Boolean).join(" ")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {proposal && proposal.status !== "draft" && (
                <p className="mt-4 text-sm text-soka-muted">
                  Status: <span className="font-medium">{proposal.status}</span>.{" "}
                  <Link href="/professor/proposal" className="text-soka-light-blue hover:underline">
                    My Proposal
                  </Link>{" "}
                  has full details.
                </p>
              )}
            </section>
          )}

          {draftVersion && (
            <div className="mt-6">
              <button
                onClick={() => setShowHeatmap(!showHeatmap)}
                className="text-sm text-soka-light-blue hover:underline"
              >
                {showHeatmap ? "Hide" : "Show"} time-block pressure heatmap
              </button>
              {showHeatmap && heatmap.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <HeatmapTable cells={heatmap} />
                </div>
              )}
            </div>
          )}

          {draftVersion && termId && (
            <section className="mt-10 border-t border-soka-border pt-8">
              <h2 className="text-lg font-semibold text-soka-body">Submit your proposal</h2>
              <p className="mt-2 max-w-2xl text-sm text-soka-muted">
                When your time slots and preferences are ready, send them to your director for review. You
                can also manage status and details on{" "}
                <Link href="/professor/proposal" className="font-medium text-soka-light-blue hover:underline">
                  My Proposal
                </Link>
                .
              </p>
              {(!proposal || proposal.status === "draft") && (
                <button
                  type="button"
                  onClick={submitProposal}
                  disabled={submitting}
                  className="mt-4 rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit my schedule for review"}
                </button>
              )}
              {proposal && proposal.status !== "draft" && (
                <p className="mt-4 text-sm text-soka-muted">
                  This term&apos;s proposal status:{" "}
                  <span className="font-medium text-soka-body">{proposal.status.replace(/_/g, " ")}</span>
                  .{" "}
                  <Link href="/professor/proposal" className="text-soka-light-blue hover:underline">
                    Open My Proposal
                  </Link>{" "}
                  for full details.
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SlotTimeControls({
  exempt,
  start,
  end,
  onStartChange,
  onEndChange,
  presetIndex,
  onPresetIndexChange,
  useOtherTime,
  onUseOtherTime,
}: {
  exempt: boolean;
  start: string;
  end: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  presetIndex: number;
  onPresetIndexChange: (i: number) => void;
  useOtherTime: boolean;
  onUseOtherTime: (v: boolean) => void;
}) {
  if (exempt) {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-soka-body">Start</label>
          <input
            type="text"
            value={start}
            onChange={(e) => onStartChange(e.target.value)}
            placeholder="10:00"
            className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-soka-body">End</label>
          <input
            type="text"
            value={end}
            onChange={(e) => onEndChange(e.target.value)}
            placeholder="11:30"
            className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!useOtherTime ? (
        <>
          <div>
            <label className="block text-sm font-medium text-soka-body">Time</label>
            <select
              value={presetIndex}
              onChange={(e) => {
                const i = parseInt(e.target.value, 10);
                onPresetIndexChange(i);
                const b = PRESET_TIME_BLOCKS[i];
                onStartChange(b.start);
                onEndChange(b.end);
              }}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              {PRESET_TIME_BLOCKS.map((b, i) => (
                <option key={b.label} value={i}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => onUseOtherTime(true)}
            className="text-sm font-medium text-soka-light-blue hover:underline"
          >
            Other time
          </button>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-soka-body">Start</label>
              <input
                type="text"
                value={start}
                onChange={(e) => onStartChange(e.target.value)}
                placeholder="10:00"
                className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-soka-body">End</label>
              <input
                type="text"
                value={end}
                onChange={(e) => onEndChange(e.target.value)}
                placeholder="11:30"
                className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onUseOtherTime(false);
              const b = PRESET_TIME_BLOCKS[presetIndex];
              onStartChange(b.start);
              onEndChange(b.end);
            }}
            className="text-sm font-medium text-soka-light-blue hover:underline"
          >
            Use standard blocks
          </button>
        </>
      )}
    </div>
  );
}

function SlotBlockingAlertModal({
  title,
  message,
  onDismiss,
}: {
  title: string;
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="slot-blocking-alert-title"
    >
      <div className="w-full max-w-md rounded-lg border border-soka-border bg-white p-6 shadow-xl">
        <h3 id="slot-blocking-alert-title" className="text-lg font-semibold text-soka-body">
          {title}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-soka-body">{message}</p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateSlotModal({
  offerings,
  onClose,
  onCreate,
}: {
  offerings: Array<{
    id: string;
    course_template: {
      course_code: string;
      title: string;
      programs: Array<{ program_id: string; program_name: string }>;
    };
    section_code: string;
    instructors: Array<{ faculty_name: string }>;
  }>;
  onClose: () => void;
  onCreate: (data: {
    course_offering_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  }) => void;
}) {
  const [offeringId, setOfferingId] = useState("");
  const [day, setDay] = useState(1);
  const [start, setStart] = useState(PRESET_TIME_BLOCKS[0].start);
  const [end, setEnd] = useState(PRESET_TIME_BLOCKS[0].end);
  const [presetIndex, setPresetIndex] = useState(0);
  const [useOtherTime, setUseOtherTime] = useState(false);

  const selected = useMemo(
    () => offerings.find((o) => o.id === offeringId),
    [offerings, offeringId]
  );
  const exempt = isExemptFromTimePresets(selected?.course_template.programs);

  useEffect(() => {
    if (!offeringId || !selected) return;
    if (isExemptFromTimePresets(selected.course_template.programs)) {
      setUseOtherTime(false);
      setStart("10:00");
      setEnd("11:30");
    } else {
      setUseOtherTime(false);
      setPresetIndex(0);
      setStart(PRESET_TIME_BLOCKS[0].start);
      setEnd(PRESET_TIME_BLOCKS[0].end);
    }
  }, [offeringId, selected]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-soka-body">Add preferred slot</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="prof-calendar-create-offering" className="block text-sm font-medium text-soka-body">
              Course
            </label>
            <select
              id="prof-calendar-create-offering"
              value={offeringId}
              onChange={(e) => setOfferingId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              <option value="">Select course</option>
              {offerings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.course_template.course_code} {o.section_code} — {o.course_template.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="prof-calendar-create-day" className="block text-sm font-medium text-soka-body">
              Day
            </label>
            <select
              id="prof-calendar-create-day"
              value={day}
              onChange={(e) => setDay(parseInt(e.target.value, 10))}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>
                  {DAY_NAMES[d]}
                </option>
              ))}
            </select>
          </div>
          <SlotTimeControls
            exempt={exempt}
            start={start}
            end={end}
            onStartChange={setStart}
            onEndChange={setEnd}
            presetIndex={presetIndex}
            onPresetIndexChange={setPresetIndex}
            useOtherTime={useOtherTime}
            onUseOtherTime={setUseOtherTime}
          />
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
              const startNorm = normalizeTimeHm(start);
              const endNorm = normalizeTimeHm(end);
              if (offeringId && isValidHm(start) && isValidHm(end)) {
                onCreate({
                  course_offering_id: offeringId,
                  day_of_week: day,
                  start_time: startNorm,
                  end_time: endNorm,
                });
              } else {
                alert("Select course and use time format HH:MM (e.g. 09:00)");
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

function EditSlotModal({
  slot,
  onClose,
  onSave,
  onDelete,
}: {
  slot: Slot;
  onClose: () => void;
  onSave: (updates: {
    day_of_week?: number;
    start_time?: string;
    end_time?: string;
    building_preference?: string | null;
    room_preference?: string | null;
  }) => void;
  onDelete: () => void;
}) {
  const [day, setDay] = useState(slot.day_of_week);
  const [start, setStart] = useState(slot.start_time);
  const [end, setEnd] = useState(slot.end_time);
  const [building, setBuilding] = useState(slot.building_preference ?? "");
  const [room, setRoom] = useState(slot.room_preference ?? "");
  const [presetIndex, setPresetIndex] = useState(0);
  const [useOtherTime, setUseOtherTime] = useState(false);

  const exempt = isExemptFromTimePresets(slot.course_offering.programs);

  useEffect(() => {
    setDay(slot.day_of_week);
    setStart(slot.start_time);
    setEnd(slot.end_time);
    setBuilding(slot.building_preference ?? "");
    setRoom(slot.room_preference ?? "");
    const ex = isExemptFromTimePresets(slot.course_offering.programs);
    if (ex) {
      setUseOtherTime(false);
      setPresetIndex(0);
    } else {
      const idx = findMatchingPresetIndex(slot.start_time, slot.end_time);
      if (idx !== null) {
        setPresetIndex(idx);
        setUseOtherTime(false);
      } else {
        setPresetIndex(0);
        setUseOtherTime(true);
      }
    }
  }, [
    slot.id,
    slot.day_of_week,
    slot.start_time,
    slot.end_time,
    slot.building_preference,
    slot.room_preference,
    slot.course_offering.programs,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-soka-body">
          Edit {slot.course_offering.course_code} {slot.course_offering.section_code}
        </h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-soka-body">Day</label>
            <select
              value={day}
              onChange={(e) => setDay(parseInt(e.target.value, 10))}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>
                  {DAY_NAMES[d]}
                </option>
              ))}
            </select>
          </div>
          <SlotTimeControls
            exempt={exempt}
            start={start}
            end={end}
            onStartChange={setStart}
            onEndChange={setEnd}
            presetIndex={presetIndex}
            onPresetIndexChange={setPresetIndex}
            useOtherTime={useOtherTime}
            onUseOtherTime={setUseOtherTime}
          />
          <div>
            <label className="block text-sm font-medium text-soka-body">Building</label>
            <select
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              {BUILDING_OPTIONS.map((o) => (
                <option key={o.value || "x"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Room</label>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-between">
          <button
            onClick={onDelete}
            className="rounded-md border border-soka-error px-4 py-2 text-sm font-medium text-soka-error hover:bg-soka-error/10"
          >
            Delete slot
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-soka-border px-4 py-2 text-sm font-medium text-soka-body hover:bg-soka-surface"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!isValidHm(start) || !isValidHm(end)) {
                  alert("Use time format HH:MM (e.g. 09:00)");
                  return;
                }
                onSave({
                  day_of_week: day,
                  start_time: normalizeTimeHm(start),
                  end_time: normalizeTimeHm(end),
                  building_preference: building || null,
                  room_preference: room || null,
                });
              }}
              className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
