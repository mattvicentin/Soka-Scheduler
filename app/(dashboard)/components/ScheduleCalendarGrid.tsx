"use client";

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

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
  hourRange = [8, 9, 10, 11, 12, 13, 14, 15, 16],
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
