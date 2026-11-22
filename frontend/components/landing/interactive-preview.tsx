"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  HelpCircle,
  Layers,
  MessageSquare,
  RotateCcw,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { NoteMintLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

type StudioTab = "notes" | "flashcards" | "questions" | "quiz" | "teacher";

interface Flashcard {
  concept: string;
  question: string;
  answer: string;
  mnemonic: string;
}

const DEMO_FLASHCARDS: Flashcard[] = [
  {
    concept: "Kidney Filtration",
    question: "What are the structural filtration units of the human kidney?",
    answer: "Nephrons (Bowman's Capsule + Glomerulus)",
    mnemonic: "Each kidney contains ~1.2 million filtering nephrons.",
  },
  {
    concept: "Cellular Energy",
    question: "Compare ATP yield: Aerobic vs Anaerobic respiration.",
    answer: "Aerobic: 36–38 ATP · Anaerobic: 2 ATP",
    mnemonic: "Aerobic yields 18× more cellular energy in mitochondria.",
  },
  {
    concept: "Plant Physiology",
    question: "What primary force pulls water upward in xylem during daytime?",
    answer: "Transpiration Pull (stomata evaporation suction)",
    mnemonic: "Creates negative pressure pulling water from roots to leaves.",
  },
];

export function InteractivePreview() {
  const [activeTab, setActiveTab] = useState<StudioTab>("notes");
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const currentFlashcard = DEMO_FLASHCARDS[flashcardIndex];

  return (
    <div className="relative mx-auto w-full max-w-5xl">
      {/* Top Floating Badge */}
      <div className="hidden sm:flex items-center justify-between px-2 mb-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground shadow-xs">
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Interactive Preview · Click any tab to test</span>
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          ⚡ 42-page PDF converted in 20s
        </span>
      </div>

      {/* Main Studio Frame */}
      <div className="rounded-3xl border border-border/90 bg-card p-2 sm:p-4 shadow-xl">
        {/* Browser Mockup Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-3 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5" aria-hidden>
              <span className="size-2.5 rounded-full bg-rose-400/80" />
              <span className="size-2.5 rounded-full bg-amber-400/80" />
              <span className="size-2.5 rounded-full bg-emerald-400/80" />
            </div>
            <span className="hidden sm:inline-block font-mono text-xs text-muted-foreground pl-2">
              notemint.app/dashboard/study/life-processes
            </span>
          </div>

          <span className="rounded-full bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            NCERT Class 10
          </span>
        </div>

        {/* Studio Window Inner */}
        <div className="relative mt-2 flex min-h-[440px] sm:min-h-[460px] overflow-hidden rounded-2xl border border-border/80 bg-background">
          {/* Left Mini Sidebar */}
          <aside className="hidden w-48 shrink-0 flex-col justify-between border-r border-border/80 bg-muted/20 p-3 sm:flex">
            <div className="space-y-4">
              <NoteMintLogo size="sm" />

              <div className="rounded-xl border border-border/80 bg-background/80 p-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Notebook
                </span>
                <p className="font-bold text-foreground text-sm truncate">
                  Life Processes
                </p>
                <span className="text-xs text-muted-foreground">Ch 6 · 42 pages</span>
              </div>

              <div className="space-y-1 text-xs font-medium">
                <div className="rounded-lg bg-foreground text-background px-2.5 py-1.5 font-semibold">
                  1. Nutrition & Energy
                </div>
                <div className="px-2.5 py-1 text-muted-foreground">
                  2. Respiration & ATP
                </div>
                <div className="px-2.5 py-1 text-muted-foreground">
                  3. Transportation
                </div>
                <div className="px-2.5 py-1 text-muted-foreground">
                  4. Excretion
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-background p-2.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-semibold mb-1">
                <Check className="size-3.5" />
                <span>Zero Hallucinations</span>
              </div>
              <span>100% cited from source text</span>
            </div>
          </aside>

          {/* Studio Content Canvas */}
          <div className="relative flex flex-1 flex-col overflow-hidden bg-background">
            {/* Top Bar */}
            <div className="flex h-12 items-center justify-between border-b border-border/80 px-4 sm:px-6">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-muted px-2.5 py-0.5 text-xs font-bold text-foreground">
                  Ch 6
                </span>
                <h3 className="text-sm font-bold text-foreground truncate">
                  Life Processes · Revision Card
                </h3>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                98% mastery
              </span>
            </div>

            {/* Content Body — Clean, Modular, Visual (NO text walls!) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 text-left">
              {/* Tab 1: Smart Notes (Clean visual cards with big readable formulas) */}
              {activeTab === "notes" && (
                <div className="space-y-4 max-w-2xl mx-auto">
                  {/* Visual Card 1: Core Reaction */}
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <Zap className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        Photosynthesis Reaction
                      </span>
                      <span className="text-xs font-semibold rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-emerald-800 dark:text-emerald-300">
                        High Yield
                      </span>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 text-center">
                      <p className="font-mono text-base sm:text-lg font-bold text-foreground tracking-tight">
                        6CO₂ + 12H₂O → C₆H₁₂O₆ + 6O₂ + 6H₂O
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Sunlight + Chlorophyll · O₂ released from water splitting (photolysis)
                      </p>
                    </div>
                  </div>

                  {/* Visual Card 2: 2-Column Comparison Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          Aerobic Respiration
                        </span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                          38 ATP
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div>• Site: <strong>Mitochondria</strong></div>
                        <div>• Requires: <strong>Oxygen (O₂)</strong></div>
                        <div>• Byproducts: <strong>CO₂ + H₂O</strong></div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          Anaerobic Respiration
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                          2 ATP
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div>• Site: <strong>Cytoplasm</strong></div>
                        <div>• Requires: <strong>No Oxygen</strong></div>
                        <div>• Byproduct: <strong>Lactic acid / Ethanol</strong></div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Concept Tags */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs text-muted-foreground font-semibold">
                      Core terms:
                    </span>
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">
                      Nephron
                    </span>
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">
                      Transpiration Pull
                    </span>
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">
                      Double Circulation
                    </span>
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">
                      Pepsin
                    </span>
                  </div>
                </div>
              )}

              {/* Tab 2: Flashcards (Big readable fonts, tactile flip) */}
              {activeTab === "flashcards" && (
                <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto py-2">
                  <div className="w-full flex items-center justify-between text-xs text-muted-foreground mb-3">
                    <span className="font-semibold">
                      Card {flashcardIndex + 1} of {DEMO_FLASHCARDS.length}
                    </span>
                    <span className="font-bold text-primary">
                      {currentFlashcard.concept}
                    </span>
                  </div>

                  {/* Interactive Flip Card */}
                  <div
                    onClick={() => setIsFlipped(!isFlipped)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setIsFlipped(!isFlipped);
                    }}
                    className="w-full cursor-pointer rounded-2xl border-2 border-primary/30 bg-card p-6 sm:p-8 shadow-sm transition-all hover:border-primary hover:shadow-md min-h-[190px] sm:min-h-[210px] flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary">
                        {isFlipped ? "Answer" : "Question · Tap to flip"}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground underline">
                        {isFlipped ? "Flip back" : "Reveal"}
                      </span>
                    </div>

                    <div className="my-auto py-3">
                      {!isFlipped ? (
                        <p className="text-lg sm:text-xl font-extrabold text-foreground leading-snug">
                          {currentFlashcard.question}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-lg sm:text-xl font-extrabold text-foreground leading-snug">
                            {currentFlashcard.answer}
                          </p>
                          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                            💡 {currentFlashcard.mnemonic}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="text-xs font-medium text-muted-foreground text-center">
                      {isFlipped ? "Great recall! Tap to flip back" : "Test your memory before revealing"}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full px-5 text-xs font-semibold"
                      disabled={flashcardIndex === 0}
                      onClick={() => {
                        setIsFlipped(false);
                        setFlashcardIndex((prev) => Math.max(0, prev - 1));
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full px-5 text-xs font-semibold"
                      disabled={flashcardIndex === DEMO_FLASHCARDS.length - 1}
                      onClick={() => {
                        setIsFlipped(false);
                        setFlashcardIndex((prev) =>
                          Math.min(DEMO_FLASHCARDS.length - 1, prev + 1)
                        );
                      }}
                    >
                      Next Card
                    </Button>
                  </div>
                </div>
              )}

              {/* Tab 3: Exam Questions (Step-by-step visual points) */}
              {activeTab === "questions" && (
                <div className="space-y-4 max-w-2xl mx-auto">
                  <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm sm:text-base font-bold text-foreground">
                        Q1. Pathway of air from nostrils to alveoli
                      </span>
                      <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-bold text-primary shrink-0">
                        3 Marks
                      </span>
                    </div>

                    {/* 3 Step Visual Pills */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                      <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs space-y-1">
                        <span className="font-bold text-foreground flex items-center gap-1">
                          <span className="size-4 rounded-full bg-foreground text-background text-[10px] flex items-center justify-center font-bold">1</span>
                          Nostrils → Trachea
                        </span>
                        <p className="text-muted-foreground text-[11px]">
                          Hair & mucus filter; cartilaginous rings prevent collapse.
                        </p>
                      </div>

                      <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs space-y-1">
                        <span className="font-bold text-foreground flex items-center gap-1">
                          <span className="size-4 rounded-full bg-foreground text-background text-[10px] flex items-center justify-center font-bold">2</span>
                          Bronchi Branches
                        </span>
                        <p className="text-muted-foreground text-[11px]">
                          Trachea divides into left & right bronchi in lungs.
                        </p>
                      </div>

                      <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs space-y-1">
                        <span className="font-bold text-foreground flex items-center gap-1">
                          <span className="size-4 rounded-full bg-foreground text-background text-[10px] flex items-center justify-center font-bold">3</span>
                          Alveolar Exchange
                        </span>
                        <p className="text-muted-foreground text-[11px]">
                          Extensive thin balloon surface for O₂/CO₂ diffusion.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-bold text-foreground">
                        Q2. Single vs Double Circulation in fishes & mammals
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Fishes pass blood 1× per cycle; humans pass blood 2× for high energy efficiency.
                      </p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-bold text-primary shrink-0">
                      2 Marks
                    </span>
                  </div>
                </div>
              )}

              {/* Tab 4: Diagnostic Quiz (Large readable fonts) */}
              {activeTab === "quiz" && (
                <div className="space-y-4 max-w-xl mx-auto py-2">
                  <div className="border-b border-border/80 pb-3">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">
                      Question 1 of 5
                    </span>
                    <h4 className="mt-1 text-base sm:text-lg font-bold text-foreground leading-snug">
                      Which enzyme in gastric juice digests proteins in an acidic pH?
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[
                      { text: "A) Salivary Amylase", isCorrect: false },
                      { text: "B) Pepsin", isCorrect: true },
                      { text: "C) Trypsin", isCorrect: false },
                      { text: "D) Bile Salts", isCorrect: false },
                    ].map((option, idx) => {
                      const isSelected = selectedOption === idx;
                      let style =
                        "border-border bg-card hover:border-primary/60 text-foreground";
                      if (selectedOption !== null) {
                        if (option.isCorrect) {
                          style =
                            "border-emerald-500 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 font-bold";
                        } else if (isSelected && !option.isCorrect) {
                          style =
                            "border-rose-500 bg-rose-500/10 text-rose-950 dark:text-rose-200";
                        }
                      }

                      return (
                        <button
                          key={option.text}
                          type="button"
                          onClick={() => setSelectedOption(idx)}
                          className={`w-full flex items-center justify-between rounded-xl border p-3.5 text-left text-sm font-semibold transition-all ${style}`}
                        >
                          <span>{option.text}</span>
                          {selectedOption !== null && option.isCorrect && (
                            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                          )}
                          {selectedOption !== null && isSelected && !option.isCorrect && (
                            <XCircle className="size-4 text-rose-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {selectedOption !== null && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-950 dark:text-emerald-200 flex items-center justify-between gap-3">
                      <span>
                        <strong>Correct!</strong> Pepsin activates at acidic pH (~1.8). Trypsin operates in an alkaline medium.
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedOption(null)}
                        className="text-xs font-bold underline shrink-0 hover:opacity-80"
                      >
                        Reset
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 5: AI Teacher (Brisk, crisp dialogue with citation) */}
              {activeTab === "teacher" && (
                <div className="space-y-3 max-w-2xl mx-auto py-1">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-xs bg-foreground text-background px-4 py-2.5 text-sm font-semibold">
                      Can you explain how nephron filtration works in Hindi?
                    </div>
                  </div>

                  <div className="flex justify-start">
                    <div className="max-w-[90%] rounded-2xl rounded-tl-xs border border-border bg-card p-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground text-sm">
                          AI Mentor
                        </span>
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                          NCERT Page 110
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-foreground/90">
                        Kidney ke andar millions of micro-filters hote hain jinhe <strong>Nephrons</strong> kehte hain. Jab blood Glomerulus mein pressure se aata hai, to glucose, salts aur water filter ho jaate hain. Essential nutrients wapas blood mein reabsorb hote hain, aur baaki waste urine banta hai!
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Floating Navigation Pill */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-fit max-w-[95%]">
              <nav
                aria-label="Study modes"
                className="flex items-center gap-1 rounded-full border border-border/80 bg-background/95 p-1 shadow-lg backdrop-blur-md"
              >
                {[
                  { id: "notes", label: "Smart Notes", icon: BookOpen },
                  { id: "flashcards", label: "Flashcards", icon: Layers },
                  { id: "questions", label: "Questions", icon: HelpCircle },
                  { id: "quiz", label: "Diagnostic Quiz", icon: CheckCircle2 },
                  { id: "teacher", label: "AI Teacher", icon: MessageSquare },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id as StudioTab)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                        active
                          ? "bg-foreground text-background shadow-xs"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="size-3.5" />
                      <span className="hidden xs:inline sm:inline">{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>

        {/* Bottom CTA Strip */}
        <div className="mt-4 flex flex-col items-center justify-between gap-3 px-2 sm:flex-row">
          <p className="text-xs text-muted-foreground text-center sm:text-left">
            Everything above was generated from an NCERT biology PDF in under 20 seconds.
          </p>
          <Button size="sm" asChild className="rounded-full gap-2 shadow-xs">
            <Link href="/dashboard/study/life-processes">
              <span>Open full study notebook</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
