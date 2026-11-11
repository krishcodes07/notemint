"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  HelpCircle,
  Layers,
  Leaf,
  Plus,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type MiniTab = "notes" | "questions" | "flashcards" | "quiz" | "ai-talk";

export function InteractivePreview() {
  const [activeTab, setActiveTab] = useState<MiniTab>("notes");

  return (
    <div className="relative mx-auto w-full max-w-5xl rounded-3xl border-2 border-border/80 bg-card/60 p-2 shadow-2xl shadow-primary/5 backdrop-blur-xl sm:p-4">
      {/* Browser mockup top window bar */}
      <div className="flex items-center justify-between border-b pb-3 px-3">
        <div className="flex items-center gap-1.5">
          <div className="size-2.5 rounded-full bg-red-400/80" />
          <div className="size-2.5 rounded-full bg-amber-400/80" />
          <div className="size-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-2 font-mono text-[11px] text-muted-foreground">
            notemint.app/dashboard/study/life-processes
          </span>
        </div>
        <Badge variant="secondary" className="text-[10px] font-mono">
          Interactive Live Preview
        </Badge>
      </div>

      {/* Mock Workspace Container */}
      <div className="relative mt-2 flex h-[520px] overflow-hidden rounded-2xl border bg-background">
        {/* Left Mini Sidebar */}
        <div className="hidden w-52 shrink-0 flex-col justify-between border-r bg-sidebar p-3 sm:flex">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <span className="flex size-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Leaf className="size-3" />
              </span>
              <span className="text-xs font-bold text-foreground">NoteMint</span>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border bg-background/50 px-2 py-1.5 text-[11px] font-semibold text-foreground">
              <Plus className="size-3 text-primary" />
              <span>New Topic</span>
            </div>

            <div className="mt-1 flex flex-col gap-1">
              <span className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Recent
              </span>
              <div className="rounded-lg bg-brand-soft/40 px-2 py-1.5 text-xs font-semibold text-primary dark:bg-brand-soft/20 flex items-center gap-1.5">
                <BookOpen className="size-3" />
                <span className="truncate">Life Processes</span>
              </div>
              <div className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                <FileText className="size-3" />
                <span className="truncate">Acids, Bases & Salts</span>
              </div>
              <div className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                <FileText className="size-3" />
                <span className="truncate">Trigonometry</span>
              </div>
              <div className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                <FileText className="size-3" />
                <span className="truncate">Light</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t pt-2 text-[11px] text-muted-foreground">
            <div className="size-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">
              NM
            </div>
            <span className="truncate font-medium">Student Study Session</span>
          </div>
        </div>

        {/* Workspace Main Area */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex h-11 items-center justify-between border-b px-4 text-center">
            <span className="text-xs text-muted-foreground">Class 10 · Biology</span>
            <h3 className="text-xs font-bold text-foreground sm:text-sm">
              Life Processes
            </h3>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
              ● Ready
            </span>
          </div>

          {/* Dynamic Content Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 text-left">
            {activeTab === "notes" && (
              <div className="flex flex-col gap-4 text-xs leading-relaxed text-foreground">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="font-semibold text-primary uppercase tracking-wider text-[11px]">
                    Structured Notes
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Grounded in NCERT Class 10
                  </span>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    What is Life Process?
                  </h4>
                  <p className="mt-1 text-muted-foreground">
                    The basic functions performed by living organisms to
                    maintain their life on this earth. Core processes include
                    Nutrition, Respiration, Transportation, and Excretion.
                  </p>
                </div>

                <div className="rounded-xl border bg-muted/20 p-3.5">
                  <h5 className="font-semibold text-foreground">
                    Nutrition & Energy Transfer
                  </h5>
                  <p className="mt-1 text-muted-foreground">
                    • <strong>Autotrophic:</strong> Synthesis of organic food
                    using inorganic substances (CO₂ + H₂O) in presence of
                    chlorophyll and sunlight.
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    • <strong>Heterotrophic:</strong> Consumption of complex
                    nutrients derived from other organisms.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "questions" && (
              <div className="flex flex-col gap-3 text-xs">
                <Badge variant="outline" className="w-fit text-[10px]">
                  Board Exam Predicted Questions
                </Badge>
                <div className="rounded-xl border bg-card p-3 shadow-xs">
                  <span className="font-semibold text-foreground">
                    Q1. (3 Marks) Differentiate between Aerobic and Anaerobic
                    respiration with site of occurrence.
                  </span>
                  <p className="mt-2 text-muted-foreground">
                    Aerobic occurs in mitochondria in presence of oxygen producing 36-38 ATP. Anaerobic occurs in cytoplasm without oxygen producing 2 ATP.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-3 shadow-xs">
                  <span className="font-semibold text-foreground">
                    Q2. (2 Marks) What is the role of hydrochloric acid (HCl) in human stomach?
                  </span>
                  <p className="mt-2 text-muted-foreground">
                    Creates an acidic medium for pepsin activation and kills ingested bacteria.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "flashcards" && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div className="w-full max-w-sm rounded-xl border-2 border-primary/20 bg-card p-6 shadow-xs">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Active Recall Card #1
                  </span>
                  <p className="mt-2 font-semibold text-sm text-foreground">
                    What are the basic filtration units in kidneys?
                  </p>
                  <div className="mt-4 rounded-lg bg-brand-soft/30 p-2 text-xs font-semibold text-primary">
                    Nephrons (Bowman&apos;s Capsule + Glomerulus)
                  </div>
                </div>
              </div>
            )}

            {activeTab === "quiz" && (
              <div className="flex flex-col gap-3 text-xs">
                <span className="text-muted-foreground font-mono">
                  Quick Diagnostic Quiz · Question 1/5
                </span>
                <p className="font-semibold text-foreground text-sm">
                  The enzyme responsible for digesting proteins in gastric juice is:
                </p>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="rounded-lg border p-2 text-muted-foreground">A) Amylase</div>
                  <div className="rounded-lg border-2 border-primary bg-brand-soft/40 p-2 font-semibold text-primary">
                    B) Pepsin ✓
                  </div>
                  <div className="rounded-lg border p-2 text-muted-foreground">C) Trypsin</div>
                  <div className="rounded-lg border p-2 text-muted-foreground">D) Lipase</div>
                </div>
              </div>
            )}

            {activeTab === "ai-talk" && (
              <div className="flex flex-col gap-2.5 text-xs">
                <div className="rounded-xl bg-muted/60 p-3 text-foreground self-start max-w-[85%]">
                  <p className="font-semibold text-primary text-[10px]">AI Teacher</p>
                  <p className="mt-1">
                    Namaste! Life Processes covers 4 key mechanisms: Nutrition, Respiration, Transport, and Excretion. Which one would you like me to quiz you on?
                  </p>
                </div>
                <div className="rounded-xl bg-primary text-primary-foreground p-3 self-end max-w-[80%]">
                  <p className="font-semibold text-[10px] opacity-80">You</p>
                  <p className="mt-1">Explain nephron filtration simply in Hindi and English.</p>
                </div>
              </div>
            )}
          </div>

          {/* Floating Pill Bottom Navigation matching the reference sketch! */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
            <div className="flex items-center gap-1 rounded-2xl border border-border/90 bg-background/95 p-1 shadow-lg backdrop-blur-md">
              {(
                [
                  { id: "notes", label: "Notes", icon: BookOpen },
                  { id: "questions", label: "Questions", icon: HelpCircle },
                  { id: "flashcards", label: "Flashcards", icon: Layers },
                  { id: "quiz", label: "Quiz", icon: CheckCircle2 },
                  { id: "ai-talk", label: "AI Talk", icon: Sparkles },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-medium transition-all ${
                      active
                        ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-3" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Launch CTA */}
      <div className="mt-4 flex flex-col items-center justify-between gap-3 px-2 sm:flex-row">
        <p className="text-xs text-muted-foreground text-center sm:text-left">
          Click the bottom navigation tabs above to preview NoteMint&apos;s study tools.
        </p>
        <Button size="sm" asChild className="gap-1.5 shadow-xs">
          <Link href="/dashboard/study/life-processes">
            <span>Open Full Life Processes Workspace</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

