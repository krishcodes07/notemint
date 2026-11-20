"use client";

import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  FileQuestion,
  Layers,
  Loader2,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  DocumentGenerationStatusResponse,
  StudyResourceType,
  generateStudyResources,
} from "@/lib/api";

interface GenerateStudyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
  generationStatus: DocumentGenerationStatusResponse | null;
  getToken: () => Promise<string | null>;
  onGenerationStarted: () => void;
}

const RESOURCE_OPTIONS: Array<{
  id: StudyResourceType;
  title: string;
  description: string;
  icon: typeof BookOpen;
}> = [
  {
    id: "notes",
    title: "Smart Study Notes",
    description: "Structured conceptual sections, key revision points, and terminology with page citations.",
    icon: BookOpen,
  },
  {
    id: "questions",
    title: "Important Questions & Answers",
    description: "Short, conceptual, and long-answer exam questions with model answers and scoring criteria.",
    icon: FileQuestion,
  },
  {
    id: "flashcards",
    title: "Active-Recall Flashcards",
    description: "Interactive double-sided cards designed for spaced repetition and rapid memory recall.",
    icon: Layers,
  },
  {
    id: "quiz",
    title: "Diagnostic MCQ Quiz",
    description: "4-option multiple-choice questions with plausible distractors and server-graded explanations.",
    icon: Zap,
  },
  {
    id: "summary",
    title: "Chapter Summary",
    description: "High-yield core takeaway summary and a 60-second rapid revision paragraph.",
    icon: Sparkles,
  },
];

export function GenerateStudyDialog({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  generationStatus,
  getToken,
  onGenerationStarted,
}: GenerateStudyDialogProps) {
  const [selectedTypes, setSelectedTypes] = useState<StudyResourceType[]>([
    "notes",
    "questions",
    "flashcards",
    "quiz",
    "summary",
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleType = (type: StudyResourceType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSelectAll = () => {
    if (selectedTypes.length === RESOURCE_OPTIONS.length) {
      setSelectedTypes([]);
    } else {
      setSelectedTypes(RESOURCE_OPTIONS.map((r) => r.id));
    }
  };

  const handleGenerate = async () => {
    if (selectedTypes.length === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await generateStudyResources(documentId, selectedTypes, getToken);
      onGenerationStarted();
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to start AI generation. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-5" />
            <DialogTitle>Generate AI Study Materials</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Synthesize grounded, curriculum-aligned study resources from{" "}
            <strong className="text-foreground">{documentTitle}</strong> using Kilo Gateway AI.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between border-b pb-2 pt-1 text-xs">
          <span className="text-muted-foreground">
            Choose study resources to generate:
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSelectAll}
            className="h-7 text-xs text-primary hover:text-primary/80"
          >
            {selectedTypes.length === RESOURCE_OPTIONS.length
              ? "Deselect All"
              : "Select All"}
          </Button>
        </div>

        <div className="flex flex-col gap-2.5 py-2">
          {RESOURCE_OPTIONS.map((opt) => {
            const isSelected = selectedTypes.includes(opt.id);
            const statusItem = generationStatus?.resources[opt.id];
            const isGenerating = statusItem?.status === "generating";
            const isCompleted = statusItem?.status === "completed";
            const Icon = opt.icon;

            return (
              <div
                key={opt.id}
                onClick={() => !isGenerating && toggleType(opt.id)}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  isSelected
                    ? "border-primary/40 bg-brand-soft/20 dark:bg-brand-soft/10"
                    : "border-border hover:bg-muted/40"
                } ${isGenerating ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <div
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30 bg-background"
                  }`}
                >
                  {isSelected && <CheckCircle2 className="size-3.5" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-semibold text-sm text-foreground">
                      <Icon className="size-4 text-primary" />
                      <span>{opt.title}</span>
                    </div>

                    {isCompleted && (
                      <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                        Generated (v{statusItem.version})
                      </Badge>
                    )}
                    {isGenerating && (
                      <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[10px]">
                        <Loader2 className="mr-1 size-2.5 animate-spin" />
                        Generating
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {opt.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={selectedTypes.length === 0 || isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Enqueuing Jobs...</span>
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                <span>Generate ({selectedTypes.length})</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
