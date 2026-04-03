"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SokaLogoSymbol } from "@/components/SokaBrand";
import { apiFetch } from "@/lib/api/client";
import { createDashboardTour, type DashboardTourRole } from "@/lib/tour/build-dashboard-tour";
import type { Tour } from "shepherd.js";
import "./dashboard-tour-shepherd.css";

interface MeResponse {
  id: string;
  email: string;
  role: string;
  is_admin?: boolean;
  faculty_id: string | null;
  faculty: { name: string } | null;
  program_associations?: Array<{ program_id: string; program_name: string }>;
  professor_tour_completed_at?: string | null;
  director_tour_completed_at?: string | null;
  dean_tour_completed_at?: string | null;
}

const ME_FETCH_TIMEOUT_MS = 15_000;

function getDashboardTourRole(me: MeResponse): DashboardTourRole {
  if (me.is_admin || me.role === "dean") return "dean";
  if (me.role === "director") return "director";
  return "professor";
}

function isTourCompletedForMe(me: MeResponse): boolean {
  const key = getDashboardTourRole(me);
  if (key === "dean") return !!me.dean_tour_completed_at;
  if (key === "director") return !!me.director_tour_completed_at;
  return !!me.professor_tour_completed_at;
}

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const tourRef = useRef<Tour | null>(null);

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
    if (!me) return;
    if (!isTourCompletedForMe(me)) {
      setWelcomeModalOpen(true);
    } else {
      setWelcomeModalOpen(false);
    }
  }, [me]);

  useEffect(() => {
    if (!loading && me && (pathname === "/" || pathname === "/dashboard")) {
      if (me.is_admin || me.role === "dean") router.replace("/dean");
      else if (me.role === "professor") router.replace("/professor");
      else if (me.role === "director") router.replace("/director");
    }
  }, [loading, me, pathname, router]);

  useEffect(() => {
    return () => {
      void tourRef.current?.cancel();
      tourRef.current = null;
    };
  }, []);

  const markTourComplete = useCallback(async () => {
    const res = await apiFetch<{
      professor_tour_completed_at: string | null;
      director_tour_completed_at: string | null;
      dean_tour_completed_at: string | null;
    }>("/api/accounts/me/tutorial", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (res.error || !res.data) {
      setSessionError(res.error ?? "Could not save tutorial progress.");
      return;
    }
    setMe((prev) =>
      prev
        ? {
            ...prev,
            professor_tour_completed_at: res.data!.professor_tour_completed_at,
            director_tour_completed_at: res.data!.director_tour_completed_at,
            dean_tour_completed_at: res.data!.dean_tour_completed_at,
          }
        : prev
    );
    setWelcomeModalOpen(false);
  }, []);

  const startDashboardTour = useCallback(
    async (persistCompletionWhenFinished: boolean) => {
      if (!me) return;
      void tourRef.current?.cancel();
      tourRef.current = null;

      const Shepherd = (await import("shepherd.js")).default;
      const role = getDashboardTourRole(me);
      let shouldPersist = persistCompletionWhenFinished;

      const tour = createDashboardTour(Shepherd, role, async () => {
        tourRef.current = null;
        if (shouldPersist) {
          await markTourComplete();
        }
      });

      tourRef.current = tour;
      await tour.start();
    },
    [me, markTourComplete]
  );

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

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-soka-muted">Loading...</p>
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

  const tourLabel =
    me && getDashboardTourRole(me) === "dean"
      ? "Dean tutorial"
      : me && getDashboardTourRole(me) === "director"
        ? "Director tutorial"
        : "Faculty tutorial";

  return (
    <div className="flex min-h-screen bg-white">
      <aside
        data-tour="shell-sidebar"
        className="w-52 shrink-0 border-r border-soka-border bg-soka-surface p-4"
      >
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
        <nav data-tour="shell-nav" className="space-y-1">
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
        <div data-tour="shell-sign-out" className="mt-8 border-t border-soka-border pt-4">
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
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex shrink-0 items-center justify-end border-b border-soka-border bg-white px-4 py-3">
          <button
            type="button"
            data-tour="shell-tutorial-btn"
            onClick={() => void startDashboardTour(!isTourCompletedForMe(me))}
            className="rounded-md border border-soka-border bg-white px-3 py-1.5 text-sm font-medium text-soka-blue shadow-sm hover:bg-soka-surface"
          >
            Tutorial
          </button>
        </header>
        <main data-tour="shell-main" className="flex-1 overflow-auto bg-white p-6">
          {children}
        </main>
      </div>

      {welcomeModalOpen && me && !isTourCompletedForMe(me) && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-tour-title"
        >
          <div className="w-full max-w-md rounded-lg border border-soka-border bg-white shadow-xl">
            <div className="border-b border-soka-border bg-soka-blue px-5 py-4">
              <h2 id="welcome-tour-title" className="text-lg font-semibold text-white">
                Welcome to Soka Scheduling
              </h2>
              <p className="mt-1 text-sm text-white/90">
                {tourLabel.replace(" tutorial", "")} quick start
              </p>
            </div>
            <div className="px-5 py-4 text-sm leading-relaxed text-soka-body">
              <p>
                Take a one-minute guided tour of your dashboard—navigation, calendar workflow, and where
                to get help again later. You can skip now and use the <strong>Tutorial</strong> button in the
                top right anytime.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-soka-border px-5 py-4">
              <button
                type="button"
                onClick={async () => {
                  await markTourComplete();
                }}
                className="rounded-md border border-soka-border px-4 py-2 text-sm font-medium text-soka-body hover:bg-soka-surface"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => {
                  setWelcomeModalOpen(false);
                  requestAnimationFrame(() => {
                    void startDashboardTour(true);
                  });
                }}
                className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
              >
                Start tour
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
