"use client";

/**
 * Errors under the dashboard layout (e.g. /director/fairness) stay inside the shell.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border border-soka-error/40 bg-soka-error/10 p-6">
      <h2 className="text-lg font-semibold text-soka-error">Couldn&apos;t load this page</h2>
      <p className="mt-2 text-sm text-soka-body">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
      >
        Try again
      </button>
    </div>
  );
}
