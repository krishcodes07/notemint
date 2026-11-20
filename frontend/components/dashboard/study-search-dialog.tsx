"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  FileQuestion,
  FileText,
  Layers,
  Loader2,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DocumentSearchResponse,
  SearchResultItem,
  searchStudyResources,
} from "@/lib/api";

interface StudySearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  getToken: () => Promise<string | null>;
  onSelectResult: (
    resourceType: "notes" | "summary" | "questions" | "flashcards" | "quiz",
    targetId: string | null
  ) => void;
}

const RESOURCE_ICONS = {
  notes: BookOpen,
  summary: Sparkles,
  questions: FileQuestion,
  flashcards: Layers,
  quiz: Zap,
};

const RESOURCE_LABELS = {
  notes: "Smart Notes",
  summary: "Chapter Summary",
  questions: "Important Question",
  flashcards: "Flashcard",
  quiz: "Practice Quiz",
};

export function StudySearchDialog({
  open,
  onOpenChange,
  documentId,
  getToken,
  onSelectResult,
}: StudySearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setQuery("");
      setResults([]);
      setHasSearched(false);
      setLoading(false);
    }
    onOpenChange(newOpen);
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (!val.trim() || val.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      return;
    }

    let isCancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const resp: DocumentSearchResponse = await searchStudyResources(
          documentId,
          trimmed,
          getToken
        );
        if (!isCancelled) {
          setResults(resp.results);
          setHasSearched(true);
        }
      } catch {
        if (!isCancelled) setResults([]);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [query, documentId, getToken]);

  const handleSelect = (item: SearchResultItem) => {
    onSelectResult(item.resource_type, item.target_id);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden sm:rounded-2xl">
        <DialogHeader className="p-4 border-b">
          <div className="flex items-center gap-2.5">
            <Search className="size-4 text-primary shrink-0" />
            <DialogTitle className="text-sm font-semibold text-foreground">
              Search Study Materials
            </DialogTitle>
          </div>

          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search concepts, formulas, definitions, questions, cards..."
              autoFocus
              className="h-10 w-full rounded-xl border bg-muted/40 pl-9 pr-9 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:outline-hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => handleQueryChange("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="mt-2">Searching study resources...</span>
            </div>
          ) : results.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Found {results.length} matches
              </div>
              {results.map((item, idx) => {
                const Icon = RESOURCE_ICONS[item.resource_type] || FileText;
                const label = RESOURCE_LABELS[item.resource_type] || item.resource_type;

                return (
                  <div
                    key={idx}
                    onClick={() => handleSelect(item)}
                    className="group flex cursor-pointer flex-col gap-1.5 rounded-xl border bg-card/60 p-3.5 transition-colors hover:border-primary/40 hover:bg-card"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="gap-1 text-[10px] font-semibold text-foreground capitalize"
                        >
                          <Icon className="size-3 text-primary" />
                          <span>{label}</span>
                        </Badge>
                        <h4 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate max-w-sm">
                          {item.title}
                        </h4>
                      </div>

                      {item.source_pages && item.source_pages.length > 0 && (
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          p.{item.source_pages.join(", ")}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {item.snippet}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : hasSearched ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No study materials matched &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Type at least 2 characters to search across all generated notes, summary points, questions, and flashcards.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
