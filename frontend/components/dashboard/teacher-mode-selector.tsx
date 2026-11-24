"use client";

import { useState } from "react";
import { Check, ChevronDown, Globe, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ExplanationDepth,
  PreferredLanguage,
  TeachingMode,
} from "@/lib/api";

interface TeacherModeSelectorProps {
  mode: TeachingMode;
  depth: ExplanationDepth;
  language: PreferredLanguage;
  onUpdateSettings: (settings: {
    teaching_mode?: TeachingMode;
    explanation_depth?: ExplanationDepth;
    preferred_language?: PreferredLanguage;
  }) => void;
  disabled?: boolean;
}

export function TeacherModeSelector({
  mode,
  depth,
  language,
  onUpdateSettings,
  disabled = false,
}: TeacherModeSelectorProps) {
  const [open, setOpen] = useState(false);

  const modeLabels: Record<TeachingMode, { name: string; desc: string }> = {
    explain: {
      name: "Explain",
      desc: "Comprehensive academic explanations and clear concept breakdowns.",
    },
    simplify: {
      name: "Simplify",
      desc: "Plain language, shorter sentences, and beginner analogies.",
    },
    socratic: {
      name: "Socratic",
      desc: "Guides with thoughtful questions and hints rather than direct answers.",
    },
  };

  const depthLabels: Record<ExplanationDepth, { name: string; desc: string }> = {
    quick: { name: "Quick", desc: "Concise summary of essential points" },
    standard: { name: "Standard", desc: "Balanced explanation with core details" },
    detailed: { name: "Detailed", desc: "Deep step-by-step reasoning with examples" },
  };

  const languageLabels: Record<PreferredLanguage, string> = {
    auto: "Auto Detect",
    en: "English",
    hi: "Hindi (हिंदी)",
    hinglish: "Hinglish",
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 gap-1.5 px-2.5 text-xs font-medium rounded-lg border-border/80 hover:bg-muted/60"
        >
          <SlidersHorizontal className="size-3.5 text-muted-foreground" />
          <span className="capitalize">{modeLabels[mode]?.name ?? "Explain"}</span>
          <span className="text-muted-foreground/60 hidden sm:inline">·</span>
          <span className="capitalize hidden sm:inline">{depthLabels[depth]?.name ?? "Standard"}</span>
          <span className="text-muted-foreground/60 hidden sm:inline">·</span>
          <span className="hidden sm:inline">{languageLabels[language] ?? "Auto"}</span>
          <ChevronDown className="size-3 text-muted-foreground opacity-60 ml-0.5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] sm:max-w-md max-h-[85dvh] overflow-y-auto p-4 sm:p-5">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span>AI Teacher Controls</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Customize how your tutor teaches, answer length, and language preference.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* 1. Teaching Mode */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-2">
              Teaching Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.keys(modeLabels) as TeachingMode[]).map((m) => {
                const isSelected = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      onUpdateSettings({ teaching_mode: m });
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-brand-soft/40 text-foreground ring-1 ring-primary"
                        : "border-border/70 hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold text-xs text-foreground mb-1">
                      <span>{modeLabels[m].name}</span>
                      {isSelected && <Check className="size-3.5 text-primary" />}
                    </div>
                    <p className="text-[11px] leading-tight text-muted-foreground line-clamp-2">
                      {modeLabels[m].desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Explanation Depth */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-2">
              Explanation Depth
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(depthLabels) as ExplanationDepth[]).map((d) => {
                const isSelected = depth === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      onUpdateSettings({ explanation_depth: d });
                    }}
                    className={`py-2 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-brand-soft/40 font-semibold text-primary"
                        : "border-border/70 hover:bg-muted/40 text-xs text-muted-foreground"
                    }`}
                  >
                    <span className="text-xs">{depthLabels[d].name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Preferred Language */}
          <div>
            <label className="text-xs font-semibold text-foreground flex items-center gap-1 mb-2">
              <Globe className="size-3.5 text-muted-foreground" />
              <span>Preferred Language</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(languageLabels) as PreferredLanguage[]).map((lang) => {
                const isSelected = language === lang;
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => {
                      onUpdateSettings({ preferred_language: lang });
                    }}
                    className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-brand-soft/40 font-semibold text-primary text-xs"
                        : "border-border/70 hover:bg-muted/40 text-xs text-muted-foreground"
                    }`}
                  >
                    <span>{languageLabels[lang]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button
            size="sm"
            onClick={() => setOpen(false)}
            className="h-8 px-4 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg cursor-pointer"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

