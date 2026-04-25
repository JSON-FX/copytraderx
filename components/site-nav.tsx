import Image from "next/image";
import Link from "next/link";

export function SiteNav() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
        <Link
          href="/licenses"
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <Image
            src="/copytraderx-logo.png"
            alt="CopyTraderX"
            width={32}
            height={32}
            priority
          />
          <span className="text-base font-semibold tracking-tight text-foreground">
            CopyTraderX{" "}
            <span className="font-normal text-muted-foreground">Licenses</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
