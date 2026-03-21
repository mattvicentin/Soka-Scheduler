"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * App Router error boundary — required so dev/prod can render failures instead of
 * "missing required error components, refreshing..." when a route errors.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold text-soka-body">Something went wrong</h1>
      <p className="max-w-md text-center text-sm text-soka-muted">{error.message}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
        >
          Try again
        </button>
        <Link
          href="/login"
          className="rounded-md border border-soka-border px-4 py-2 text-sm text-soka-light-blue hover:bg-soka-surface"
        >
          Log in
        </Link>
      </div>
    </div>
  );
}
