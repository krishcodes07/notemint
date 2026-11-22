import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { NoteMintLogo } from "@/components/brand/logo";

export const metadata = {
  title: "Log in",
  description: "Log in to your NoteMint study workspace.",
};

export default function SignInPage() {
  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row bg-background">
      {/* Left Brand Showcase Panel (Desktop) — Clean, Human, Mobbin style */}
      <div className="relative hidden w-full lg:flex lg:w-1/2 flex-col justify-between border-r border-border/70 bg-muted/20 p-12 xl:p-16">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <NoteMintLogo size="md" />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to home</span>
          </Link>
        </div>

        {/* Center Quotation / Value statement */}
        <div className="my-auto max-w-lg space-y-8 py-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground xl:text-4xl leading-tight">
              Welcome back to your study notebook.
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Pick up right where you left off. Your distilled chapters, active
              recall flashcards, and practice questions are saved and ready.
            </p>
          </div>

          {/* Genuine Student Quote */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
            <span className="font-serif text-3xl text-primary font-bold select-none leading-none">
              “
            </span>
            <p className="text-sm font-medium leading-relaxed text-foreground/90">
              NoteMint completely changed how I revise for board exams. Instead of
              staring at textbook walls of text, I test myself with flashcards and
              practice questions with marking rubrics.
            </p>
            <div className="flex items-center justify-between border-t border-border pt-4 text-xs">
              <div className="font-bold text-foreground">Aryan Sharma</div>
              <span className="text-muted-foreground">Class 12 Science</span>
            </div>
          </div>
        </div>

        {/* Bottom Status */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>NoteMint Study Studio</span>
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <Check className="size-3.5" />
            Private & encrypted notebooks
          </span>
        </div>
      </div>

      {/* Right Authentication Panel */}
      <div className="relative flex flex-1 flex-col items-center justify-center p-6 sm:p-12 lg:w-1/2">
        {/* Mobile Top Navigation */}
        <div className="w-full max-w-sm flex items-center justify-between mb-8 lg:hidden">
          <NoteMintLogo size="sm" />
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span>Home</span>
          </Link>
        </div>

        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1.5 text-center sm:text-left">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Log in to NoteMint
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Enter your account details to access your study sets.
            </p>
          </div>

          {/* Clerk Auth Box */}
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
            <Suspense
              fallback={
                <div className="flex h-64 w-full items-center justify-center">
                  <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              }
            >
              <SignIn
                fallbackRedirectUrl="/dashboard"
                signUpUrl="/sign-up"
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    cardBox: "w-full border-0 shadow-none bg-transparent p-0",
                    headerTitle: "hidden",
                    headerSubtitle: "hidden",
                    socialButtonsBlockButton:
                      "border border-border hover:bg-muted/60 text-foreground text-xs font-semibold rounded-full h-10 transition-colors",
                    formButtonPrimary:
                      "bg-foreground hover:bg-foreground/90 text-background text-xs font-semibold rounded-full h-10 shadow-xs transition-colors",
                    formFieldInput:
                      "rounded-xl border-border focus:border-primary focus:ring-1 focus:ring-primary text-xs h-10 bg-background",
                    footerActionLink: "text-primary hover:underline font-semibold",
                  },
                }}
              />
            </Suspense>
          </div>

          {/* Switcher */}
          <div className="text-center text-xs text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/sign-up"
              className="font-semibold text-foreground hover:underline"
            >
              Join for free
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
