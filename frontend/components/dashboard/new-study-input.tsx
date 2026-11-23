"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Search, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadDialog } from "@/components/dashboard/upload-dialog";

export function NewStudyInput() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [stagedTopic, setStagedTopic] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) {
      setUploadDialogOpen(true);
      return;
    }

    setStagedTopic(clean);
    setUploadDialogOpen(true);
  };

  const handleClear = () => {
    setQuery("");
  };

  return (
    <div className="w-full max-w-2xl">
      <form onSubmit={handleSubmit} className="relative">
        <div className="group relative flex items-center rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition-all focus-within:border-foreground focus-within:ring-2 focus-within:ring-foreground/10 hover:border-border/80">
          <div className="flex size-8 shrink-0 items-center justify-center text-muted-foreground group-focus-within:text-foreground transition-colors">
            <Search className="size-4" aria-hidden />
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents or enter topic (e.g. Optics, Thermodynamics)..."
            className="ml-2.5 flex-1 bg-transparent text-sm sm:text-base font-medium placeholder:text-muted-foreground/60 focus:outline-hidden text-foreground"
          />

          <div className="flex items-center gap-2 pl-2">
            {query.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear input"
              >
                <X className="size-3.5" />
              </button>
            )}

            <Button
              type="submit"
              size="sm"
              className="h-9 rounded-full bg-foreground text-background px-4 text-xs font-semibold hover:bg-foreground/90 transition-all shadow-xs gap-1.5"
            >
              {query.trim() ? (
                <>
                  <span>Create Study Set</span>
                  <ArrowRight className="size-3.5" />
                </>
              ) : (
                <>
                  <UploadCloud className="size-3.5" />
                  <span>Upload PDF</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </form>

      <div className="mt-3 flex items-center justify-between px-2 text-xs text-muted-foreground">
        <span>Supports PDF chapters, textbooks, and lecture slides up to 20MB</span>
        <button
          type="button"
          onClick={() => {
            setStagedTopic("");
            setUploadDialogOpen(true);
          }}
          className="font-semibold text-primary hover:underline flex items-center gap-1"
        >
          <Plus className="size-3" />
          <span>Direct Upload</span>
        </button>
      </div>

      {/* Upload Dialog */}
      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        defaultTopic={stagedTopic}
      />
    </div>
  );
}
