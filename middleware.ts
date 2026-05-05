import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = new Set<string>(["/login"]);
const PUBLIC_PREFIXES = ["/_next/", "/favicon", "/api/auth/"];
const ALWAYS_ALLOWED_AUTH_PATHS = new Set<string>(["/auth/change-password", "/auth/logout"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            res.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refresh the session if it's expired so getUser() returns a fresh JWT.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = (user?.app_metadata?.role as "admin" | "user" | undefined) ?? null;
  const mustChange = Boolean(user?.app_metadata?.must_change_password);

  // Public assets and the login page: never block.
  if (isPublicPath(pathname)) {
    // If a logged-in user hits /login, send them to their home.
    if (pathname === "/login" && user && !mustChange) {
      const home = role === "admin" ? "/admin/licenses" : "/dashboard";
      return NextResponse.redirect(new URL(home, req.url));
    }
    return res;
  }

  // Unauthenticated → /login (preserve original target).
  if (!user) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // must_change_password=true → only /auth/change-password and /auth/logout allowed.
  if (mustChange && !ALWAYS_ALLOWED_AUTH_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL("/auth/change-password", req.url));
  }

  // Role-mismatch redirects.
  if (pathname.startsWith("/admin")) {
    if (role !== "admin") return NextResponse.redirect(new URL("/dashboard", req.url));
  } else if (pathname.startsWith("/dashboard")) {
    if (role !== "user" && role !== "admin") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    // Admins viewing /dashboard is allowed in v1 (admin can browse user dashboards).
  }

  return res;
}

export const config = {
  matcher: [
    // Run middleware on every path EXCEPT next internals + static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)",
  ],
};
