"use client";

import { useEffect, useState } from "react";
import {
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
import { Input } from "@/components/ui/input";
import {
  GenerationDifficulty,
  StudyGenerationBatchResponse,
  generateMoreStudyItems,
  getAvailableTopics,
} from "@/lib/api";
import { cn } from "@/lib/utils";

interface GenerateMoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  resourceType: "questions" | "flashcards" | "quiz";
  getToken: () => Promise<string | null>;
  onBatchCreated: (batch: StudyGenerationBatchResponse) => void;
  availableTopics?: string[];
}

const QUANTITY_OPTIONS = [5, 10, 15, 20, 30] as const;

const DIFFICULTY_CONFIG: Array<{
  id: GenerationDifficulty;
  title: string;
  description: string;
  badge: string;
}> = [
  {
    id: "random",
    title: "Random / Mixed",
    description: "Balanced mix of easy, medium, and hard items across the material.",
    badge: "Balanced",
  },
  {
    id: "easy",
    title: "Easy",
    description: "Definitions, fundamental terminology, and direct factual recall.",
    badge: "Recall",
  },
  {
    id: "medium",
    title: "Medium",
    description: "Conceptual mechanisms, relationships, and applied understanding.",
    badge: "Conceptual",
  },
  {
    id: "hard",
    title: "Hard",
    description: "Multi-step reasoning, comparative analysis, and advanced scenarios.",
    badge: "Advanced",
  },
];

export function GenerateMoreDialog({
  open,
  onOpenChange,
  documentId,
  resourceType,
  getToken,
  onBatchCreated,
  availableTopics: initialTopics = [],
}: GenerateMoreDialogProps) {
  const [difficulty, setDifficulty] = useState<GenerationDifficulty>("random");
  const [count, setCount] = useState<number>(10);
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [customTopic, setCustomTopic] = useState<string>("");
  const [isCustomTopic, setIsCustomTopic] = useState(false);
  const [topics, setTopics] = useState<string[]>(initialTopics);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available topics on open if not already provided
  useEffect(() => {
    let isCancelled = false;
    async function loadTopics() {
      if (!open || topics.length > 0) return;
      try {
        const res = await getAvailableTopics(documentId, getToken);
        if (!isCancelled && res.topics.length > 0) {
          setTopics(res.topics);
        }
      } catch {
        // Silently fall back to empty topics
      }
    }
    loadTopics();
    return () => {
      isCancelled = true;
    };
  }, [open, documentId, getToken, topics.length]);

  const resourceTitle =
    resourceType === "questions"
      ? "Important Questions"
      : resourceType === "flashcards"
      ? "Flashcards"
      : "Quiz Questions";

  const IconComponent =
    resourceType === "questions"
      ? FileQuestion
      : resourceType === "flashcards"
      ? Layers
      : Zap;

  const handleGenerate = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const topicValue = isCustomTopic
        ? (customTopic.trim() || null)
        : (selectedTopic.trim() || null);

      const batch = await generateMoreStudyItems(
        documentId,
        {
          resource_type: resourceType,
          difficulty,
          count,
          topic: topicValue,
        },
        getToken
      );

      onBatchCreated(batch);
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to initiate generation. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg sm:rounded-2xl p-6">
        <DialogHeader className="gap-1.5">
          <div className="flex items-center gap-2.5 text-primary">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <IconComponent className="size-5" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              Generate More {resourceTitle}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed pt-1">
            Synthesize new, syllabus-grounded practice material without losing your existing progress or bookmarks.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-5 py-2 text-sm">
          {/* 1. Difficulty Selection */}
          <div>
            <label className="mb-2 block font-semibold text-foreground text-sm">
              Difficulty Tier
            </label>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {DIFFICULTY_CONFIG.map((opt) => {
                const isSelected = difficulty === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDifficulty(opt.id)}
                    className={cn(
                      "flex flex-col items-start rounded-2xl border p-3.5 text-left transition-all cursor-pointer",
                      isSelected
                        ? "border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary/40 text-foreground"
                        : "border-border/70 bg-card/50 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-semibold text-foreground text-sm">
                        {opt.title}
                      </span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {opt.badge}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {opt.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Number of Items */}
          <div>
            <label className="mb-2 block font-semibold text-foreground text-sm">
              Number of Items to Generate
            </label>
            <div className="flex items-center gap-2">
              {QUANTITY_OPTIONS.map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setCount(num)}
                  className={cn(
                    "flex-1 rounded-xl border h-10 text-center text-sm font-semibold transition-all cursor-pointer",
                    count === num
                      ? "border-primary bg-primary text-primary-foreground shadow-xs"
                      : "border-border/70 bg-card hover:bg-muted text-muted-foreground"
                  )}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Optional Focus Topic */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block font-semibold text-foreground text-sm">
                Focus Topic (Optional)
              </label>
              {topics.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomTopic((prev) => !prev);
                    setSelectedTopic("");
                    setCustomTopic("");
                  }}
                  className="text-xs font-medium text-primary hover:underline cursor-pointer"
                >
                  {isCustomTopic ? "Select from chapter topics" : "Custom topic"}
                </button>
              )}
            </div>

            {isCustomTopic || topics.length === 0 ? (
              <Input
                type="text"
                placeholder="e.g. Cellular Respiration, Calvin Cycle, Osmosis"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                className="h-10 rounded-xl text-sm"
                maxLength={256}
              />
            ) : (
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-hidden focus:ring-1 focus:ring-primary"
              >
                <option value="">Entire Chapter / Document (Broad coverage)</option>
                {topics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              Leave blank to cover concepts evenly across the entire chapter.
            </p>
          </div>
        </div>

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
            disabled={isSubmitting}
            className="gap-2 rounded-xl font-semibold"
          >
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            <span>Generate {count} More</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

