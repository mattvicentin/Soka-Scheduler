"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * Redirect to Calendar - offerings are now merged into the calendar page.
 */
export default function ProfessorOfferingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const termId = searchParams?.get("term_id");

  useEffect(() => {
    const url = termId
      ? `/professor/calendar?term_id=${encodeURIComponent(termId)}`
      : "/professor/calendar";
    router.replace(url);
  }, [router, termId]);

  return <p className="text-soka-muted">Redirecting to Calendar...</p>;
}
