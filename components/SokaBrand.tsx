import Image from "next/image";

/** Full wordmark + logo (CMYK asset); use on landing and auth screens */
export function SokaLogoFull({
  className,
  priority,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logos/Soka_logo_cmyk.png"
      alt="Soka University"
      width={360}
      height={120}
      priority={priority}
      /* CMYK PNGs often fail Sharp optimization → broken images */
      unoptimized
      className={
        className ?? "mx-auto h-16 w-auto max-w-[min(100%,320px)] object-contain object-center"
      }
    />
  );
}

/** Mark only; sidebar and compact UI */
export function SokaLogoSymbol({ className }: { className?: string }) {
  return (
    <Image
      src="/logos/Soka_symbol.png"
      alt=""
      width={40}
      height={40}
      unoptimized
      className={className ?? "h-9 w-9 shrink-0 object-contain"}
      aria-hidden
    />
  );
}
