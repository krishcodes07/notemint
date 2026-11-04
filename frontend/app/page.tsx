import {
  Bot,
  BookOpen,
  FileText,
  GitBranch,
  HelpCircle,
  Layers,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HealthStatus } from "@/components/health-status";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const FEATURES = [
  {
    icon: FileText,
    title: "Smart Notes",
    description: "Structured notes generated from your PDFs.",
  },
  {
    icon: HelpCircle,
    title: "Important Questions",
    description: "Exam-focused questions ranked by importance.",
  },
  {
    icon: ListChecks,
    title: "MCQ Quizzes",
    description: "Multiple-choice quizzes to test your recall.",
  },
  {
    icon: Layers,
    title: "Flashcards",
    description: "Interactive cards for active revision.",
  },
  {
    icon: GitBranch,
    title: "Mind Maps",
    description: "Visual maps of concepts and their relationships.",
  },
  {
    icon: BookOpen,
    title: "Chapter Summaries",
    description: "Concise summaries of every chapter you upload.",
  },
] as const;

const STEPS = [
  {
    step: "01",
    title: "Upload a PDF",
    description: "Drop in lecture notes, textbooks, or chapters.",
  },
  {
    step: "02",
    title: "Choose your resources",
    description: "Pick notes, quizzes, flashcards, mind maps, and more.",
  },
  {
    step: "03",
    title: "Learn interactively",
    description: "Study in your workspace and ask the AI Teacher.",
  },
] as const;

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <div className="flex max-w-2xl flex-col items-start gap-6">
            <Badge variant="secondary">
              <Sparkles className="size-3" aria-hidden />
              AI-powered learning platform
            </Badge>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Turn study material into{" "}
              <span className="text-primary">smart learning resources</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Upload a PDF and generate notes, questions, quizzes, flashcards,
              and mind maps — then study with an AI Teacher that understands
              your documents.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" disabled>
                Get started
              </Button>
              <Button size="lg" variant="outline" disabled>
                Upload a PDF
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Authentication and uploads arrive in upcoming phases.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="border-t bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <div className="mb-10 flex flex-col gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                Everything you need to study smarter
              </h2>
              <p className="text-muted-foreground">
                Generated from the documents you upload, all in one workspace.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl border bg-card p-5"
                >
                  <div className="mb-3 flex size-9 items-center justify-center rounded-md bg-brand-soft text-primary">
                    <feature.icon className="size-4.5" aria-hidden />
                  </div>
                  <h3 className="font-medium">{feature.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <div className="mb-10 flex flex-col gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                How it works
              </h2>
              <p className="text-muted-foreground">
                Three steps from raw PDF to active learning.
              </p>
            </div>
            <ol className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {STEPS.map((item) => (
                <li key={item.step} className="flex flex-col gap-2">
                  <span className="font-mono text-sm font-medium text-primary">
                    {item.step}
                  </span>
                  <h3 className="font-medium">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Connectivity check */}
        <section className="border-t bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-primary">
                  <Bot className="size-5" aria-hidden />
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    Frontend meets backend
                  </h2>
                </div>
                <p className="text-muted-foreground">
                  The Next.js frontend communicates with the FastAPI backend
                  through a centralized API client. The card checks{" "}
                  <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                    /api/v1/health
                  </code>{" "}
                  and reports loading, success, or connection errors.
                </p>
                <p className="text-sm text-muted-foreground">
                  Start the API with{" "}
                  <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                    uvicorn app.main:app --reload
                  </code>{" "}
                  to see a live connection.
                </p>
              </div>
              <HealthStatus />
            </div>
          </div>
        </section>

        {/* AI Teacher teaser */}
        <section className="border-t">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              Coming next: your AI Teacher
            </h2>
            <p className="max-w-2xl text-muted-foreground">
              Ask questions about your uploaded materials, get step-by-step
              explanations, and switch between Hindi and English — grounded in
              your own documents.
            </p>
            <Badge variant="outline">Phase 9 · AI Teacher</Badge>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
