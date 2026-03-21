"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SokaLogoFull } from "@/components/SokaBrand";

export default function VerifyPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          purpose: "account_setup",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Verification failed");
        return;
      }
      router.replace("/dashboard");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <SokaLogoFull className="mb-8 h-14 w-auto max-w-[280px] object-contain" />
      <h1 className="text-xl font-bold">Verify your account</h1>
      <p className="mt-2 text-soka-muted">Enter the code sent to your email</p>
      <form onSubmit={handleSubmit} className="mt-6 w-full max-w-sm space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-soka-body">
            Email
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
          <label htmlFor="code" className="block text-sm font-medium text-soka-body">
            Verification code
          </label>
          <input
            id="code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoComplete="one-time-code"
            placeholder="123456"
            className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-sm text-soka-error">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover disabled:opacity-50"
        >
          {loading ? "Verifying..." : "Verify"}
        </button>
      </form>
    </main>
  );
}
