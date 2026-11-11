import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The company logo, served from /api/brand/<variant>: the default files
 * in public/brand until an administrator uploads a replacement in settings.
 */

/** The red mark on an ivory tile: collapsed side menu and phone top bar. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#fbf6ec] shadow-sm ring-1 ring-black/5",
        className,
      )}
    >
      <Image
        src="/api/brand/mark"
        alt=""
        width={320}
        height={320}
        unoptimized
        className="size-full object-contain p-1 mix-blend-multiply"
      />
    </span>
  );
}

/** The full logo in ivory and coral, for dark green panels: side menu and the login welcome panel. */
export function LogoLight({ className, alt }: { className?: string; alt: string }) {
  return (
    <Image
      src="/api/brand/light"
      alt={alt}
      width={1000}
      height={500}
      unoptimized
      priority
      className={cn("h-auto w-44", className)}
    />
  );
}

/** The full logo in black and red, for light backgrounds. */
export function LogoFull({ className, alt }: { className?: string; alt: string }) {
  return (
    <Image
      src="/api/brand/full"
      alt={alt}
      width={1000}
      height={500}
      unoptimized
      priority
      // The file has a white background; multiply makes it vanish on the warm page.
      className={cn("h-auto w-56 mix-blend-multiply sm:w-64", className)}
    />
  );
}
