import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { NoteMintLogo } from "@/components/brand/logo";

export const metadata = {
  title: "Join NoteMint",
  description: "Create your free NoteMint study account.",
};

export default function SignUpPage() {
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

        {/* Center Editorial Showcase */}
        <div className="my-auto max-w-lg space-y-8 py-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground xl:text-4xl leading-tight">
              Turn heavy textbooks into active, effortless recall.
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Join thousands of students using NoteMint to turn messy PDFs into
              two-sided flashcards, practice questions with marking schemes, and
              instant bilingual explanations.
            </p>
          </div>

          {/* Simple bullet points */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-3 text-xs text-muted-foreground">
            <div className="font-bold text-foreground text-sm">
              Everything in your free study workspace:
            </div>
            <div className="flex items-start gap-2.5">
              <Check className="size-4 text-emerald-600 dark:text-emerald-400 font-bold shrink-0 mt-0.5" />
              <span className="text-foreground">
                <strong>Smart Note Distillation:</strong> Core formulas and definitions extracted cleanly.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <Check className="size-4 text-emerald-600 dark:text-emerald-400 font-bold shrink-0 mt-0.5" />
              <span className="text-foreground">
                <strong>Two-Sided Flashcards:</strong> Flip cards engineered for active retrieval practice.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <Check className="size-4 text-emerald-600 dark:text-emerald-400 font-bold shrink-0 mt-0.5" />
              <span className="text-foreground">
                <strong>Marking Rubrics:</strong> 1-mark, 3-mark, and 5-mark practice questions.
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Status */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Free student account</span>
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <Check className="size-3.5" />
            No credit card required
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
              Create your account
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Start transforming your study materials today.
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
              <SignUp
                fallbackRedirectUrl="/dashboard"
                signInUrl="/sign-in"
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
            Already have an account?{" "}
            <Link
              href="/sign-in"
              className="font-semibold text-foreground hover:underline"
            >
              Log in here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
