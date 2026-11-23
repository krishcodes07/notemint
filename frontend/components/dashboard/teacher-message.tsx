"use client";

import React, { useMemo } from "react";
import { AlertCircle, Loader2, RefreshCw, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeacherMessageResponse } from "@/lib/api";
import { TeacherSourceCitation } from "@/components/dashboard/teacher-source-citation";
import { FormattedMathText } from "@/components/ui/formatted-math-text";

interface TeacherMessageProps {
  message: TeacherMessageResponse;
  onOpenPdf: (page: number) => void;
  onRetry?: (messageId: string) => void;
  isRetrying?: boolean;
  onPlaySpeech?: (messageId: string) => void;
  isPlayingSpeech?: boolean;
  isLoadingSpeech?: boolean;
}

/**
 * Safe inline parser for bold, italic, code, and [Page X] citations without dangerous HTML.
 */
function renderInlineContent(
  text: string,
  onOpenPdf: (page: number) => void,
  keyPrefix: string
): React.ReactNode[] {
  // Regex pattern matching:
  // 1. [Page X] or [Pages X, Y]
  // 2. `inline code`
  // 3. **bold** or __bold__
  // 4. *italic* or _italic_
  const pattern = /(\[Pages?\s+[0-9,\s\-]+\]|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|(?<=\s|^)_[^_]+_(?=\s|$|[.,;:!?]))/g;
  const parts = text.split(pattern);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (!part) return null;

    // Check [Page X] citation
    const pageMatch = part.match(/^\[Pages?\s+([0-9,\s\-]+)\]$/i);
    if (pageMatch) {
      const numbersStr = pageMatch[1];
      const tokens = numbersStr.split(/[,\s]+/);
      const pageNumbers: number[] = [];
      for (const tok of tokens) {
        if (tok.includes("-")) {
          const [s, e] = tok.split("-");
          const start = parseInt(s, 10);
          const end = parseInt(e, 10);
          if (!isNaN(start) && !isNaN(end) && end >= start) {
            for (let i = start; i <= end; i++) pageNumbers.push(i);
          }
        } else if (!isNaN(parseInt(tok, 10))) {
          pageNumbers.push(parseInt(tok, 10));
        }
      }
      return (
        <span key={key} className="inline-flex items-center flex-wrap gap-1 mx-1 align-baseline">
          {pageNumbers.map((p) => (
            <TeacherSourceCitation key={`${key}-p${p}`} page={p} onClick={onOpenPdf} />
          ))}
        </span>
      );
    }

    // Check inline code: `code`
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary font-semibold"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Check bold: **bold** or __bold__
    if (
      (part.startsWith("**") && part.endsWith("**") && part.length > 4) ||
      (part.startsWith("__") && part.endsWith("__") && part.length > 4)
    ) {
      const innerText = part.slice(2, -2);
      return (
        <strong key={key} className="font-semibold text-foreground">
          {renderInlineContent(innerText, onOpenPdf, `${key}-b`)}
        </strong>
      );
    }

    // Check italic: *italic* or _italic_
    if (
      (part.startsWith("*") && part.endsWith("*") && part.length > 2) ||
      (part.startsWith("_") && part.endsWith("_") && part.length > 2)
    ) {
      const innerText = part.slice(1, -1);
      return (
        <em key={key} className="italic text-foreground">
          {renderInlineContent(innerText, onOpenPdf, `${key}-i`)}
        </em>
      );
    }

    return <FormattedMathText key={key} text={part} />;
  });
}

function parseTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((c) => c.trim());
}

function isTableDelimiter(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("-")) return false;
  const cells = parseTableRow(trimmed);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-+:?$/.test(c));
}

function getColumnAlignments(delimiterLine: string): ("left" | "center" | "right")[] {
  const cells = parseTableRow(delimiterLine);
  return cells.map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });
}

/**
 * Safe Markdown-like block renderer without dangerouslySetInnerHTML.
 */
