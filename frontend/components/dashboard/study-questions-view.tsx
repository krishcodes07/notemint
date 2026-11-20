"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  FileQuestion,
  Filter,
  HelpCircle,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  QuestionBookmarkResponse,
  QuestionItem,
  QuestionsContent,
  StudyResourceResponse,
  createQuestionBookmark,
  deleteQuestionBookmark,
  getQuestionBookmarks,
} from "@/lib/api";

interface StudyQuestionsViewProps {
  documentId: string;
  questionsResource: StudyResourceResponse | null;
  getToken: () => Promise<string | null>;
  isRegenerating: boolean;
  onRegenerate: () => void;
  onOpenGenerateDialog: () => void;
  onProgressUpdated?: () => void;
}

export function StudyQuestionsView({
  documentId,
  questionsResource,
  getToken,
  isRegenerating,
  onRegenerate,
  onOpenGenerateDialog,
  onProgressUpdated,
}: StudyQuestionsViewProps) {
  // State tracking expanded questions
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  // Bookmarks state: map question_id -> bookmark object
  const [bookmarksMap, setBookmarksMap] = useState<Record<string, QuestionBookmarkResponse>>({});
  const [, setLoadingBookmarks] = useState(false);
  const [togglingBookmarkId, setTogglingBookmarkId] = useState<string | null>(null);

  // Filters
  const [bookmarkOnlyFilter, setBookmarkOnlyFilter] = useState(false);
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const questionsData: QuestionsContent | null =
    (questionsResource?.content as unknown as QuestionsContent) || null;
  const rawQuestions: QuestionItem[] = questionsData?.questions || [];

  // Load bookmarks for this questions resource
  useEffect(() => {
    let isCancelled = false;
    async function loadBookmarks() {
      if (!questionsResource?.id) return;
      setLoadingBookmarks(true);
      try {
        const list = await getQuestionBookmarks(
          documentId,
          getToken,
          questionsResource.id
        );
        if (!isCancelled) {
          const map: Record<string, QuestionBookmarkResponse> = {};
          for (const b of list) {
            map[b.question_id] = b;
          }
          setBookmarksMap(map);
        }
      } catch {
        // Silently preserve empty bookmarks on error
      } finally {
        if (!isCancelled) setLoadingBookmarks(false);
      }
    }

    loadBookmarks();
    return () => {
      isCancelled = true;
    };
  }, [documentId, questionsResource?.id, getToken]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleExpandAll = () => {
    if (!questionsData) return;
    const allExpanded = filteredQuestions.every((q) => expandedIds[q.id]);
    const newState: Record<string, boolean> = { ...expandedIds };
    for (const q of filteredQuestions) {
      newState[q.id] = !allExpanded;
    }
    setExpandedIds(newState);
  };

  // Toggle bookmark
  const handleToggleBookmark = useCallback(
    async (qId: string) => {
      if (!questionsResource) return;
      const existingBookmark = bookmarksMap[qId];
      setTogglingBookmarkId(qId);

      if (existingBookmark) {
        // Optimistic remove
        setBookmarksMap((prev) => {
          const next = { ...prev };
          delete next[qId];
          return next;
        });

        try {
          await deleteQuestionBookmark(documentId, existingBookmark.id, getToken);
          if (onProgressUpdated) onProgressUpdated();
        } catch {
          // Revert
          setBookmarksMap((prev) => ({ ...prev, [qId]: existingBookmark }));
        } finally {
          setTogglingBookmarkId(null);
        }
      } else {
        // Optimistic add
        const tempBookmark: QuestionBookmarkResponse = {
          id: `temp-${qId}`,
          clerk_user_id: "",
          document_id: documentId,
          resource_id: questionsResource.id,
          question_id: qId,
          created_at: new Date().toISOString(),
        };

        setBookmarksMap((prev) => ({ ...prev, [qId]: tempBookmark }));

        try {
          const created = await createQuestionBookmark(
            documentId,
            questionsResource.id,
            qId,
            getToken
          );
          setBookmarksMap((prev) => ({ ...prev, [qId]: created }));
          if (onProgressUpdated) onProgressUpdated();
        } catch {
          // Revert
          setBookmarksMap((prev) => {
            const next = { ...prev };
            delete next[qId];
            return next;
          });
        } finally {
          setTogglingBookmarkId(null);
        }
      }
    },
    [bookmarksMap, documentId, questionsResource, getToken, onProgressUpdated]
  );

  // Filter questions
  const filteredQuestions = rawQuestions.filter((q) => {
    if (bookmarkOnlyFilter && !bookmarksMap[q.id]) {
      return false;
    }
    if (difficultyFilter !== "all" && q.difficulty !== difficultyFilter) {
      return false;
    }
    if (typeFilter !== "all" && q.answer_type !== typeFilter) {
      return false;
    }
    return true;
  });

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
          Synthesize high-yield exam questions with model answers, bookmarks, and scoring points directly from your uploaded PDF.
        </p>
        <Button onClick={onOpenGenerateDialog} className="mt-6 gap-2">
          <Sparkles className="size-4" />
          <span>Generate Study Materials</span>
        </Button>
      </div>
    );
  }

  const allAreExpanded =
    filteredQuestions.length > 0 &&
    filteredQuestions.every((q) => expandedIds[q.id]);

  const bookmarkedTotal = Object.keys(bookmarksMap).length;

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

      {/* Filter Ribbon */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/60 p-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pr-2">
            <Filter className="size-3.5 text-primary" />
            <span className="font-semibold text-foreground">Filters:</span>
          </div>

          {/* Bookmarks Toggle */}
          <button
            type="button"
            onClick={() => setBookmarkOnlyFilter((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              bookmarkOnlyFilter
                ? "border-primary bg-primary text-primary-foreground font-semibold shadow-2xs"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bookmark className="size-3.5" />
            <span>Bookmarked ({bookmarkedTotal})</span>
          </button>

          {/* Difficulty Filter */}
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
            {["all", "easy", "medium", "hard"].map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => setDifficultyFilter(diff)}
                className={`rounded-md px-2 py-0.5 capitalize transition-colors ${
                  difficultyFilter === diff
                    ? "bg-background text-foreground font-medium shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {diff}
              </button>
            ))}
          </div>

          {/* Answer Type Filter */}
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
            {[
              { id: "all", label: "All types" },
              { id: "very_short", label: "Very short" },
              { id: "short", label: "Short" },
              { id: "long", label: "Long" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeFilter(t.id)}
                className={`rounded-md px-2 py-0.5 transition-colors ${
                  typeFilter === t.id
                    ? "bg-background text-foreground font-medium shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <span className="text-xs text-muted-foreground">
          Showing {filteredQuestions.length} of {rawQuestions.length}
        </span>
      </div>

      {/* Questions List */}
      {filteredQuestions.length > 0 ? (
        <div className="flex flex-col gap-4">
          {filteredQuestions.map((q: QuestionItem, idx: number) => {
            const isExpanded = !!expandedIds[q.id];
            const isBookmarked = !!bookmarksMap[q.id];
            const isToggling = togglingBookmarkId === q.id;

            return (
              <div
                key={q.id || idx}
                className={`overflow-hidden rounded-2xl border transition-colors ${
                  isBookmarked
                    ? "border-primary/40 bg-card/90 shadow-xs"
                    : "border-border/80 bg-card/50 hover:bg-card/80"
                }`}
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

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Bookmark Toggle Button */}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleBookmark(q.id);
                      }}
                      disabled={isToggling}
                      title={isBookmarked ? "Remove Bookmark" : "Bookmark Question"}
                      className={`size-8 transition-colors ${
                        isBookmarked
                          ? "text-primary hover:text-primary/80"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      aria-label={isBookmarked ? "Bookmarked" : "Not bookmarked"}
                    >
                      {isBookmarked ? (
                        <BookmarkCheck className="size-4 fill-primary" />
                      ) : (
                        <Bookmark className="size-4" />
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-8 p-0 text-muted-foreground"
                    >
                      {isExpanded ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </Button>
                  </div>
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
          {bookmarkOnlyFilter
            ? "No bookmarked questions yet. Click the bookmark icon on any question to save it for revision."
            : "No questions match the current filter selection."}
        </div>
      )}
    </article>
  );
}
