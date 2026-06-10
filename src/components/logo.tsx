import Image from "next/image";
import { cn } from "@/lib/utils";

// The IELTS-9 key badge. The source PNG is a circular badge with a
// transparent/white interior, so it sits on any surface without a wrapper.
export function Logo({
  size = 36,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt="IELTS 9 logo"
      width={size}
      height={size}
      priority={priority}
      className={cn("shrink-0 select-none", className)}
    />
  );
}
