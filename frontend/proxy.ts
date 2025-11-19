import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/onboarding(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  // ⛔ If trying to access a protected route and not signed in → redirect
  if (isProtectedRoute(req) && !userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  // If user is logged in, continue onboarding logic
  const res = await fetch(`http://127.0.0.1:8000/api/user/${userId}`);
  const data = await res.json();

  const completed = data?.completedOnboarding || false;
  const isOnboarding = req.nextUrl.pathname.startsWith("/onboarding");

  if (userId) {
    if (!completed && !isOnboarding) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
    if (completed && isOnboarding) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|static|.*\\..*|favicon.ico).*)"],
};
