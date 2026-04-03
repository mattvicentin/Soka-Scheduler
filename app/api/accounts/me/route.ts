import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireAuth } from "@/lib/auth/middleware";
import { hashPassword } from "@/lib/auth/password";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const account = await prisma.account.findUnique({
      where: { id: auth.payload.accountId },
      include: {
        faculty: {
          include: {
            programAffiliations: {
              include: { program: true },
            },
          },
        },
        programAssocs: { include: { program: true } },
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: account.id,
      email: account.email,
      role: account.role,
      is_admin: account.isAdmin,
      professor_tour_completed_at: account.professorTourCompletedAt?.toISOString() ?? null,
      director_tour_completed_at: account.directorTourCompletedAt?.toISOString() ?? null,
      dean_tour_completed_at: account.deanTourCompletedAt?.toISOString() ?? null,
      faculty_id: account.facultyId,
      faculty: account.faculty
        ? {
            id: account.faculty.id,
            name: account.faculty.name,
            email: account.faculty.email,
            expected_annual_load: account.faculty.expectedAnnualLoad,
            program_affiliations: account.faculty.programAffiliations.map((pa) => ({
              program_id: pa.programId,
              program_name: pa.program.name,
              is_primary: pa.isPrimary,
            })),
          }
        : null,
      program_associations: account.programAssocs.map((pa) => ({
        program_id: pa.programId,
        program_name: pa.program.name,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { password } = body;
    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "password required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);
    await prisma.account.update({
      where: { id: auth.payload.accountId },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
