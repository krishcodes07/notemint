"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileQuestion,
  HelpCircle,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  QuestionItem,
  QuestionsContent,
  StudyResourceResponse,
} from "@/lib/api";

interface StudyQuestionsViewProps {
  questionsResource: StudyResourceResponse | null;
  isRegenerating: boolean;
  onRegenerate: () => void;
  onOpenGenerateDialog: () => void;
}

export function StudyQuestionsView({
  questionsResource,
  isRegenerating,
  onRegenerate,
  onOpenGenerateDialog,
}: StudyQuestionsViewProps) {
  // State tracking which questions are expanded
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleExpandAll = () => {
    if (!questionsData) return;
    const allExpanded = questionsData.questions.every((q) => expandedIds[q.id]);
    const newState: Record<string, boolean> = {};
    for (const q of questionsData.questions) {
      newState[q.id] = !allExpanded;
    }
    setExpandedIds(newState);
  };

  const questionsData: QuestionsContent | null =
    (questionsResource?.content as unknown as QuestionsContent) || null;

  if (!questionsResource) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-primary">
          <HelpCircle className="size-7" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-foreground">
          No Important Questions Generated Yet
        </h3>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
          Synthesize high-yield CBSE & conceptual exam questions with model answers and scoring points directly from your uploaded PDF.
        </p>
        <Button onClick={onOpenGenerateDialog} className="mt-6 gap-2">
          <Sparkles className="size-4" />
          <span>Generate Study Materials</span>
        </Button>
      </div>
    );
  }

  const allAreExpanded =
    questionsData?.questions &&
    questionsData.questions.length > 0 &&
    questionsData.questions.every((q) => expandedIds[q.id]);

  return (
    <article className="mx-auto w-full max-w-3xl pb-28 pt-4 text-foreground">
      {/* Top Header & Controls */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <FileQuestion className="size-3.5" />
            <span>Important Questions · v{questionsResource.version}</span>
          </div>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {questionsData?.title || "Important Questions & Answers"}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExpandAll}
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            {allAreExpanded ? "Collapse All" : "Reveal All Answers"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="h-8 gap-1.5 text-xs"
          >
            {isRegenerating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span>Regenerate</span>
          </Button>
        </div>
      </div>

      {questionsResource.status === "generating" && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-600 dark:text-amber-400">
          <Loader2 className="size-4 animate-spin shrink-0" />
          <span>Synthesizing fresh questions with Kilo Gateway...</span>
        </div>
      )}

      {/* Questions List */}
      {questionsData ? (
        <div className="flex flex-col gap-4">
          {questionsData.questions.map((q: QuestionItem, idx: number) => {
            const isExpanded = !!expandedIds[q.id];
            return (
              <div
                key={q.id || idx}
                className="overflow-hidden rounded-2xl border bg-card/50 shadow-xs transition-colors hover:bg-card/80"
              >
                {/* Question Row */}
                <div
                  onClick={() => toggleExpand(q.id)}
                  className="flex cursor-pointer items-start justify-between gap-4 p-5"
                >
                  <div className="flex items-start gap-3.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/60 font-mono text-xs font-bold text-foreground">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground text-sm sm:text-base leading-snug">
                        {q.question}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="capitalize text-[10px] font-medium"
                        >
                          {q.answer_type.replace("_", " ")}
                        </Badge>
                        <Badge
                          className={`text-[10px] capitalize ${
                            q.difficulty === "easy"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : q.difficulty === "medium"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                              : "bg-destructive/10 text-destructive border border-destructive/20"
                          }`}
                        >
                          {q.difficulty}
                        </Badge>
                        {q.source_pages && q.source_pages.length > 0 && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            Page {q.source_pages.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 shrink-0 p-0 text-muted-foreground"
                  >
                    {isExpanded ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </Button>
                </div>

                {/* Collapsible Answer */}
                {isExpanded && (
                  <div className="border-t bg-muted/20 p-5">
                    <div className="text-xs font-bold uppercase tracking-wider text-primary">
                      Model Answer
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-foreground">
                      {q.answer}
                    </p>

                    {q.important_points && q.important_points.length > 0 && (
                      <div className="mt-3.5 rounded-xl border border-primary/15 bg-card/60 p-3.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Key Scoring Points:
                        </span>
                        <ul className="mt-1.5 flex flex-col gap-1">
                          {q.important_points.map((pt, pIdx) => (
                            <li
                              key={pIdx}
                              className="flex items-start gap-1.5 text-xs text-foreground/90"
                            >
                              <span className="text-primary">•</span>
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
          Questions are not available. Click &ldquo;Regenerate&rdquo; to generate.
        </div>
      )}
    </article>
  );
}
