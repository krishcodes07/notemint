"use client";

import { useMemo, useState } from "react";
import {
  AlignLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  ListOrdered,
  Loader2,
  Maximize2,
  Minimize2,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  NotesContent,
  StudyResourceResponse,
  SummaryContent,
} from "@/lib/api";
import { FormattedMathText } from "@/components/ui/formatted-math-text";

interface StudyNotesViewProps {
  notesResource: StudyResourceResponse | null;
  summaryResource: StudyResourceResponse | null;
  isGenerating?: boolean;
  isRegenerating: boolean;
  onRegenerate: (type: "notes" | "summary") => void;
  onOpenGenerateDialog: () => void;
}

/** Helper component to format math/formulas with KaTeX and highlight search matches */
function HighlightText({ text, query }: { text: string; query: string }) {
  return <FormattedMathText text={text} query={query} />;
}

export function StudyNotesView({
  notesResource,
  summaryResource,
  isGenerating = false,
  isRegenerating,
  onRegenerate,
  onOpenGenerateDialog,
}: StudyNotesViewProps) {
  const [viewMode, setViewMode] = useState<"notes" | "summary">("notes");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Record<number, boolean>>({});

  const notesData: NotesContent | null =
    (notesResource?.content as unknown as NotesContent) || null;
  const summaryData: SummaryContent | null =
    (summaryResource?.content as unknown as SummaryContent) || null;

  const isNotesGenerating =
    isGenerating ||
    isRegenerating ||
    notesResource?.status === "generating" ||
    notesResource?.status === "pending";

  const isSummaryGenerating =
    isGenerating ||
    isRegenerating ||
    summaryResource?.status === "generating" ||
    summaryResource?.status === "pending";

  const toggleSection = (index: number) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleToggleAllSections = (collapse: boolean) => {
    if (!notesData) return;
    const map: Record<number, boolean> = {};
    notesData.sections.forEach((_, idx) => {
      map[idx] = collapse;
    });
    setCollapsedSections(map);
  };

  const handlePrint = () => {
    window.print();
  };

  // Filter sections by search query
  const filteredSections = useMemo(() => {
    if (!notesData) return [];
    if (!searchQuery.trim()) return notesData.sections;

    const q = searchQuery.toLowerCase().trim();
    return notesData.sections.filter((sec) => {
      if (sec.heading.toLowerCase().includes(q)) return true;
      if (sec.content.toLowerCase().includes(q)) return true;
      if (sec.key_points.some((pt) => pt.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [notesData, searchQuery]);

  // Filter key terms by search query
  const filteredKeyTerms = useMemo(() => {
    if (!notesData || !notesData.key_terms) return [];
    if (!searchQuery.trim()) return notesData.key_terms;

    const q = searchQuery.toLowerCase().trim();
    return notesData.key_terms.filter((term) => {
      if (term.term.toLowerCase().includes(q)) return true;
      if (term.definition.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [notesData, searchQuery]);

  if (!notesResource && !summaryResource && !isNotesGenerating && !isSummaryGenerating) {
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
    <article className="mx-auto w-full max-w-4xl pb-28 pt-4 text-foreground">
      {/* Top Toggle & Controls */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4 print:hidden">
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
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {viewMode === "notes" && (
            <>
              {/* Density toggle */}
              <div className="inline-flex rounded-lg border bg-muted/30 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setDensity("comfortable")}
                  title="Comfortable reading mode"
                  className={`rounded-md px-2 py-1 text-xs transition-colors ${
                    density === "comfortable"
                      ? "bg-background font-medium text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Comfortable
                </button>
                <button
                  type="button"
                  onClick={() => setDensity("compact")}
                  title="Compact reading mode"
                  className={`rounded-md px-2 py-1 text-xs transition-colors ${
                    density === "compact"
                      ? "bg-background font-medium text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Compact
                </button>
              </div>

              {/* Print Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-8 gap-1.5 text-xs"
                title="Print notes or save as PDF"
              >
                <Printer className="size-3.5" />
                <span className="hidden sm:inline">Print</span>
              </Button>
            </>
          )}

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
            <span className="hidden sm:inline">Regenerate {viewMode === "notes" ? "Notes" : "Summary"}</span>
            <span className="sm:hidden">Regenerate</span>
          </Button>
        </div>
      </div>

      {/* 1. DETAILED SMART NOTES VIEW */}
      {viewMode === "notes" && (
        <div className="flex flex-col gap-6">
          {notesData ? (
            <>
              {/* Header Overview Card */}
              <div className="rounded-2xl border bg-card/60 p-4 sm:p-8 shadow-xs">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BookOpen className="size-4" />
                  </div>
                  <span>Smart Study Notes</span>
                </div>
                <h1 className="mt-3 text-xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {notesData.title}
                </h1>
                <p className="mt-2.5 sm:mt-3 text-xs sm:text-base leading-relaxed text-foreground/80">
                  {notesData.overview}
                </p>

                {/* Table of Contents Pill Bar */}
                {notesData.sections.length > 0 && (
                  <div className="mt-5 sm:mt-6 border-t border-border/60 pt-4 print:hidden">
                    <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <AlignLeft className="size-3.5 text-primary" />
                      <span>Table of Contents</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {notesData.sections.map((sec, idx) => (
                        <a
                          key={idx}
                          href={`#section-${idx}`}
                          className="rounded-lg border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                        >
                          {sec.heading}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Search & Collapse Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 print:hidden">
                {/* Search in Notes input */}
                <div className="relative flex-1 min-w-[200px] sm:min-w-[240px] max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search headings, explanations, terms..."
                    className="h-9 w-full rounded-xl border bg-card/80 pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 sm:gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleAllSections(false)}
                    className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground px-2 sm:px-3"
                  >
                    <Maximize2 className="size-3" />
                    <span className="hidden sm:inline">Expand All</span>
                    <span className="sm:hidden">Expand</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleAllSections(true)}
                    className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground px-2 sm:px-3"
                  >
                    <Minimize2 className="size-3" />
                    <span className="hidden sm:inline">Collapse All</span>
                    <span className="sm:hidden">Collapse</span>
                  </Button>
                </div>
              </div>

              {/* Note Sections */}
              {filteredSections.length > 0 ? (
                <div className="flex flex-col gap-5">
                  {filteredSections.map((section, idx) => {
                    const isCollapsed = !!collapsedSections[idx];

                    return (
                      <section
                        key={idx}
                        id={`section-${idx}`}
                        className={`scroll-mt-20 flex flex-col rounded-2xl border bg-card/40 transition-colors hover:bg-card/70 ${
                          density === "compact" ? "p-4 gap-3" : "p-6 gap-4"
                        }`}
                      >
                        <div
                          onClick={() => toggleSection(idx)}
                          className="flex cursor-pointer items-start justify-between gap-2.5 sm:gap-3 select-none"
                        >
                          <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                            <span className="flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/60 font-mono text-xs font-bold text-foreground">
                              {idx + 1}
                            </span>
                            <h2 className="text-base sm:text-xl font-bold tracking-tight text-foreground leading-snug">
                              <HighlightText text={section.heading} query={searchQuery} />
                            </h2>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {section.source_pages && section.source_pages.length > 0 && (
                              <div className="flex items-center gap-1">
                                {section.source_pages.map((p) => (
                                  <Badge
                                    key={p}
                                    variant="secondary"
                                    className="text-xs font-medium px-2 py-0.5"
                                  >
                                    Page {p}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-8 p-0 text-muted-foreground hover:text-foreground"
                            >
                              {isCollapsed ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronUp className="size-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {!isCollapsed && (
                          <>
                            <p
                              className={`leading-relaxed text-foreground/90 ${
                                density === "compact" ? "text-sm" : "text-base"
                              }`}
                            >
                              <HighlightText text={section.content} query={searchQuery} />
                            </p>

                            {section.key_points && section.key_points.length > 0 && (
                              <div
                                className={`rounded-2xl border border-primary/20 bg-primary/5 dark:bg-primary/10 ${
                                  density === "compact" ? "p-4" : "p-5 sm:p-6"
                                }`}
                              >
                                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                                  <CheckCircle2 className="size-4" />
                                  <span>Key Revision Points</span>
                                </div>
                                <ul className="mt-3 flex flex-col gap-2.5">
                                  {section.key_points.map((point, pIdx) => (
                                    <li
                                      key={pIdx}
                                      className={`flex items-start gap-2.5 leading-relaxed text-foreground/90 ${
                                        density === "compact" ? "text-xs sm:text-sm" : "text-sm sm:text-base"
                                      }`}
                                    >
                                      <span className="size-2 rounded-full bg-primary mt-2 shrink-0" />
                                      <span>
                                        <HighlightText text={point} query={searchQuery} />
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </>
                        )}
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No note sections matched &ldquo;{searchQuery}&rdquo;. Try another term or clear the search.
                </div>
              )}

              {/* Key Terms & Definitions */}
              {filteredKeyTerms.length > 0 && (
                <section className="rounded-2xl border bg-muted/25 p-6 sm:p-8 shadow-xs">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <ListOrdered className="size-4" />
                    <span>Essential Terminology & Definitions</span>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    {filteredKeyTerms.map((term, tIdx) => (
                      <div
                        key={tIdx}
                        id={`term-${term.term}`}
                        className="rounded-xl border bg-card/70 p-4 sm:p-5 transition-colors hover:bg-card"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-base text-foreground">
                            <HighlightText text={term.term} query={searchQuery} />
                          </h4>
                          {term.source_pages && term.source_pages.length > 0 && (
                            <span className="text-xs font-mono text-muted-foreground">
                              p.{term.source_pages.join(", ")}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          <HighlightText text={term.definition} query={searchQuery} />
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : isNotesGenerating ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 py-20 text-center animate-in fade-in duration-300">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Notes are currently not available. Click &ldquo;Regenerate Notes&rdquo; to synthesize.
            </div>
          )}
        </div>
      )}

      {/* 2. CHAPTER SUMMARY VIEW */}
      {viewMode === "summary" && (
        <div className="flex flex-col gap-8">
          {summaryData ? (
            <>
              {/* Summary Overview */}
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 sm:p-8 shadow-xs">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Sparkles className="size-4" />
                  </div>
                  <span>Chapter Summary</span>
                </div>
                <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {summaryData.title}
                </h1>
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-foreground/80">
                  {summaryData.overview}
                </p>
              </div>

              {/* 60-Second Rapid Revision Callout */}
              {summaryData.revision_summary && (
                <div className="rounded-2xl border border-primary/25 bg-primary/5 dark:bg-primary/10 p-6 sm:p-7">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <FileText className="size-4" />
                    <span>60-Second Rapid Revision</span>
                  </div>
                  <p className="mt-2.5 text-sm sm:text-base leading-relaxed text-foreground font-medium">
                    {summaryData.revision_summary}
                  </p>
                </div>
              )}

              {/* Key Takeaways */}
              {summaryData.key_takeaways && summaryData.key_takeaways.length > 0 && (
                <div className="rounded-2xl border bg-card/60 p-6 sm:p-8 shadow-xs">
                  <h3 className="font-bold text-base sm:text-lg text-foreground">
                    Core Learning Takeaways
                  </h3>
                  <ul className="mt-4 flex flex-col gap-3">
                    {summaryData.key_takeaways.map((takeaway, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-3 text-sm sm:text-base leading-relaxed text-foreground/90"
                      >
                        <CheckCircle2 className="size-4 text-primary mt-1 shrink-0" />
                        <span>{takeaway}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Main Topics Breakdown */}
              <div className="flex flex-col gap-4">
                <h3 className="text-base font-bold text-foreground">
                  Major Topic Summaries
                </h3>
                {summaryData.main_topics.map((t, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border bg-card/40 p-5 sm:p-6 shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-foreground text-base sm:text-lg">
                        {t.topic}
                      </h4>
                      {t.source_pages && t.source_pages.length > 0 && (
                        <span className="text-xs font-mono text-muted-foreground">
                          Page {t.source_pages.join(", ")}
                        </span>
                      )}
                    </div>
                    <p className="mt-2.5 text-sm sm:text-base leading-relaxed text-muted-foreground">
                      {t.summary}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : isSummaryGenerating ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 py-20 text-center animate-in fade-in duration-300">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
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
