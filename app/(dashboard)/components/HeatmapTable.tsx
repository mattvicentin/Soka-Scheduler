"use client";

interface HeatmapCell {
  day_of_week: number;
  hour: number;
  slot_count: number;
  pressure: number;
}

interface HeatmapTableProps {
  cells: HeatmapCell[];
}

function heatmapBackground(pressure: number): string | undefined {
  if (pressure <= 0) return undefined;
  if (pressure <= 0.25) return "rgba(76, 175, 80, 0.45)";
  if (pressure <= 0.5) return "rgba(255, 193, 7, 0.5)";
  if (pressure <= 0.75) return "rgba(255, 152, 0, 0.55)";
  return "rgba(211, 47, 47, 0.45)";
}

export function HeatmapTable({ cells }: HeatmapTableProps) {
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  return (
    <table className="min-w-full border-collapse border border-soka-border text-xs">
      <thead>
        <tr className="bg-soka-surface">
          <th className="border border-soka-border px-2 py-1 font-semibold text-soka-body">Time</th>
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
            <th key={d} className="border border-soka-border px-2 py-1 font-semibold text-soka-body">
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {hours.map((h) => (
          <tr key={h}>
            <td className="border border-soka-border px-2 py-1 text-soka-muted">
              {h}:00
            </td>
            {[1, 2, 3, 4, 5].map((day) => {
              const cell = cells.find((c) => c.day_of_week === day && c.hour === h);
              const count = cell?.slot_count ?? 0;
              const p = cell?.pressure ?? 0;
              return (
                <td
                  key={day}
                  className="border border-soka-border px-2 py-1 text-center text-soka-body"
                  style={{
                    backgroundColor: heatmapBackground(p),
                  }}
                >
                  {count}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
