import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold text-soka-body">Page not found</h1>
      <p className="text-sm text-soka-muted">That URL doesn&apos;t match any page in this app.</p>
      <Link href="/" className="text-soka-light-blue hover:underline">
        Go to home
      </Link>
    </div>
  );
}
