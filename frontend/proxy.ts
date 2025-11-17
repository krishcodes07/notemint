import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/onboarding(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  console.log("User in proxy:", userId);

  if (!userId) return NextResponse.next();

  const res = await fetch(`http://127.0.0.1:8000/api/user/${userId}`);
  const data = await res.json();

  const completed = data?.completedOnboarding || false;
  const isOnboarding = req.nextUrl.pathname.startsWith("/onboarding");

  if (!completed && !isOnboarding) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  if (completed && isOnboarding) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|static|.*\\..*|favicon.ico).*)"],
};
