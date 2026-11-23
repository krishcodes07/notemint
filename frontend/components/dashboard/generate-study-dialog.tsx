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
  onGenerationStarted: (selectedTypes: StudyResourceType[]) => void;
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
      onGenerationStarted(selectedTypes);
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
      <DialogContent className="max-w-xl sm:rounded-2xl p-6">
        <DialogHeader className="gap-1.5">
          <div className="flex items-center gap-2.5 text-primary">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              Generate Study Materials
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed pt-1">
            Choose the study resources you want to create from{" "}
            <strong className="font-semibold text-foreground">{documentTitle}</strong>.
            Everything is grounded directly in your syllabus text.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between border-b pb-3 pt-2 text-sm">
          <span className="font-medium text-foreground">
            Select resources to generate:
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSelectAll}
            className="h-8 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary"
          >
            {selectedTypes.length === RESOURCE_OPTIONS.length
              ? "Deselect All"
              : "Select All"}
          </Button>
        </div>

        <div className="flex flex-col gap-3 py-2 max-h-[55vh] overflow-y-auto pr-1">
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
                className={`group flex cursor-pointer items-start gap-3.5 rounded-2xl border p-4 transition-all duration-200 ${
                  isSelected
                    ? "border-primary/50 bg-primary/5 dark:bg-primary/10 shadow-xs"
                    : "border-border/70 hover:border-border hover:bg-muted/40"
                } ${isGenerating ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <div
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30 bg-background group-hover:border-primary/50"
                  }`}
                >
                  {isSelected && <CheckCircle2 className="size-3.5" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-semibold text-base text-foreground">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </div>
                      <span>{opt.title}</span>
                    </div>

                    {isCompleted && (
                      <Badge variant="outline" className="text-xs font-medium text-primary border-primary/30 bg-primary/5">
                        Ready
                      </Badge>
                    )}
                    {isGenerating && (
                      <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-xs">
                        <Loader2 className="mr-1.5 size-3 animate-spin" />
                        Generating
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                    {opt.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-xl border border-destructive/20">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t mt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={selectedTypes.length === 0 || isSubmitting}
            className="gap-2 rounded-xl"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Preparing Materials...</span>
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                <span>Generate Materials ({selectedTypes.length})</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
