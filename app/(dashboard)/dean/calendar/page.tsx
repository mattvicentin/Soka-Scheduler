"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { ScheduleCalendarGrid, DAY_NAMES } from "@/app/(dashboard)/components/ScheduleCalendarGrid";
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
    instructors: Array<{ name: string }>;
  };
}

interface Offering {
  id: string;
  course_template: { course_code: string; title: string };
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

export default function DeanCalendarPage() {
  const [termId, setTermId] = useState("");
  const [terms, setTerms] = useState<Array<{ id: string; name: string }>>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [versions, setVersions] = useState<Array<{ id: string; term_id: string; mode: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [heatmap, setHeatmap] = useState<Array<{ day_of_week: number; hour: number; slot_count: number; pressure: number }>>([]);
  const [showHeatmap, setShowHeatmap] = useState(false);

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
      if (d.length > 0) setTermId(d[0].id);
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
    if (draftVersion) {
      Promise.all([
        apiFetch<{ data: Slot[] }>(
          `/api/schedule-slots?term_id=${termId}&schedule_version_id=${draftVersion.id}`
        ),
        apiFetch<{ data: Offering[] }>(
          `/api/course-offerings?term_id=${termId}&participates_in_scheduling=true`
        ),
        apiFetch<{ data: { cells: Array<{ day_of_week: number; hour: number; slot_count: number; pressure: number }> } }>(
          `/api/heatmap?term_id=${termId}&schedule_version_id=${draftVersion.id}`
        ),
      ]).then(([slotsRes, offeringsRes, heatmapRes]) => {
        const s = (slotsRes.data as { data?: Slot[] })?.data ?? [];
        const o = (offeringsRes.data as { data?: Offering[] })?.data ?? [];
        const h = (heatmapRes.data as { data?: { cells?: Array<{ day_of_week: number; hour: number; slot_count: number; pressure: number }> } })?.data?.cells ?? [];
        setSlots(s);
        setOfferings(o);
        setHeatmap(h);
        setLoading(false);
      });
    } else {
      apiFetch<{ data: Offering[] }>(
        `/api/course-offerings?term_id=${termId}&participates_in_scheduling=true`
      ).then((r) => {
        setSlots([]);
        setOfferings((r.data as { data?: Offering[] })?.data ?? []);
        setLoading(false);
      });
    }
  }, [termId, draftVersion?.id]);

  const ensureDraft = async () => {
    if (draftVersion) return draftVersion.id;
    const res = await apiFetch<{ id: string }>("/api/schedule-versions", {
      method: "POST",
      body: JSON.stringify({ term_id: termId, mode: "draft" }),
    });
    if (res.data?.id) {
      setVersions((v) => [...v, { id: res.data!.id, term_id: termId, mode: "draft" }]);
      return res.data.id;
    }
    return null;
  };

  const createSlot = async (data: {
    course_offering_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  }) => {
    const versionId = await ensureDraft();
    if (!versionId) {
      setError("Could not create draft version");
      return;
    }
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
      const details = res.details as { errors?: Array<{ message: string }> } | undefined;
      setError(details?.errors?.length ? details.errors.map((e) => e.message).join("; ") : res.error);
      setWarnings([]);
      return;
    }
    const created = res.data as { warnings?: Array<{ message: string }> };
    setWarnings(created?.warnings?.map((w) => w.message) ?? []);
    setShowCreate(false);
    setSlots((prev) => [
      ...prev,
      {
        id: (res.data as { id: string }).id,
        course_offering_id: data.course_offering_id,
        schedule_version_id: versionId,
        day_of_week: data.day_of_week,
        start_time: data.start_time,
        end_time: data.end_time,
        building_preference: null,
        room_preference: null,
        course_offering: (() => {
          const o = offerings.find((x) => x.id === data.course_offering_id);
          return o
            ? {
                course_code: o.course_template.course_code,
                title: o.course_template.title,
                section_code: o.section_code,
                instructors: o.instructors.map((i) => ({ name: i.faculty_name })),
              }
            : { course_code: "", title: "", section_code: "", instructors: [] };
        })(),
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
      const details = res.details as { errors?: Array<{ message: string }> } | undefined;
      setError(details?.errors?.length ? details.errors.map((e) => e.message).join("; ") : res.error);
      return;
    }
    const updated = res.data as { warnings?: Array<{ message: string }> };
    setWarnings(updated?.warnings?.map((w) => w.message) ?? []);
    setEditingSlot(null);
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

  const slotsByDay = DAY_NAMES.slice(1).map((_, i) => {
    const day = i + 1;
    return slots
      .filter((s) => s.day_of_week === day)
      .sort(
        (a, b) =>
          parseInt(a.start_time.replace(":", ""), 10) -
          parseInt(b.start_time.replace(":", ""), 10)
      );
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">Full Calendar</h1>
      <p className="mt-1 text-soka-muted">
        Create, move, edit, and delete schedule slots (draft).
      </p>

      <div className="mt-6 flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-soka-body">Term</label>
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="mt-1 block w-48 rounded-md border border-soka-border px-3 py-2 text-sm"
          >
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {draftVersion && (
          <button
            onClick={() => setShowCreate(true)}
            className="mt-6 rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Add slot
          </button>
        )}
        {!draftVersion && termId && (
          <button
            onClick={ensureDraft}
            className="mt-6 rounded-md bg-soka-light-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Create draft version
          </button>
        )}
        {draftVersion && (
          <button
            onClick={async () => {
              const res = await fetch(
                `/api/schedule-versions/${draftVersion.id}/export?format=pdf`,
                { credentials: "include" }
              );
              if (!res.ok) return;
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `schedule-draft-${termId}.pdf`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="mt-6 rounded-md border border-soka-border px-4 py-2 text-sm font-medium text-soka-body hover:bg-soka-surface"
          >
            Export draft PDF
          </button>
        )}
        {officialVersion && (
          <button
            onClick={async () => {
              const res = await fetch(
                `/api/schedule-versions/${officialVersion.id}/export?format=pdf`,
                { credentials: "include" }
              );
              if (!res.ok) return;
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `schedule-official-${termId}.pdf`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="mt-6 rounded-md border border-soka-border px-4 py-2 text-sm font-medium text-soka-body hover:bg-soka-surface"
          >
            Export official PDF
          </button>
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
          offerings={offerings}
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
            slotStartHour={(time) => parseInt(time.split(":")[0], 10)}
            renderSlotActions={(slot) => (
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
                  onClick={() => deleteSlot(slot.id)}
                  className="text-soka-error hover:underline"
                >
                  Delete
                </button>
              </>
            )}
          />
          <p className="mt-4 text-sm text-soka-muted">{slots.length} slot(s)</p>
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
