import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileText,
  Layers,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { HealthStatus } from "@/components/health-status";
import { InteractivePreview } from "@/components/landing/interactive-preview";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero Section — Mobbin Style */}
        <section className="relative px-4 pt-16 pb-12 sm:px-6 sm:pt-24 lg:pt-28">
          <div className="mx-auto max-w-5xl text-center">
            {/* Display Headline with Inline Badges */}
            <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-[76px] font-extrabold tracking-tight text-foreground leading-[1.08] max-w-5xl mx-auto">
              Where students{" "}
              <span className="inline-flex items-center align-middle rounded-2xl border border-border bg-card px-2.5 py-0.5 sm:px-3 sm:py-1 shadow-xs mx-1">
                <FileText className="size-5 sm:size-7 text-emerald-600 dark:text-emerald-400" />
              </span>{" "}
              and learners 💡 find study sets{" "}
              <span className="inline-flex items-center align-middle rounded-2xl border border-border bg-card px-2.5 py-0.5 sm:px-3 sm:py-1 shadow-xs mx-1">
                <Layers className="size-5 sm:size-7 text-primary" />
              </span>{" "}
              that work.
            </h1>

            {/* Clean Sub-headline */}
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              The intelligent study workspace for textbooks, slides, and PDFs.
              <br className="hidden sm:inline" />
              Smart notes, active recall flashcards, and practice quizzes—built in seconds.
            </p>

            {/* Pill Action Buttons */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-foreground text-background px-7 text-sm font-semibold hover:bg-foreground/90 shadow-sm transition-all"
              >
                <Link href="/sign-up">Join for free</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full px-6 text-sm font-medium hover:bg-muted/60 transition-all"
              >
                <Link href="#preview">
                  <span>See live demo</span>
                  <ArrowRight className="size-4 ml-1.5" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Interactive Workspace Studio */}
          <div id="preview" className="mt-14 sm:mt-18">
            <InteractivePreview />
          </div>
        </section>

        {/* Human Quote Section */}
        <section className="border-t border-border/70 py-20 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <span className="font-serif text-5xl sm:text-6xl text-primary font-bold select-none leading-none">
              “
            </span>
            <blockquote className="mt-2 text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground leading-snug">
              We want to spend 80% of our time actually testing ourselves and
              revising. For the rest, we use NoteMint to distill chapters
              instead of wasting hours writing notes by hand.
            </blockquote>

            <div className="mt-8 flex items-center justify-between flex-wrap gap-4 border-t border-border/70 pt-6">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-full bg-emerald-600/10 text-emerald-800 dark:text-emerald-200 flex items-center justify-center font-bold text-sm">
                  AS
                </div>
                <div>
                  <div className="text-base font-bold text-foreground">
                    Aryan Sharma
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Class 12 CBSE Science Student
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full border border-border px-3.5 py-1 text-xs font-semibold text-muted-foreground">
                  NCERT Biology & Chemistry
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Category Pills Strip — Larger, readable font */}
        <section className="border-t border-border/70 bg-muted/20 py-12">
          <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
            <h3 className="text-base sm:text-lg font-bold text-foreground mb-4">
              Studying for an upcoming exam?
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
              {[
                "Biology (Ch 6 Life Processes)",
                "Organic Chemistry",
                "Physics: Electricity & Magnetism",
                "Mathematics: Calculus",
                "History & Political Science",
                "Computer Science",
              ].map((subject) => (
                <span
                  key={subject}
                  className="rounded-full border border-border bg-card px-4 py-2 text-sm sm:text-[15px] font-semibold text-foreground shadow-2xs hover:border-primary/50 transition-colors cursor-default"
                >
                  {subject}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Workflow Walkthrough */}
        <section id="workflow" className="border-t border-border/70 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-3xl text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Your new study workflow
              </h2>
              <p className="mt-3 text-base sm:text-lg text-muted-foreground">
                From a dense 50-page PDF to active memory in three simple steps.
              </p>
            </div>

            <div className="space-y-12 sm:space-y-16">
              {/* Step 1 */}
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 items-center">
                <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xs">
                  <span className="font-mono text-sm font-bold uppercase tracking-wider text-primary">
                    Step 01
                  </span>
                  <h3 className="mt-2 text-2xl font-bold text-foreground">
                    Drop in any textbook or lecture slides
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                    Upload your NCERT chapters, university lecture decks, or
                    handouts. NoteMint parses the text, diagrams, and formulas
                    accurately.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-6 flex flex-col justify-center gap-3">
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm">
                    <FileText className="size-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-bold text-foreground text-sm sm:text-base">
                        NCERT_Biology_Class10_Ch6.pdf
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        42 pages · 3.8 MB · Ready to parse
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground px-1">
                    <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Processed into formulas, terms, and diagrams</span>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 items-center">
                <div className="order-2 md:order-1 rounded-2xl border border-border bg-muted/30 p-6 space-y-3">
                  <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">
                      Generated Smart Card
                    </span>
                    <p className="font-bold text-foreground text-base sm:text-lg leading-snug">
                      What is the chemical equation for photosynthesis?
                    </p>
                    <div className="rounded-xl bg-emerald-500/10 p-3 sm:p-4 font-mono text-emerald-950 dark:text-emerald-200 text-sm sm:text-base font-bold">
                      6CO₂ + 12H₂O → C₆H₁₂O₆ + 6O₂ + 6H₂O
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground px-1">
                    <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Includes 20 active recall cards & 5 quiz questions</span>
                  </div>
                </div>
                <div className="order-1 md:order-2 rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xs">
                  <span className="font-mono text-sm font-bold uppercase tracking-wider text-primary">
                    Step 02
                  </span>
                  <h3 className="mt-2 text-2xl font-bold text-foreground">
                    Get structured notes, flashcards & quizzes
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                    Instead of reading the same page four times, NoteMint extracts
                    the high-yield concepts into two-sided flashcards and
                    exam-style questions with marking schemes.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 items-center">
                <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xs">
                  <span className="font-mono text-sm font-bold uppercase tracking-wider text-primary">
                    Step 03
                  </span>
                  <h3 className="mt-2 text-2xl font-bold text-foreground">
                    Ask the AI Teacher when you get stuck
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                    Stuck on a tricky concept? Ask in plain English or Hindi.
                    The AI Teacher breaks it down conversationally, strictly
                    grounded in your uploaded material with exact page citations.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-6 space-y-3">
                  <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground text-sm sm:text-base">
                        Q: Explain double circulation simply.
                      </span>
                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        Page 106 Citation
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Blood enters the heart twice in one complete cycle: once
                      deoxygenated from the body to the lungs, and once oxygenated
                      from the lungs back to body tissues.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Deep Contrast Section with Smooth Elegant Curves Top & Bottom (Reference 2) */}
        <section className="relative overflow-hidden py-10 sm:py-16">
          {/* Top Curved Wave / Swoop Transition */}
          <div className="w-full overflow-hidden leading-none -mb-px" aria-hidden>
            <svg
              viewBox="0 0 1440 90"
              fill="none"
              preserveAspectRatio="none"
              className="w-full h-12 sm:h-20 block text-slate-950 fill-current"
            >
              <path d="M0,90 C360,10 1080,10 1440,90 L1440,90 L0,90 Z" />
            </svg>
          </div>

          {/* Main Dark Body */}
          <div className="bg-slate-950 text-white py-16 sm:py-24 px-4 sm:px-6 relative">
            {/* Ambient Lighting Gradients */}
            <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-emerald-500/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 -left-32 size-96 rounded-full bg-emerald-700/15 blur-3xl" />

            <div className="relative mx-auto max-w-6xl">
              <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 items-center">
                <div className="space-y-6">
                  <span className="rounded-full bg-emerald-500/20 px-3.5 py-1 text-xs font-bold text-emerald-300">
                    Late Night Study Studio
                  </span>
                  <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
                    Designed for quiet focus and zero distractions.
                  </h2>
                  <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-lg">
                    No notifications, no ads, no clickbait. Just your documents,
                    your study sets, and a patient AI mentor that answers whenever
                    you need help.
                  </p>

                  {/* 4 Stats Chips */}
                  <div className="grid grid-cols-2 gap-5 pt-4">
                    <div className="border-l-2 border-emerald-500/50 pl-4">
                      <div className="text-3xl sm:text-4xl font-extrabold text-white">30s</div>
                      <div className="text-xs sm:text-sm text-slate-400 mt-1">
                        Average set generation
                      </div>
                    </div>
                    <div className="border-l-2 border-emerald-500/50 pl-4">
                      <div className="text-3xl sm:text-4xl font-extrabold text-white">5</div>
                      <div className="text-xs sm:text-sm text-slate-400 mt-1">
                        Study modes in one app
                      </div>
                    </div>
                    <div className="border-l-2 border-emerald-500/50 pl-4">
                      <div className="text-3xl sm:text-4xl font-extrabold text-white">100%</div>
                      <div className="text-xs sm:text-sm text-slate-400 mt-1">
                        Grounded in your files
                      </div>
                    </div>
                    <div className="border-l-2 border-emerald-500/50 pl-4">
                      <div className="text-3xl sm:text-4xl font-extrabold text-white">0</div>
                      <div className="text-xs sm:text-sm text-slate-400 mt-1">
                        Ads or clutter
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chat Simulation Preview Card */}
                <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-7 space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-bold text-slate-200 text-sm">
                        AI Study Mentor
                      </span>
                    </div>
                    <span className="text-slate-400 font-mono text-xs">
                      English & Hindi
                    </span>
                  </div>

                  <div className="space-y-3.5">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-xs bg-emerald-600 px-4 py-3 text-xs sm:text-sm text-white font-medium">
                        Can you explain how transpiration pull works in Hindi?
                      </div>
                    </div>

                    <div className="flex justify-start">
                      <div className="max-w-[92%] rounded-2xl rounded-tl-xs border border-slate-800 bg-slate-800/80 p-4 sm:p-5 text-xs sm:text-sm text-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-emerald-400 text-sm">
                            Teacher
                          </span>
                          <span className="rounded-full bg-slate-700/60 px-2.5 py-0.5 text-[11px] text-slate-300">
                            NCERT Page 108
                          </span>
                        </div>
                        <p className="leading-relaxed text-slate-300 text-xs sm:text-sm">
                          Bilkul! Jab leaves ke stomata se paani evaporate hota hai
                          (transpiration), to ek suction pressure create hota hai.
                          Jaise straw se juice peete hain, waise hi yeh pressure roots
                          se paani ko xylem ke through ped ke top tak kheenchta hai!
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Curved Wave / Swoop Transition */}
          <div className="w-full overflow-hidden leading-none -mt-px" aria-hidden>
            <svg
              viewBox="0 0 1440 90"
              fill="none"
              preserveAspectRatio="none"
              className="w-full h-12 sm:h-20 block text-slate-950 fill-current"
            >
              <path d="M0,0 C360,80 1080,80 1440,0 L1440,0 L0,0 Z" />
            </svg>
          </div>
        </section>

        {/* Comparison Section (Why NoteMint vs Generic AI) */}
        <section id="comparison" className="border-t border-border/70 py-20 sm:py-28">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="mx-auto max-w-3xl text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Why NoteMint is different from standard AI
              </h2>
              <p className="mt-3 text-base sm:text-lg text-muted-foreground">
                General-purpose chatbots write long essays you still have to read.
                NoteMint builds active study sets.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x border-border">
                {/* Generic AI column */}
                <div className="p-6 sm:p-8 space-y-4 bg-muted/20">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Standard AI Chatbots
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-foreground">
                    Walls of generic text
                  </h3>
                  <ul className="space-y-3.5 text-sm sm:text-base text-muted-foreground">
                    <li className="flex items-start gap-2.5">
                      <span className="text-rose-500 font-bold shrink-0">✕</span>
                      <span>Hallucinates facts outside your syllabus</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="text-rose-500 font-bold shrink-0">✕</span>
                      <span>No flashcards or active recall testing</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="text-rose-500 font-bold shrink-0">✕</span>
                      <span>No board-exam marking schemes</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="text-rose-500 font-bold shrink-0">✕</span>
                      <span>English-only responses that miss regional phrasing</span>
                    </li>
                  </ul>
                </div>

                {/* NoteMint column */}
                <div className="p-6 sm:p-8 space-y-4 bg-primary/5">
                  <div className="text-xs font-bold uppercase tracking-wider text-primary">
                    NoteMint Study Studio
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-foreground">
                    Active, syllabus-grounded recall
                  </h3>
                  <ul className="space-y-3.5 text-sm sm:text-base text-foreground font-medium">
                    <li className="flex items-start gap-2.5">
                      <Check className="size-4 text-emerald-600 dark:text-emerald-400 font-bold shrink-0 mt-1" />
                      <span>100% cited directly from your uploaded pages</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="size-4 text-emerald-600 dark:text-emerald-400 font-bold shrink-0 mt-1" />
                      <span>Interactive two-sided flashcards with flip recall</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="size-4 text-emerald-600 dark:text-emerald-400 font-bold shrink-0 mt-1" />
                      <span>1-mark, 3-mark, and 5-mark official marking rubrics</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="size-4 text-emerald-600 dark:text-emerald-400 font-bold shrink-0 mt-1" />
                      <span>Patient bilingual explanations in English and Hindi</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live System Reliability & Health */}
        <section className="border-t border-border/70 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1 text-xs font-semibold text-foreground">
                  <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Private by default</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  Your notes belong to you.
                </h2>
                <p className="text-base leading-relaxed text-muted-foreground">
                  Uploaded textbooks and documents are stored privately in your
                  account. They are never used to train public models or shared
                  with other users.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground">
                    <Lock className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Encrypted document storage</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground">
                    <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>FastAPI live backend</span>
                  </div>
                </div>
              </div>

              <div>
                <HealthStatus />
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA Banner */}
        <section className="border-t border-border/70 bg-muted/20 py-20 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 space-y-6">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
              Start studying with clarity.
            </h2>
            <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground">
              Try NoteMint today. Jump into the interactive Life Processes demo
              or create your free study account in seconds.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-foreground text-background px-8 text-sm font-semibold hover:bg-foreground/90 shadow-sm transition-all"
              >
                <Link href="/sign-up">Join for free</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full px-6 text-sm font-medium hover:bg-muted/60 transition-all"
              >
                <Link href="/dashboard/study/life-processes">
                  <span>Explore demo notebook</span>
                  <ArrowRight className="size-4 ml-1.5" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
