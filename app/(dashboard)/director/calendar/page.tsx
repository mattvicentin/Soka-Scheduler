"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { ScheduleCalendarGrid, DAY_NAMES } from "@/app/(dashboard)/components/ScheduleCalendarGrid";
import { HeatmapTable } from "@/app/(dashboard)/components/HeatmapTable";

interface Slot {
  id: string;
  course_offering_id?: string;
  schedule_version_id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  building_preference: string | null;
  room_preference: string | null;
  version?: number;
  course_offering: {
    course_code: string;
    title: string;
    section_code: string;
    instructors: Array<{ name: string; load_share?: number }>;
  };
}

interface Offering {
  id: string;
  course_template: { course_code: string; title: string; programs: Array<{ program_id: string }> };
  section_code: string;
  instructors: Array<{ faculty_name: string }>;
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

export default function DirectorCalendarPage() {
  const [termId, setTermId] = useState("");
  const [programId, setProgramId] = useState("");
  const [terms, setTerms] = useState<Array<{ id: string; name: string }>>([]);
  const [programs, setPrograms] = useState<Array<{ program_id: string; program_name: string }>>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [versions, setVersions] = useState<Array<{ id: string; term_id: string; mode: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [heatmap, setHeatmap] = useState<Array<{ day_of_week: number; hour: number; slot_count: number; pressure: number }>>([]);
  const [showHeatmap, setShowHeatmap] = useState(false);

  useEffect(() => {
    apiFetch<{ data: Array<{ id: string; name: string }> }>("/api/terms").then(
      (r) => {
        const d = (r.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];
        setTerms(d);
        if (d.length > 0 && !termId) setTermId(d[0].id);
      }
    );
    apiFetch<{ program_associations?: Array<{ program_id: string; program_name: string }> }>(
      "/api/accounts/me"
    ).then((r) => {
      const a = (r.data as { program_associations?: Array<{ program_id: string; program_name: string }> })?.program_associations ?? [];
      setPrograms(a);
      if (a.length > 0 && !programId) setProgramId(a[0].program_id);
    });
    apiFetch<{ data: Array<{ id: string; term_id: string; mode: string }> }>(
      "/api/schedule-versions"
    ).then((r) => {
      const d = (r.data as { data?: Array<{ id: string; term_id: string; mode: string }> })?.data ?? [];
      setVersions(d);
    });
  }, []);

  const draftVersion = termId && programId
    ? versions.find((v) => v.term_id === termId && v.mode === "draft")
    : null;

  const ensureDraft = async (): Promise<string | null> => {
    if (!termId) return null;
    const existing = versions.find((v) => v.term_id === termId && v.mode === "draft");
    if (existing) return existing.id;
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
      const rows =
        (listRes.data as { data?: Array<{ id: string; term_id: string; mode: string }> })?.data ?? [];
      const draft = rows.find((v) => v.term_id === termId && v.mode === "draft");
      if (draft) {
        setVersions((prev) => {
          const ids = new Set(prev.map((x) => x.id));
          return [...prev, ...rows.filter((r) => !ids.has(r.id))];
        });
        return draft.id;
      }
    }
    setError(res.error ?? "Could not create working draft for this term");
    return null;
  };

  useEffect(() => {
    if (!termId || !programId) return;
    const draft = draftVersion ?? versions.find((v) => v.term_id === termId && v.mode === "draft");
    if (!draft) {
      setSlots([]);
      setHeatmap([]);
      setLoading(true);
      setError(null);
      apiFetch<{ data: Offering[] }>(
        `/api/course-offerings?term_id=${termId}&participates_in_scheduling=true`
      )
        .then((r) => {
          setOfferings((r.data as { data?: Offering[] })?.data ?? []);
          setLoading(false);
        })
        .catch(() => {
          setError("Failed to load offerings");
          setLoading(false);
        });
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<{ data: Slot[] }>(
        `/api/schedule-slots?term_id=${termId}&schedule_version_id=${draft.id}&program_id=${programId}`
      ),
      apiFetch<{ data: Offering[] }>(
        `/api/course-offerings?term_id=${termId}&participates_in_scheduling=true`
      ),
      apiFetch<{ data: { cells: Array<{ day_of_week: number; hour: number; slot_count: number; pressure: number }> } }>(
        `/api/heatmap?term_id=${termId}&schedule_version_id=${draft.id}&program_id=${programId}`
      ),
    ]).then(([slotsRes, offeringsRes, heatmapRes]) => {
      const s = (slotsRes.data as { data?: Slot[] })?.data ?? [];
      const o = (offeringsRes.data as { data?: Offering[] })?.data ?? [];
      const h = (heatmapRes.data as { data?: { cells?: Array<{ day_of_week: number; hour: number; slot_count: number; pressure: number }> } })?.data?.cells ?? [];
      setSlots(s);
      setOfferings(o);
      setHeatmap(h);
      setLoading(false);
    }).catch(() => {
      setError("Failed to load data");
      setLoading(false);
    });
  }, [termId, programId, versions, draftVersion?.id]);

