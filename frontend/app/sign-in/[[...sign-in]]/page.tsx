import { SignIn } from "@clerk/nextjs";
import { Leaf, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Sign in",
};

export default function SignInPage() {
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
            <span>Personalized Study Workspace</span>
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome back to your studies
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Sign in to access your notes, quizzes, flashcards, and AI Teacher.
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
          <SignIn
            fallbackRedirectUrl="/dashboard"
            signUpUrl="/sign-up"
            appearance={{
              elements: {
                cardBox: "border-0 shadow-none bg-transparent",
              },
            }}
          />
        </Suspense>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        New to NoteMint?{" "}
        <Link
          href="/sign-up"
          className="font-semibold text-primary hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