function MarkdownBlockRenderer({
  content,
  onOpenPdf,
}: {
  content: string;
  onOpenPdf: (page: number) => void;
}) {
  const elements = useMemo(() => {
    const lines = content.split("\n");
    const nodes: React.ReactNode[] = [];
    let i = 0;

    const isBulletItem = (str: string) => {
      const t = str.trim();
      return t.startsWith("- ") || t.startsWith("* ") || t.startsWith("• ");
    };

    const getBulletText = (str: string) => {
      const t = str.trim();
      if (t.startsWith("- ") || t.startsWith("* ")) return t.slice(2);
      if (t.startsWith("• ")) return t.slice(2);
      return t;
    };

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip pure empty lines
      if (!trimmed) {
        i++;
        continue;
      }

      // 1. Code blocks: ```
      if (trimmed.startsWith("```")) {
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        nodes.push(
          <div
            key={`code-${i}`}
            className="my-2.5 rounded-lg bg-muted/80 p-3 font-mono text-xs overflow-x-auto border border-border/60 text-foreground"
          >
            <pre>{codeLines.join("\n")}</pre>
          </div>
        );
        i++;
        continue;
      }

      // 2. Horizontal Rules: --- or *** or ___
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        nodes.push(
          <hr key={`hr-${i}`} className="my-3.5 border-t border-border/70" />
        );
        i++;
        continue;
      }

      // 3. Tables: line with | followed by delimiter row
      if (trimmed.includes("|") && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
        const headers = parseTableRow(trimmed);
        const alignments = getColumnAlignments(lines[i + 1]);
        const rows: string[][] = [];
        i += 2; // skip header and delimiter

        while (i < lines.length && lines[i].includes("|") && lines[i].trim().length > 0) {
          rows.push(parseTableRow(lines[i]));
          i++;
        }

        nodes.push(
          <div
            key={`table-${i}`}
            className="my-3 overflow-x-auto rounded-xl border border-border/80 bg-card/60 shadow-2xs"
          >
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead className="border-b border-border/80 bg-muted/70 text-foreground font-semibold">
                <tr>
                  {headers.map((h, colIdx) => {
                    const align = alignments[colIdx] || "left";
                    return (
                      <th
                        key={`th-${colIdx}`}
                        className={`px-3.5 py-2.5 text-xs font-semibold tracking-wide ${
                          align === "center"
                            ? "text-center"
                            : align === "right"
                            ? "text-right"
                            : "text-left"
                        }`}
                      >
                        {renderInlineContent(h, onOpenPdf, `th-${i}-${colIdx}`)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((row, rIdx) => (
                  <tr key={`tr-${rIdx}`} className="hover:bg-muted/25 transition-colors">
                    {row.map((cell, cIdx) => {
                      const align = alignments[cIdx] || "left";
                      return (
                        <td
                          key={`td-${cIdx}`}
                          className={`px-3.5 py-2.5 align-top leading-relaxed text-foreground/90 ${
                            align === "center"
                              ? "text-center"
                              : align === "right"
                              ? "text-right"
                              : "text-left"
                          }`}
                        >
                          {renderInlineContent(cell, onOpenPdf, `td-${i}-${rIdx}-${cIdx}`)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // 4. Headings: #, ##, ###, ####
      if (trimmed.startsWith("# ")) {
        nodes.push(
          <h2
            key={`h1-${i}`}
            className="mt-4 mb-2 text-base sm:text-lg font-bold text-foreground tracking-tight"
          >
            {renderInlineContent(trimmed.slice(2), onOpenPdf, `h1-${i}`)}
          </h2>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith("## ")) {
        nodes.push(
          <h3
            key={`h2-${i}`}
            className="mt-3.5 mb-1.5 text-sm sm:text-base font-bold text-foreground tracking-tight"
          >
            {renderInlineContent(trimmed.slice(3), onOpenPdf, `h2-${i}`)}
          </h3>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith("### ")) {
        nodes.push(
          <h4
            key={`h3-${i}`}
            className="mt-3 mb-1 text-xs sm:text-sm font-bold text-foreground"
          >
            {renderInlineContent(trimmed.slice(4), onOpenPdf, `h3-${i}`)}
          </h4>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith("#### ")) {
        nodes.push(
          <h5
            key={`h4-${i}`}
            className="mt-2.5 mb-1 text-xs sm:text-sm font-semibold text-foreground"
          >
            {renderInlineContent(trimmed.slice(5), onOpenPdf, `h4-${i}`)}
          </h5>
        );
        i++;
        continue;
      }

      // 5. Blockquotes: >
      if (trimmed.startsWith(">")) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          quoteLines.push(lines[i].trim().replace(/^>\s*/, ""));
          i++;
        }
        nodes.push(
          <blockquote
            key={`bq-${i}`}
            className="my-2.5 rounded-r-xl border-l-3 border-primary bg-brand-soft/20 px-3.5 py-2 text-xs sm:text-sm italic text-muted-foreground space-y-1"
          >
            {quoteLines.map((ql, qIdx) => (
              <p key={`bqp-${qIdx}`} className="leading-relaxed">
                {renderInlineContent(ql, onOpenPdf, `bq-${i}-${qIdx}`)}
              </p>
            ))}
          </blockquote>
        );
        continue;
      }

      // 6. Unordered bullet list: "- ", "* ", "• "
      if (isBulletItem(trimmed)) {
        const listItems: string[] = [];
        while (i < lines.length && isBulletItem(lines[i])) {
          listItems.push(getBulletText(lines[i]));
          i++;
        }
        nodes.push(
          <ul
            key={`ul-${i}`}
            className="my-2 pl-5 list-disc space-y-1.5 text-sm sm:text-base text-foreground/90"
          >
            {listItems.map((item, idx) => (
              <li key={`li-${i}-${idx}`} className="leading-relaxed">
                {renderInlineContent(item, onOpenPdf, `li-${i}-${idx}`)}
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // 7. Numbered section heading vs Ordered list: "1. ", "5. "
      if (/^\d+\.\s+/.test(trimmed)) {
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";
        const isNextNumbered = /^\d+\.\s+/.test(nextLine);

        // If standalone line followed by a table, bullet, heading, hr, or blank: treat as numbered section title
        if (
          !isNextNumbered &&
          (nextLine === "" ||
            nextLine.startsWith("|") ||
            nextLine.startsWith("-") ||
            nextLine.startsWith("•") ||
            nextLine.startsWith("*") ||
            nextLine.startsWith("#"))
        ) {
          nodes.push(
            <h4
              key={`numh-${i}`}
              className="mt-4 mb-1.5 text-base sm:text-lg font-bold text-foreground tracking-tight"
            >
              {renderInlineContent(trimmed, onOpenPdf, `numh-${i}`)}
            </h4>
          );
          i++;
          continue;
        }

        // Otherwise treat as ordered list items
        const listItems: string[] = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          listItems.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
          i++;
        }
        nodes.push(
          <ol
            key={`ol-${i}`}
            className="my-2 pl-5 list-decimal space-y-1.5 text-sm sm:text-base text-foreground/90"
          >
            {listItems.map((item, idx) => (
              <li key={`oli-${i}-${idx}`} className="leading-relaxed">
                {renderInlineContent(item, onOpenPdf, `oli-${i}-${idx}`)}
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // 8. Normal paragraph
      nodes.push(
        <p key={`p-${i}`} className="my-2 leading-relaxed text-sm sm:text-base text-foreground/90">
          {renderInlineContent(trimmed, onOpenPdf, `p-${i}`)}
        </p>
      );
      i++;
    }

    return nodes;
  }, [content, onOpenPdf]);

  return <div className="space-y-1.5">{elements}</div>;
}

export function TeacherMessage({
  message,
  onOpenPdf,
  onRetry,
  isRetrying = false,
  onPlaySpeech,
  isPlayingSpeech = false,
  isLoadingSpeech = false,
}: TeacherMessageProps) {
  const isUser = message.role === "user";
  const isProcessing = message.status === "processing";
  const isFailed = message.status === "failed";

  const formattedTime = new Date(message.created_at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isUser) {
    return (
      <div className="flex justify-end my-3 pl-8">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-sm bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white px-4 py-3 shadow-xs">
          <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
          <div className="text-[10px] text-emerald-100 text-right mt-1">
            {formattedTime}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message (Completely borderless, no container box, flowing directly on page)
  return (
    <div className="flex gap-3 my-4 pr-2 sm:pr-6 items-start">
      {/* Teacher Avatar */}
      <div className="size-8 rounded-full bg-brand-soft border border-primary/20 flex items-center justify-center shrink-0 mt-0.5 text-primary shadow-xs">
        <Sparkles className="size-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-semibold text-foreground">AI Teacher</span>
          <span className="text-[10px] text-muted-foreground">{formattedTime}</span>

          {/* On-demand Listen / Speaker button */}
          {message.status === "completed" && message.content && onPlaySpeech && (
            <button
              type="button"
              onClick={() => onPlaySpeech(message.id)}
              disabled={isLoadingSpeech}
              className={`p-1 rounded-md transition-colors cursor-pointer ml-1 inline-flex items-center gap-1 text-[11px] ${
                isPlayingSpeech
                  ? "text-emerald-600 bg-emerald-500/15 animate-pulse font-medium"
                  : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/60"
              }`}
              title={isPlayingSpeech ? "Stop playback" : "Listen to this answer"}
            >
              {isLoadingSpeech ? (
                <Loader2 className="size-3 animate-spin text-primary" />
              ) : (
                <Volume2 className="size-3" />
              )}
              {isPlayingSpeech && <span>Speaking...</span>}
            </button>
          )}
        </div>

        {/* Message Content: Completely borderless & container-less */}
        <div className="text-foreground leading-relaxed pt-0.5">
          {isProcessing ? (
            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span>AI Teacher is thinking and reviewing your textbook...</span>
            </div>
          ) : isFailed ? (
            <div className="space-y-2 py-1">
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>
                  {message.error_message || "Failed to generate explanation. Please try again."}
                </span>
              </div>
              {onRetry && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRetry(message.id)}
                  disabled={isRetrying}
                  className="h-7 text-xs gap-1.5 mt-1 border-destructive/30 hover:bg-destructive/10 text-destructive"
                >
                  <RefreshCw className={`size-3 ${isRetrying ? "animate-spin" : ""}`} />
                  <span>Retry Answer</span>
                </Button>
              )}
            </div>
          ) : (
            <div>
              <MarkdownBlockRenderer content={message.content} onOpenPdf={onOpenPdf} />

              {/* Bottom verified citations ribbon */}
              {message.source_pages && message.source_pages.length > 0 && (
                <div className="mt-3 pt-2 flex items-center flex-wrap gap-1.5 border-t border-border/40">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    Sources:
                  </span>
                  {message.source_pages.map((p) => (
                    <TeacherSourceCitation
                      key={`source-${message.id}-${p}`}
                      page={p}
                      onClick={onOpenPdf}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
