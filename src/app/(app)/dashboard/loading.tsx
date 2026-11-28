import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

// Mirrors Today: greeting + tabs, the full-width hero, two even cards, recent tests.
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-6 w-40 rounded-full" />
        </div>
        <Skeleton className="h-10 w-44 rounded-xl" />
      </div>
      <Skeleton className="h-60 rounded-2xl" />
      <div className="grid gap-6 md:grid-cols-2">
        <SkeletonCard className="h-32" />
        <SkeletonCard className="h-32" />
      </div>
      <SkeletonCard className="h-40" />
    </div>
  );
}
