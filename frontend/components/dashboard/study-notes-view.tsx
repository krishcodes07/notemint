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

interface StudyNotesViewProps {
  notesResource: StudyResourceResponse | null;
  summaryResource: StudyResourceResponse | null;
  isRegenerating: boolean;
  onRegenerate: (type: "notes" | "summary") => void;
  onOpenGenerateDialog: () => void;
}

/** Helper component to highlight search matches safely without dangerouslySetInnerHTML */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || !query.trim()) {
    return <>{text}</>;
  }

  const parts: { text: string; isMatch: boolean }[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  let lastIndex = 0;
  let matchIndex = lowerText.indexOf(lowerQuery, lastIndex);

  while (matchIndex !== -1) {
    if (matchIndex > lastIndex) {
      parts.push({ text: text.slice(lastIndex, matchIndex), isMatch: false });
    }
    parts.push({
      text: text.slice(matchIndex, matchIndex + lowerQuery.length),
      isMatch: true,
    });
    lastIndex = matchIndex + lowerQuery.length;
    matchIndex = lowerText.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isMatch: false });
  }

  return (
    <>
      {parts.map((part, i) =>
        part.isMatch ? (
          <mark
            key={i}
            className="rounded bg-amber-400/30 text-inherit px-0.5 font-medium dark:bg-amber-500/30"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

export function StudyNotesView({
  notesResource,
  summaryResource,
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
            <span>Regenerate {viewMode === "notes" ? "Notes" : "Summary"}</span>
          </Button>
        </div>
      </div>

      {/* 1. DETAILED SMART NOTES VIEW */}
      {viewMode === "notes" && (
        <div className="flex flex-col gap-6">
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

                {/* Table of Contents Pill Bar */}
                {notesData.sections.length > 0 && (
                  <div className="mt-5 border-t border-border/60 pt-4 print:hidden">
                    <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <AlignLeft className="size-3.5 text-primary" />
                      <span>Table of Contents</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {notesData.sections.map((sec, idx) => (
                        <a
                          key={idx}
                          href={`#section-${idx}`}
                          className="rounded-lg border bg-muted/40 px-2.5 py-1 text-xs text-foreground/80 transition-colors hover:border-primary/50 hover:bg-muted hover:text-primary"
                        >
                          {sec.heading}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Search & Collapse Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                {/* Search in Notes input */}
                <div className="relative flex-1 min-w-[240px] max-w-md">
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

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleAllSections(false)}
                    className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Maximize2 className="size-3" />
                    <span>Expand All</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleAllSections(true)}
                    className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Minimize2 className="size-3" />
                    <span>Collapse All</span>
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
                          className="flex cursor-pointer items-start justify-between gap-3 select-none"
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-muted/60 font-mono text-[11px] font-bold text-foreground">
                              {idx + 1}
                            </span>
                            <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground leading-snug">
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
                                    className="text-[10px] font-mono font-medium"
                                  >
                                    Page {p}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-7 p-0 text-muted-foreground"
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
                                density === "compact" ? "text-xs" : "text-sm"
                              }`}
                            >
                              <HighlightText text={section.content} query={searchQuery} />
                            </p>

                            {section.key_points && section.key_points.length > 0 && (
                              <div
                                className={`rounded-xl border border-primary/15 bg-brand-soft/20 ${
                                  density === "compact" ? "p-3" : "p-4"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider">
                                  <CheckCircle2 className="size-3.5" />
                                  <span>Key Revision Points</span>
                                </div>
                                <ul className="mt-2.5 flex flex-col gap-2">
                                  {section.key_points.map((point, pIdx) => (
                                    <li
                                      key={pIdx}
                                      className={`flex items-start gap-2 leading-relaxed text-foreground/90 ${
                                        density === "compact" ? "text-[11px]" : "text-xs"
                                      }`}
                                    >
                                      <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
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
                <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
                  No note sections matched &ldquo;{searchQuery}&rdquo;. Try another term or clear the search.
                </div>
              )}

              {/* Key Terms & Definitions */}
              {filteredKeyTerms.length > 0 && (
                <section className="rounded-2xl border bg-muted/25 p-6 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                    <ListOrdered className="size-4" />
                    <span>Essential Terminology & Definitions</span>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {filteredKeyTerms.map((term, tIdx) => (
                      <div
                        key={tIdx}
                        id={`term-${term.term}`}
                        className="rounded-xl border bg-card/70 p-4 transition-colors hover:bg-card"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-sm text-foreground">
                            <HighlightText text={term.term} query={searchQuery} />
                          </h4>
                          {term.source_pages && term.source_pages.length > 0 && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              p.{term.source_pages.join(", ")}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                          <HighlightText text={term.definition} query={searchQuery} />
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
