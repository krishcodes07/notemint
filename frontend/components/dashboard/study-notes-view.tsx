"use client";

import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  FileText,
  ListOrdered,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  NotesContent,
  StudyResourceResponse,
  SummaryContent,
} from "@/lib/api";

interface StudyNotesViewProps {
  notesResource: StudyResourceResponse | null;
  summaryResource: StudyResourceResponse | null;
  isRegenerating: boolean;
  onRegenerate: (type: "notes" | "summary") => void;
  onOpenGenerateDialog: () => void;
}

export function StudyNotesView({
  notesResource,
  summaryResource,
  isRegenerating,
  onRegenerate,
  onOpenGenerateDialog,
}: StudyNotesViewProps) {
  const [viewMode, setViewMode] = useState<"notes" | "summary">("notes");

  const notesData: NotesContent | null =
    (notesResource?.content as unknown as NotesContent) || null;
  const summaryData: SummaryContent | null =
    (summaryResource?.content as unknown as SummaryContent) || null;

  if (!notesResource && !summaryResource) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-primary">
          <BookOpen className="size-7" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-foreground">
          No Smart Notes Generated Yet
        </h3>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
          Transform this extracted PDF into topic-by-topic study notes, key terms definitions, and revision takeaways.
        </p>
        <Button onClick={onOpenGenerateDialog} className="mt-6 gap-2">
          <Sparkles className="size-4" />
          <span>Generate Study Materials</span>
        </Button>
      </div>
    );
  }

  return (
    <article className="mx-auto w-full max-w-3xl pb-28 pt-4 text-foreground">
      {/* Top Toggle & Controls */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        {/* Toggle between Detailed Notes & Summary */}
        <div className="inline-flex rounded-xl border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setViewMode("notes")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === "notes"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookOpen className="size-3.5 text-primary" />
            <span>Smart Notes</span>
            {notesResource?.status === "completed" && (
              <span className="size-1.5 rounded-full bg-primary" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setViewMode("summary")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === "summary"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="size-3.5 text-amber-500" />
            <span>Chapter Summary</span>
            {summaryResource?.status === "completed" && (
              <span className="size-1.5 rounded-full bg-amber-500" />
            )}
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRegenerate(viewMode)}
            disabled={isRegenerating}
            className="h-8 gap-1.5 text-xs"
          >
            {isRegenerating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span>Regenerate {viewMode === "notes" ? "Notes" : "Summary"}</span>
          </Button>
        </div>
      </div>

      {/* 1. DETAILED SMART NOTES VIEW */}
      {viewMode === "notes" && (
        <div className="flex flex-col gap-8">
          {notesResource?.status === "generating" && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-600 dark:text-amber-400">
              <Loader2 className="size-4 animate-spin shrink-0" />
              <span>Generating fresh version of Smart Notes with Kilo Gateway...</span>
            </div>
          )}

          {notesData ? (
            <>
              {/* Header Overview Card */}
              <div className="rounded-2xl border bg-card/60 p-6 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                    <BookOpen className="size-3.5" />
                    <span>Study Notes · v{notesResource?.version || 1}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                    {notesResource?.model_name || "kilo-auto/free"}
                  </Badge>
                </div>
                <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {notesData.title}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {notesData.overview}
                </p>
              </div>

              {/* Note Sections */}
              <div className="flex flex-col gap-6">
                {notesData.sections.map((section, idx) => (
                  <section
                    key={idx}
                    className="flex flex-col gap-4 rounded-2xl border bg-card/40 p-6 shadow-xs transition-colors hover:bg-card/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                        {section.heading}
                      </h2>
                      {section.source_pages && section.source_pages.length > 0 && (
                        <div className="flex items-center gap-1 shrink-0">
                          {section.source_pages.map((p) => (
                            <Badge
                              key={p}
                              variant="secondary"
                              className="text-[10px] font-mono font-medium"
                            >
                              Page {p}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="text-sm leading-relaxed text-foreground/90">
                      {section.content}
                    </p>

                    {section.key_points && section.key_points.length > 0 && (
                      <div className="mt-1 rounded-xl border border-primary/15 bg-brand-soft/20 p-4">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider">
                          <CheckCircle2 className="size-3.5" />
                          <span>Key Revision Points</span>
                        </div>
                        <ul className="mt-2.5 flex flex-col gap-2">
                          {section.key_points.map((point, pIdx) => (
                            <li
                              key={pIdx}
                              className="flex items-start gap-2 text-xs leading-relaxed text-foreground/90"
                            >
                              <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                ))}
              </div>

              {/* Key Terms & Definitions */}
              {notesData.key_terms && notesData.key_terms.length > 0 && (
                <section className="rounded-2xl border bg-muted/25 p-6 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                    <ListOrdered className="size-4" />
                    <span>Essential Terminology & Definitions</span>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {notesData.key_terms.map((term, tIdx) => (
                      <div
                        key={tIdx}
                        className="rounded-xl border bg-card/70 p-4 transition-colors hover:bg-card"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-sm text-foreground">
                            {term.term}
                          </h4>
                          {term.source_pages && term.source_pages.length > 0 && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              p.{term.source_pages.join(", ")}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                          {term.definition}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
              Notes are currently not available. Click &ldquo;Regenerate Notes&rdquo; to synthesize.
            </div>
          )}
        </div>
      )}

      {/* 2. CHAPTER SUMMARY VIEW */}
      {viewMode === "summary" && (
        <div className="flex flex-col gap-8">
          {summaryResource?.status === "generating" && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-600 dark:text-amber-400">
              <Loader2 className="size-4 animate-spin shrink-0" />
              <span>Generating Chapter Summary with Kilo Gateway...</span>
            </div>
          )}

          {summaryData ? (
            <>
              {/* Summary Overview */}
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    <Sparkles className="size-3.5" />
                    <span>Chapter Summary · v{summaryResource?.version || 1}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {summaryResource?.model_name || "kilo-auto/free"}
                  </Badge>
                </div>
                <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {summaryData.title}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                  {summaryData.overview}
                </p>
              </div>

              {/* 60-Second Rapid Revision Callout */}
              {summaryData.revision_summary && (
                <div className="rounded-2xl border border-primary/25 bg-brand-soft/20 p-6">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                    <FileText className="size-3.5" />
                    <span>60-Second Rapid Revision</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-foreground font-medium">
                    {summaryData.revision_summary}
                  </p>
                </div>
              )}

              {/* Key Takeaways */}
              {summaryData.key_takeaways && summaryData.key_takeaways.length > 0 && (
                <div className="rounded-2xl border bg-card/60 p-6 shadow-xs">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-foreground">
                    Core Learning Takeaways
                  </h3>
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {summaryData.key_takeaways.map((takeaway, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-xs leading-relaxed text-foreground/90"
                      >
                        <CheckCircle2 className="size-3.5 text-primary mt-0.5 shrink-0" />
                        <span>{takeaway}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Main Topics Breakdown */}
              <div className="flex flex-col gap-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Major Topic Summaries
                </h3>
                {summaryData.main_topics.map((t, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border bg-card/40 p-5 shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-foreground text-base">
                        {t.topic}
                      </h4>
                      {t.source_pages && t.source_pages.length > 0 && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Page {t.source_pages.join(", ")}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {t.summary}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
              Chapter Summary is not generated yet.
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRegenerate("summary")}
                className="mt-3 gap-1.5"
              >
                <Sparkles className="size-3.5" />
                <span>Generate Summary</span>
              </Button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
