import { Skeleton } from "@/components/ui/skeleton";
import { SiteNav } from "@/components/site-nav";

export default function Loading() {
  return (
    <>
      <SiteNav />
      <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </>
  );
}
