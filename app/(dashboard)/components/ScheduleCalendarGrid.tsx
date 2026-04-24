"use client";

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

/** Default grid rows (8:00–17:00). Use {@link hourRangeIncludingSlots} when any slot can start before 8:00. */
export const DEFAULT_CALENDAR_HOUR_RANGE: number[] = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
export const HOURS = DEFAULT_CALENDAR_HOUR_RANGE;

function startHourFromTime(startTime: string): number {
  const [h, m] = startTime.trim().split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h)) return 8;
  return Math.floor((h * 60 + (Number.isNaN(m) ? 0 : m)) / 60);
}

/** Widen the displayed hour axis so slots starting before 8:00 (e.g. 07:50) appear in the grid. */
export function hourRangeIncludingSlots(
  slotsByDay: Array<Array<{ start_time: string }>>,
  baseRange: number[] = DEFAULT_CALENDAR_HOUR_RANGE
): number[] {
  let minH = Math.min(...baseRange);
  let maxH = Math.max(...baseRange);
  for (const day of slotsByDay) {
    for (const s of day) {
      const sh = startHourFromTime(s.start_time);
      minH = Math.min(minH, sh);
      maxH = Math.max(maxH, sh);
    }
  }
  return Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i);
}

export interface CalendarSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  course_offering: {
    course_code: string;
    section_code: string;
    instructors: Array<{ name: string }>;
  };
}

interface ScheduleCalendarGridProps {
  slotsByDay: CalendarSlot[][];
  hourRange?: number[];
  slotStartHour: (time: string) => number;
  renderSlotActions: (slot: CalendarSlot) => React.ReactNode;
  /** Highlights a slot (e.g. while moving / editing) with brand light blue. */
  highlightedSlotId?: string | null;
}

export function ScheduleCalendarGrid({
  slotsByDay,
  hourRange = DEFAULT_CALENDAR_HOUR_RANGE,
  slotStartHour,
  renderSlotActions,
  highlightedSlotId,
}: ScheduleCalendarGridProps) {
  return (
    <table className="min-w-full border-collapse border border-soka-border">
      <thead>
        <tr className="bg-soka-surface">
          <th className="border border-soka-border px-4 py-2 text-left text-sm font-semibold text-soka-body">
            Time
          </th>
          {DAY_NAMES.slice(1).map((d) => (
            <th
              key={d}
              className="border border-soka-border px-4 py-2 text-center text-sm font-semibold text-soka-body"
            >
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {hourRange.map((h) => (
          <tr key={h}>
            <td className="border border-soka-border px-2 py-1 text-xs text-soka-muted">
              {h}:00
            </td>
            {[1, 2, 3, 4, 5].map((day) => {
              const daySlots = slotsByDay[day - 1].filter((s) => {
                const sh = slotStartHour(s.start_time);
                return sh >= h && sh < h + 1;
              });
              return (
                <td
                  key={day}
                  className="vertical-align-top border border-soka-border bg-white p-2 align-top"
                >
                  {daySlots.map((slot) => {
                    const isHighlighted = highlightedSlotId === slot.id;
                    return (
                      <div
                        key={slot.id}
                        className={`mb-2 rounded border border-soka-border bg-white px-2 py-1 text-xs ${
                          isHighlighted
                            ? "bg-soka-light-blue/15 ring-2 ring-soka-light-blue/45"
                            : ""
                        }`}
                      >
                        <div className="font-medium text-soka-body">
                          {slot.course_offering.course_code}{" "}
                          {slot.course_offering.section_code}
                        </div>
                        <div className="truncate text-soka-muted">
                          {slot.course_offering.instructors.map((i) => i.name).join(", ")}
                        </div>
                        <div className="text-soka-muted">
                          {slot.start_time}–{slot.end_time}
                        </div>
                        <div className="mt-1 flex gap-1">{renderSlotActions(slot)}</div>
                      </div>
                    );
                  })}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export { DAY_NAMES, HOURS };
