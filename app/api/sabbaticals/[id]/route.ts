import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { updateSabbaticalSchema } from "@/lib/validation/schemas/sabbatical";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const sabbatical = await prisma.sabbatical.findUnique({ where: { id } });
  if (!sabbatical) {
    return NextResponse.json({ error: "Sabbatical not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateSabbaticalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await prisma.sabbatical.update({
    where: { id },
    data: {
      type: parsed.data.type,
      reason: parsed.data.reason,
      effectiveLoadReduction: parsed.data.effective_load_reduction,
    },
    include: { faculty: true, term: true },
  });

  return NextResponse.json({
    id: updated.id,
    type: updated.type,
    effective_load_reduction: Number(updated.effectiveLoadReduction),
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  await prisma.sabbatical.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
