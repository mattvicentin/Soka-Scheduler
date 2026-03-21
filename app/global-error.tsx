"use client";

/**
 * Root-level error UI when the root layout fails. Must define <html> and <body>.
 * Reduces dev-server fallbacks to missing Pages Router `/_error` chunks.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white p-8 font-sans text-slate-800">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm text-white"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
