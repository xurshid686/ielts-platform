import { Badge } from "@/components/admin/ui/primitives";

export function PremiumChip({
  until,
  membership,
}: {
  until: string | null;
  membership: { stage: string; days: number } | null;
}) {
  if (!until || !membership) return <span className="text-muted">—</span>;
  const date = until.slice(0, 10);
  switch (membership.stage) {
    case "active":
      return <Badge tone="premium">until {date}</Badge>;
    case "expiring":
      return <Badge tone="warning">{membership.days} d left</Badge>;
    case "lapsed":
      return <Badge tone="danger">lapsed {membership.days} d ago</Badge>;
    default:
      return <span className="text-xs text-muted">ended {date}</span>;
  }
}

export function Avatar({ name, url, size = 32 }: { name: string | null; url: string | null; size?: number }) {
  const letter = (name || "U").charAt(0).toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {letter}
    </span>
  );
}