  const createSlot = async (data: {
    course_offering_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  }) => {
    const versionId = await ensureDraft();
    if (!versionId) return;
    setError(null);
    const res = await apiFetch<{ error?: string; details?: { errors?: Array<{ message: string }> }; id?: string }>("/api/schedule-slots", {
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
      const details = res.details as { errors?: Array<{ message: string }> } | undefined;
      setError(details?.errors?.length ? details.errors.map((e) => e.message).join("; ") : res.error);
      setWarnings([]);
      return;
    }
    const created = res.data as { warnings?: Array<{ message: string }>; id: string };
    setWarnings(created?.warnings?.map((w) => w.message) ?? []);
    setShowCreate(false);
    const o = offerings.find((x) => x.id === data.course_offering_id);
    const newSlot: Slot = {
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
            instructors: o.instructors.map((i) => ({ name: i.faculty_name })),
          }
        : { course_code: "", title: "", section_code: "", instructors: [] },
    };
    setSlots((prev) => {
      const hasProgram = o?.course_template.programs.some((p) => p.program_id === programId);
      if (!hasProgram) return prev;
      return [...prev, newSlot];
    });
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
      const details = res.details as { errors?: Array<{ message: string }> } | undefined;
      setError(details?.errors?.length ? details.errors.map((e) => e.message).join("; ") : res.error);
      return;
    }
    const updated = res.data as { warnings?: Array<{ message: string }> };
    setWarnings(updated?.warnings?.map((w) => w.message) ?? []);
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

  const offeringsForProgram = offerings.filter((o) =>
    o.course_template.programs.some((p) => p.program_id === programId)
  );

  const slotsByDay = DAY_NAMES.slice(1).map((_, i) => {
    const day = i + 1;
    return slots
      .filter((s) => s.day_of_week === day)
      .sort((a, b) => slotToMinutes(a.start_time) - slotToMinutes(b.start_time));
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">Program Calendar</h1>
      <p className="mt-1 text-soka-muted">
        Add, view, move, and edit schedule slots for your program. Directors see all faculty slots.
      </p>

      <div className="mt-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-soka-body">Term</label>
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="mt-1 block rounded-md border border-soka-border px-3 py-2 text-sm"
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
          <label className="block text-sm font-medium text-soka-body">Program</label>
          <select
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            className="mt-1 block rounded-md border border-soka-border px-3 py-2 text-sm"
          >
            <option value="">Select program</option>
            {programs.map((p) => (
              <option key={p.program_id} value={p.program_id}>
                {p.program_name}
              </option>
            ))}
            </select>
          </div>
        {termId && programId && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
            >
              Add slot
            </button>
            {!draftVersion && (
              <p className="text-xs text-soka-muted sm:max-w-sm">
                A working draft is created automatically when you add the first slot, if one does not exist yet.
              </p>
            )}
          </div>
        )}
      </div>

      {draftVersion && (
        <div className="mt-4">
          <button
            onClick={async () => {
              const res = await fetch(
                `/api/schedule-versions/${draftVersion.id}/export?format=pdf&program_id=${programId}`,
                { credentials: "include" }
              );
              if (!res.ok) return;
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `schedule-${programId}.pdf`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="rounded-md border border-soka-border px-4 py-2 text-sm font-medium text-soka-body hover:bg-soka-surface"
          >
            Export PDF
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded bg-soka-error/10 p-3 text-sm text-soka-error">
          {error}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mt-4 rounded bg-soka-warning/10 p-3 text-sm text-soka-warning">
          Note: {warnings.join(" ")}
        </div>
      )}

      {showCreate && (
        <CreateSlotModal
          offerings={offeringsForProgram}
          onClose={() => setShowCreate(false)}
          onCreate={createSlot}
        />
      )}

      {editingSlot && (
        <EditSlotModal
          slot={editingSlot}
          onClose={() => setEditingSlot(null)}
          onSave={(updates) => updateSlot(editingSlot.id, updates)}
          onDelete={() => deleteSlot(editingSlot.id)}
        />
      )}

      {loading ? (
        <p className="mt-6 text-soka-muted">Loading...</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <ScheduleCalendarGrid
            slotsByDay={slotsByDay}
            hourRange={[8, 9, 10, 11, 12, 13, 14, 15, 16, 17]}
            slotStartHour={(time) => Math.floor(slotToMinutes(time) / 60)}
            renderSlotActions={(slot) =>
              editing === slot.id ? (
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
            {slots.length} slot(s) in program. Add slots for faculty or edit existing.
          </div>
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
        </div>
      )}
    </div>
  );
}

function CreateSlotModal({
  offerings,
  onClose,
  onCreate,
}: {
  offerings: Offering[];
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
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("11:30");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-soka-body">Add slot</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-soka-body">Offering</label>
            <select
              value={offeringId}
              onChange={(e) => setOfferingId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              <option value="">Select offering</option>
              {offerings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.course_template.course_code} {o.section_code} — {o.course_template.title}
                </option>
              ))}
            </select>
          </div>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-soka-body">Start</label>
              <input
                type="text"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                placeholder="10:00"
                className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-soka-body">End</label>
              <input
                type="text"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                placeholder="11:30"
                className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
              />
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
              const startNorm = /^\d{1,2}:\d{2}$/.test(start)
                ? (start.length === 4 ? `0${start}` : start)
                : "";
              const endNorm = /^\d{1,2}:\d{2}$/.test(end)
                ? (end.length === 4 ? `0${end}` : end)
                : "";
              if (offeringId && startNorm && endNorm) {
                onCreate({
                  course_offering_id: offeringId,
                  day_of_week: day,
                  start_time: startNorm,
                  end_time: endNorm,
                });
              } else {
                alert("Select offering and use time format HH:MM (e.g. 09:00)");
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-soka-body">Start</label>
              <input
                type="text"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-soka-body">End</label>
              <input
                type="text"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
              />
            </div>
          </div>
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
                const startNorm = start.length === 4 ? `0${start}` : start;
                const endNorm = end.length === 4 ? `0${end}` : end;
                onSave({
                  day_of_week: day,
                  start_time: startNorm,
                  end_time: endNorm,
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
