import { Card } from "@/components/ui/card";

export function ComingSoon({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
      <Card className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted">
          Coming soon
        </span>
        <p className="max-w-md text-muted">{desc}</p>
      </Card>
    </div>
  );
}
