import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { accountProgramSchema } from "@/lib/validation/schemas/account";
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
    include: { programAssocs: { include: { program: true } } },
  });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  if (account.isAdmin) {
    return NextResponse.json({ error: "Admin accounts are managed separately" }, { status: 403 });
  }

  return NextResponse.json({
    data: account.programAssocs.map((pa) => ({
      program_id: pa.programId,
      program_name: pa.program.name,
    })),
  });
}

export async function POST(
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
  const parsed = accountProgramSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const program = await prisma.program.findUnique({
    where: { id: parsed.data.program_id },
  });
  if (!program) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }

  await prisma.accountProgramAssociation.upsert({
    where: {
      accountId_programId: { accountId: id, programId: parsed.data.program_id },
    },
    create: {
      accountId: id,
      programId: parsed.data.program_id,
    },
    update: {},
  });

  await logAudit("change_permission", auth.payload.accountId, "account", id);
  return NextResponse.json({ ok: true });
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
  const { searchParams } = new URL(request.url);
  const programId = searchParams.get("program_id");
  if (!programId) {
    return NextResponse.json({ error: "program_id required" }, { status: 400 });
  }

  const existing = await prisma.accountProgramAssociation.findUnique({
    where: { accountId_programId: { accountId: id, programId } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Association not found" }, { status: 404 });
  }

  await prisma.accountProgramAssociation.delete({
    where: { accountId_programId: { accountId: id, programId } },
  });

  await logAudit("change_permission", auth.payload.accountId, "account", id);
  return NextResponse.json({ ok: true });
}
