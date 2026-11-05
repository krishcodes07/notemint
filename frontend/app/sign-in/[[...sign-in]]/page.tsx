import { SignIn } from "@clerk/nextjs";
import { Leaf } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

export const metadata = {
  title: "Sign in",
};

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground"
            aria-hidden
          >
            <Leaf className="size-4.5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">NoteMint</span>
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to continue to your learning workspace.
          </p>
        </div>
      </div>

      <div className="w-full max-w-md rounded-xl border bg-card p-1 shadow-sm">
        <Suspense>
          <SignIn
            fallbackRedirectUrl="/dashboard"
            signUpUrl="/sign-up"
            appearance={{
              elements: {
                cardBox: "border-0 shadow-none",
              },
            }}
          />
        </Suspense>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-primary hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
