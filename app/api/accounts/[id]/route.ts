import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { updateAccountSchema } from "@/lib/validation/schemas/account";
import { logAudit } from "@/lib/audit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      faculty: { select: { id: true, name: true, email: true } },
      programAssocs: { include: { program: true } },
    },
  });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  if (account.isAdmin) {
    return NextResponse.json({ error: "Admin accounts are managed separately" }, { status: 403 });
  }

  return NextResponse.json({
    id: account.id,
    email: account.email,
    role: account.role,
    is_active: account.isActive,
    faculty: account.faculty
      ? { id: account.faculty.id, name: account.faculty.name, email: account.faculty.email }
      : null,
    program_associations: account.programAssocs.map((pa) => ({
      program_id: pa.programId,
      program_name: pa.program.name,
    })),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  if (account.isAdmin) {
    return NextResponse.json({ error: "Admin accounts are managed separately" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const prevRole = account.role;

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id },
      data: {
        role: data.role,
        isActive: data.is_active,
      },
    });
    if (data.role !== undefined && data.role !== prevRole) {
      await logAudit("change_role", auth.payload.accountId, "account", id);
    }
  });

  const updated = await prisma.account.findUnique({
    where: { id },
    include: {
      faculty: { select: { id: true, name: true } },
      programAssocs: { include: { program: true } },
    },
  });
  return NextResponse.json({
    id: updated!.id,
    email: updated!.email,
    role: updated!.role,
    is_active: updated!.isActive,
    program_associations: updated!.programAssocs.map((pa) => ({
      program_id: pa.programId,
      program_name: pa.program.name,
    })),
  });
}
