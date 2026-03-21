"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SokaLogoFull } from "@/components/SokaBrand";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/accounts/me", { credentials: "include" })
      .then((r) => {
        if (r.ok) return r.json();
        return null;
      })
      .then((data) => {
        if (data?.role) router.replace("/dashboard");
      })
      .catch(() => {});
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <SokaLogoFull priority className="mb-6 h-20 w-auto max-w-[min(100%,360px)] object-contain" />
      <h1 className="text-2xl font-bold">Soka Academic Scheduling System</h1>
      <p className="mt-2 text-soka-muted">
        Faculty teaching preferences and schedule management
      </p>
      <nav className="mt-8 flex gap-4">
        <Link
          href="/login"
          className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
        >
          Log in
        </Link>
      </nav>
    </main>
  );
}
