"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SokaLogoSymbol } from "@/components/SokaBrand";
import { apiFetch } from "@/lib/api/client";

interface MeResponse {
  id: string;
  email: string;
  role: string;
  is_admin?: boolean;
  faculty_id: string | null;
  faculty: { name: string } | null;
  program_associations?: Array<{ program_id: string; program_name: string }>;
}

const ME_FETCH_TIMEOUT_MS = 15_000;

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setSessionError(null);
      try {
        const r = await Promise.race([
          apiFetch<MeResponse>("/api/accounts/me"),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Request timed out — check the dev terminal and database connection.")),
              ME_FETCH_TIMEOUT_MS
            )
          ),
        ]);
        if (cancelled) return;
        if (r.data) {
          setMe(r.data);
        } else if (r.status === 401) {
          router.replace("/login");
        } else {
          setSessionError(r.error ?? "Could not load your account.");
        }
      } catch (e) {
        if (!cancelled) {
          setSessionError(e instanceof Error ? e.message : "Something went wrong.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!loading && me && (pathname === "/" || pathname === "/dashboard")) {
      if (me.is_admin || me.role === "dean") router.replace("/dean");
      else if (me.role === "professor") router.replace("/professor");
      else if (me.role === "director") router.replace("/director");
    }
  }, [loading, me, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-soka-muted">Loading...</p>
      </div>
    );
  }

  if (!me && sessionError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-8">
        <p className="max-w-md text-center text-sm text-soka-error">{sessionError}</p>
        <p className="max-w-md text-center text-xs text-soka-muted">
          If this persists, confirm Postgres is running and <code className="rounded bg-soka-surface px-1">DATABASE_URL</code> in{" "}
          <code className="rounded bg-soka-surface px-1">.env</code> is correct. Watch the terminal when loading this page — a stuck{" "}
          <code className="rounded bg-soka-surface px-1">/api/accounts/me</code> request usually means the DB query is hanging.
        </p>
        <Link
          href="/login"
          className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
        >
          Back to log in
        </Link>
      </div>
    );
  }

  const professorNav = [
    { href: "/professor", label: "Dashboard" },
    { href: "/professor/calendar", label: "Calendar" },
    { href: "/professor/proposal", label: "My Proposal" },
    { href: "/professor/fairness", label: "Fairness" },
  ];

  const directorNav = [
    { href: "/director", label: "Dashboard" },
    { href: "/director/calendar", label: "Calendar" },
    { href: "/director/approvals", label: "Pending Approvals" },
    { href: "/director/fairness", label: "Fairness" },
  ];
  const deanNav = [
    { href: "/dean", label: "Dashboard" },
    { href: "/dean/faculty", label: "Faculty" },
    { href: "/dean/sabbaticals", label: "Sabbaticals" },
    { href: "/dean/courses", label: "Courses" },
    { href: "/dean/calendar", label: "Calendar" },
    { href: "/dean/proposals", label: "Proposals" },
    { href: "/dean/accounts", label: "Accounts" },
    { href: "/dean/invitations", label: "Invitations" },
    { href: "/dean/settings", label: "Settings" },
  ];

  const nav =
    me?.is_admin || me?.role === "dean"
      ? deanNav
      : me?.role === "professor"
        ? professorNav
        : me?.role === "director"
          ? directorNav
          : [];

  return (
    <div className="flex min-h-screen bg-white">
      <aside className="w-52 border-r border-soka-border bg-soka-surface p-4">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <SokaLogoSymbol />
            <h2 className="text-sm font-semibold text-soka-blue">Soka Scheduling</h2>
          </div>
          <p className="mt-1 truncate text-xs text-soka-muted">
            {me?.faculty?.name ?? me?.email}
          </p>
          <p className="text-xs capitalize text-soka-disabled">
            {me?.is_admin ? "Admin" : me?.role}
          </p>
        </div>
        <nav className="space-y-1">
          {nav.map((item) => {
            const path = pathname ?? "";
            const active = path === item.href || path.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md border-l-[3px] px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border-soka-gold bg-soka-light-blue/15 font-semibold text-soka-blue"
                    : "border-transparent text-soka-muted hover:bg-white hover:text-soka-body"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-8 border-t border-soka-border pt-4">
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              });
              window.location.href = "/login";
            }}
            className="text-sm text-soka-muted hover:text-soka-body"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-white p-6">{children}</main>
    </div>
  );
}
