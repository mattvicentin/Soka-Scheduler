import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { getAccessibleProgramIds } from "@/lib/auth/scope";
import jsPDF from "jspdf";
import "jspdf-autotable";

/**
 * GET /api/schedule-versions/:id/export
 * Director, Dean. Query: format=pdf|json, program_id?
 * Exports schedule as PDF or JSON.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "pdf";
  const programId = searchParams.get("program_id");

  const version = await prisma.scheduleVersion.findUnique({
    where: { id },
    include: { term: true },
  });
  if (!version) {
    return NextResponse.json({ error: "Schedule version not found" }, { status: 404 });
  }

  const programIds = await getAccessibleProgramIds(auth.payload);
  if (programId && programIds !== null && !programIds.includes(programId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const programFilter = programId
    ? { some: { programId } }
    : programIds === null
      ? {}
      : { some: { programId: { in: programIds } } };

  const slots = await prisma.scheduleSlot.findMany({
    where: {
      scheduleVersionId: id,
      courseOffering: {
        participatesInScheduling: true,
        courseTemplate: {
          programs: Object.keys(programFilter).length ? programFilter : undefined,
        },
      },
    },
    include: {
      courseOffering: {
        include: {
          courseTemplate: true,
          instructors: { include: { faculty: true }, orderBy: { displayOrder: "asc" } },
        },
      },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

  if (format === "json") {
    return NextResponse.json({
      term: version.term.name,
      mode: version.mode,
      slots: slots.map((s) => ({
        day: DAY_NAMES[s.dayOfWeek],
        start: s.startTime.toTimeString().slice(0, 5),
        end: s.endTime.toTimeString().slice(0, 5),
        course: `${s.courseOffering.courseTemplate.courseCode} ${s.courseOffering.sectionCode}`,
        title: s.courseOffering.courseTemplate.title,
        instructors: s.courseOffering.instructors.map((i) => i.faculty.name).join(", "),
      })),
    });
  }

  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(
    `Schedule: ${version.term.name} (${version.mode})`,
    14,
    12
  );

  const head = [["Day", "Time", "Course", "Title", "Instructors"]];
  const body = slots.map((s) => [
    DAY_NAMES[s.dayOfWeek],
    `${s.startTime.toTimeString().slice(0, 5)}–${s.endTime.toTimeString().slice(0, 5)}`,
    `${s.courseOffering.courseTemplate.courseCode} ${s.courseOffering.sectionCode}`,
    s.courseOffering.courseTemplate.title.slice(0, 40),
    s.courseOffering.instructors.map((i) => i.faculty.name).join(", ").slice(0, 35),
  ]);

  (doc as unknown as { autoTable: (opts: object) => void }).autoTable({
    startY: 18,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [70, 70, 70] },
  });

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="schedule-${version.term.name}-${version.mode}.pdf"`,
    },
  });
}
