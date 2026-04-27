"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SokaLogoFull } from "@/components/SokaBrand";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams?.get("redirect") ?? "/dashboard";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /** Drop leaked credentials from URL (legacy GET submits before hydration used query params). */
  useEffect(() => {
    const email = searchParams?.get("email");
    const password = searchParams?.get("password");
    if (!email && !password) return;
    const u = new URL(window.location.href);
    u.searchParams.delete("email");
    u.searchParams.delete("password");
    router.replace(u.pathname + u.search);
  }, [router, searchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const base = data.error ?? "Login failed";
        setError(
          typeof data.detail === "string" && data.detail.trim()
            ? `${base}\n\n${data.detail}`
            : base
        );
        return;
      }
      router.replace(redirect);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <SokaLogoFull priority className="mb-8 h-14 w-auto max-w-[280px] object-contain" />
      <h1 className="text-xl font-bold">Log in</h1>
      <form method="post" onSubmit={handleSubmit} className="mt-6 w-full max-w-sm space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-soka-body">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-soka-body">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
          />
        </div>
        {error && (
          <p className="whitespace-pre-wrap break-words text-sm text-soka-error">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="p-8 text-soka-muted">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
