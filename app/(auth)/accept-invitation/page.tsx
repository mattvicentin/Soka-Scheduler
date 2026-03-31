"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SokaLogoFull } from "@/components/SokaBrand";

function AcceptInvitationForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams?.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) setError("Missing invitation token");
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/accept-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? "Failed to accept invitation";
        const detail = data.details != null ? String(data.details) : "";
        setError(detail ? `${msg} — ${detail}` : msg);
        return;
      }
      setSuccess(true);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <SokaLogoFull className="mb-8 h-14 w-auto max-w-[280px] object-contain" />
        <h1 className="text-xl font-bold">Account created</h1>
        <p className="mt-2 text-soka-muted">
          Check your email for the verification code, then go to the verify page to complete setup.
        </p>
        <a
          href="/verify"
          className="mt-6 rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
        >
          Enter verification code
        </a>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <SokaLogoFull className="mb-8 h-14 w-auto max-w-[280px] object-contain" />
      <h1 className="text-xl font-bold">Accept invitation</h1>
      <p className="mt-2 text-soka-muted">Set up your account password</p>
      {!token ? (
        <p className="mt-4 text-soka-error">Invalid or missing invitation link.</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 w-full max-w-sm space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-soka-body">
              Email (must match faculty record)
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-soka-body">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-soka-error">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
      )}
    </main>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<p className="p-8 text-soka-muted">Loading…</p>}>
      <AcceptInvitationForm />
    </Suspense>
  );
}
