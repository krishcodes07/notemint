import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  FileText,
  HelpCircle,
  Layers,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HealthStatus } from "@/components/health-status";
import { InteractivePreview } from "@/components/landing/interactive-preview";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const PILLARS = [
  {
    icon: FileText,
    title: "Structured Note Distillation",
    subtitle: "Clarity over clutter",
    description:
      "Raw chapters and lecture PDFs distilled into clear, hierarchical notes with formulas, bullet points, and conceptual diagrams.",
  },
  {
    icon: HelpCircle,
    title: "Exam Questions & Marking Schemes",
    subtitle: "Targeted revision",
    description:
      "High-yield practice questions categorized by marks and syllabus importance, complete with model answers.",
  },
  {
    icon: Layers,
    title: "Active Recall Flashcards",
    subtitle: "Long-term memory",
    description:
      "Interactive two-sided cards for rapid active recall of chemical equations, definitions, and mathematical identities.",
  },
  {
    icon: Bot,
    title: "Grounded AI Teacher",
    subtitle: "Bilingual Socratic tutor",
    description:
      "Ask clarifying questions in English or Hindi (Hinglish). The AI Teacher explains concepts strictly grounded in your materials.",
  },
] as const;

const ARCHITECTURE_STEPS = [
  {
    step: "01",
    phase: "Phase 5",
    title: "Upload Study Material",
    description:
      "Drop in your textbook PDFs, syllabus chapters, or handwritten lecture notes. Stored securely in private Neon Object Storage.",
  },
  {
    step: "02",
    phase: "Phase 6 & 7",
    title: "AI Synthesis & Processing",
    description:
      "Our extraction engine parses key concepts and generates smart notes, flashcard sets, and exam quizzes without hallucination.",
  },
  {
    step: "03",
    phase: "Phase 4 & 8",
    title: "Distraction-Free Workspace",
    description:
      "Open your study notebook. Switch seamlessly between Notes, Questions, Flashcards, Quizzes, and AI Teacher Talk from one bar.",
  },
] as const;

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
            {/* Tag Badge */}
            <Badge
              variant="secondary"
              className="mb-6 gap-1.5 rounded-full border border-primary/20 bg-brand-soft/40 px-3.5 py-1 text-xs font-semibold text-primary"
            >
              <Sparkles className="size-3.5" />
              <span>Phase 4 · Study Workspace & Dashboard Live</span>
            </Badge>

            {/* Main Headline */}
            <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
              Study without distractions.{" "}
              <span className="text-primary underline decoration-primary/20 decoration-wavy underline-offset-8">
                Understand deeply.
              </span>
            </h1>

            {/* Subheadline */}
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl">
              NoteMint combines a minimalist student notebook with an AI study
              workspace. Transform study material into structured notes,
              flashcards, exam questions, and bilingual AI explanations.
            </p>

            {/* Call to Actions */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild className="h-11 gap-2 rounded-xl px-6 text-sm shadow-md">
                <Link href="/dashboard">
                  <span>Enter Study Workspace</span>
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="h-11 rounded-xl px-5 text-sm"
              >
                <Link href="/dashboard/study/life-processes">
                  <BookOpen className="size-4 text-primary" />
                  <span>Preview Life Processes</span>
                </Link>
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Sign-up and authentication are live. Document uploads arrive in Phase 5.
            </p>
          </div>

          {/* Interactive Workspace Preview Section */}
          <div className="mt-14 sm:mt-18">
            <InteractivePreview />
          </div>
        </section>

        {/* Learning Pillars Section */}
        <section className="border-t bg-muted/20 py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="mb-12 flex flex-col items-center text-center">
              <Badge variant="outline" className="mb-2 text-xs">
                Pedagogy First
              </Badge>
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl">
                Built for active student recall
              </h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                Rather than passive reading, NoteMint engages you through multiple
                learning modalities tailored to board exams and concept mastery.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {PILLARS.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <div
                    key={pillar.title}
                    className="group relative flex flex-col justify-between rounded-2xl border bg-card p-6 shadow-xs transition-all hover:border-primary/40 hover:shadow-md"
                  >
                    <div>
                      <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary transition-transform group-hover:scale-105">
                        <Icon className="size-5" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                        {pillar.subtitle}
                      </span>
                      <h3 className="mt-1 text-base font-bold text-foreground">
                        {pillar.title}
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {pillar.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Roadmap & Architecture Steps */}
        <section className="border-t py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="mb-12 flex flex-col items-center text-center">
              <Badge variant="outline" className="mb-2 text-xs">
                Disciplined Architecture
              </Badge>
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl">
                From Raw Document to Study Mastery
              </h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                How NoteMint turns unstructured textbooks into interactive study
                materials.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {ARCHITECTURE_STEPS.map((step) => (
                <div
                  key={step.step}
                  className="flex flex-col gap-3 rounded-2xl border bg-card/60 p-6 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xl font-bold text-primary">
                      {step.step}
                    </span>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {step.phase}
                    </Badge>
                  </div>
                  <h3 className="text-base font-bold text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* System & API Infrastructure Status */}
        <section className="border-t bg-muted/20 py-16">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-primary font-semibold">
                  <Brain className="size-5" />
                  <span>Verified Infrastructure</span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Full-Stack Health & Reliability
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  The Next.js 16 frontend integrates seamlessly with our FastAPI
                  backend, Neon PostgreSQL database, and private Neon Object
                  Storage. Every phase is verified with end-to-end testing.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <div className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                    <span>Clerk RS256 Auth</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                    <span>Neon PostgreSQL</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                    <span>S3 Object Storage</span>
                  </div>
                </div>
              </div>

              <div>
                <HealthStatus />
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
