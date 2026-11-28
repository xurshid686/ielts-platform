import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

// Mirrors the Today layout: greeting + tabs, the Today card and the side column.
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
      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Skeleton className="h-56 rounded-2xl" />
          <SkeletonCard className="h-32" />
        </div>
        <div className="space-y-6">
          <SkeletonCard className="h-56" />
          <SkeletonCard className="h-24" />
        </div>
      </div>
    </div>
  );
}
