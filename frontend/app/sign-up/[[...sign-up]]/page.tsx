import { SignUp } from "@clerk/nextjs";
import { Leaf, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Sign up",
};

export default function SignUpPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-85"
        >
          <span
            className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs"
            aria-hidden
          >
            <Leaf className="size-5" />
          </span>
          <span className="text-xl font-extrabold tracking-tight">NoteMint</span>
        </Link>
        <div>
          <Badge
            variant="secondary"
            className="mb-2 gap-1 text-[11px] font-medium"
          >
            <Sparkles className="size-3 text-primary" />
            <span>Start Learning Smarter</span>
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Create your study account
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Join NoteMint to transform raw study materials into active knowledge.
          </p>
        </div>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-2 shadow-xl">
        <Suspense
          fallback={
            <div className="flex h-72 w-full items-center justify-center">
              <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          }
        >
          <SignUp
            fallbackRedirectUrl="/dashboard"
            signInUrl="/sign-in"
            appearance={{
              elements: {
                cardBox: "border-0 shadow-none bg-transparent",
              },
            }}
          />
        </Suspense>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="font-semibold text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
