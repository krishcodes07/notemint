"use client";

import React, { useMemo } from "react";
import katex from "katex";
import { cn } from "@/lib/utils";

interface FormattedMathTextProps {
  text: string;
  query?: string;
  className?: string;
  as?: "span" | "div" | "p";
}

interface TextSegment {
  type: "text" | "inline-math" | "block-math";
  content: string;
  raw?: string;
}

const ALLOWED_MATH_WORDS = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc",
  "arcsin", "arccos", "arctan",
  "sinh", "cosh", "tanh",
  "log", "ln", "lg", "exp",
  "lim", "max", "min", "sup", "inf",
  "det", "dim", "ker", "deg", "gcd", "lcm",
  "re", "im", "mod", "arg",
  "dx", "dy", "dt", "dz", "dr", "dtheta",
  // Common LaTeX command identifiers
  "frac", "sqrt", "text", "left", "right", "bar", "hat", "vec",
  "theta", "alpha", "beta", "gamma", "lambda", "pi", "mu", "sigma", "omega", "delta",
  "times", "cdot", "pm", "neq", "le", "ge", "approx", "equiv", "implies",
  "operatorname", "mathrm", "mathbf", "mathit",
]);

const COMMON_PROSE_SHORT_WORDS = new Set([
  "is", "in", "to", "of", "at", "or", "if", "as", "by", "an", "on", "so", "we", "he", "it", "no", "do", "be",
]);

function isProseWord(word: string): boolean {
  const w = word.toLowerCase();
  if (ALLOWED_MATH_WORDS.has(w)) return false;
  if (COMMON_PROSE_SHORT_WORDS.has(w)) return true;
  if (word.length >= 3) return true;
  return false;
}

function hasMathSymbol(str: string): boolean {
  // If string contains backslash commands (e.g. \frac, \sqrt, \text) or LaTeX braces { }
  if (/\\[a-zA-Z]+|[{}]/.test(str)) return true;
  // Ignore regular hyphen between words: e.g. non-negative, well-known
  const withoutHyphenWords = str.replace(/[a-zA-Z]-[a-zA-Z]/g, "");
  return /[=≠≈≤≥+\-±×·\/*^√|~→⇄⇒²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻₀₁₂₃₄₅₆₇₈₉αβγθλπμσωΔΩ]|[\u0300-\u036F]|z̅|z̄/.test(
    withoutHyphenWords
  );
}

/**
 * Preprocess Unicode and pseudo-math expressions into valid, clean LaTeX.
 */
export function normalizeUnicodeMath(raw: string): string {
  let s = raw.trim();

  // Strip outer punctuation if captured
  s = s.replace(/^[,\s;:]+/, "").replace(/[,\s;:]+$/, "");

  // 1. Chemical reaction arrows & formulas (e.g. CaCO3 -> CaO + CO2 or H2SO4)
  if (/->|⇄/.test(s) || /^[A-Z][a-z]?\d+/.test(s)) {
    s = s.replace(/->/g, " \\rightarrow ");
    s = s.replace(/⇄/g, " \\rightleftharpoons ");
    // Convert chemical digits to subscripts: H2SO4 -> H_2SO_4
    s = s.replace(/([A-Za-z)\]])(\d+)/g, "$1_$2");
    return `\\mathrm{${s}}`;
  }

  // 2. Normalize malformed \text Re(z) or \text {Re}(z) -> \operatorname{Re}(z)
  s = s.replace(/\\text\s*\{?Re\}?/g, "\\operatorname{Re}");
  s = s.replace(/\\text\s*\{?Im\}?/g, "\\operatorname{Im}");

  // 3. Combining overline/macron on letter: e.g. z̅ (z + \u0305) or z̄ (z + \u0304) -> \bar{z}
  s = s.replace(/([a-zA-Z])[\u0300-\u036F]/g, "\\bar{$1}");
  s = s.replace(/z̅/g, "\\bar{z}").replace(/z̄/g, "\\bar{z}");

  // 4. Unicode superscripts: group contiguous into ^{...}
  const supMap: Record<string, string> = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5",
    "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "ⁿ": "n", "⁺": "+",
    "⁻": "-", "ᵏ": "k", "ᵐ": "m", "ᵖ": "p", "ˣ": "x", "ʸ": "y",
  };
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻ᵏᵐᵖˣʸ]+/g, (match) => {
    return `^{${match.split("").map((c) => supMap[c] || c).join("")}}`;
  });

  // 5. Unicode subscripts: group contiguous into _{...}
  const subMap: Record<string, string> = {
    "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
    "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  };
  s = s.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (match) => {
    return `_{${match.split("").map((c) => subMap[c] || c).join("")}}`;
  });

  // 6. Fix double or unbraced superscripts like i^4k^+^1 or z^-^1
  s = s.replace(/\^{([^}]+)}\^{([^}]+)}/g, "^{$1$2}");
  s = s.replace(/\^([a-zA-Z0-9])\^\+?\^?([a-zA-Z0-9])/g, "^{$1+$2}");
  s = s.replace(/\^-\^([0-9a-zA-Z]+)/g, "^{-$1}");
  s = s.replace(/\^(-?[0-9a-zA-Z]+)/g, "^{$1}");

  // 7. Square roots: √(expr) or √x (only if not already \sqrt)
  s = s.replace(/√\(([^)]+)\)/g, "\\sqrt{$1}");
  s = s.replace(/√([a-zA-Z0-9]+)/g, "\\sqrt{$1}");

  // 8. Greek letters (only bare unicode)
  s = s
    .replace(/α/g, "\\alpha ")
    .replace(/β/g, "\\beta ")
    .replace(/γ/g, "\\gamma ")
    .replace(/θ/g, "\\theta ")
    .replace(/λ/g, "\\lambda ")
    .replace(/π/g, "\\pi ")
    .replace(/μ/g, "\\mu ")
    .replace(/σ/g, "\\sigma ")
    .replace(/ω/g, "\\omega ")
    .replace(/Δ/g, "\\Delta ")
    .replace(/Ω/g, "\\Omega ");

  // 9. Multiplication, dots & relations
  s = s.replace(/·/g, " \\cdot ");
  s = s.replace(/×/g, " \\times ");
  s = s.replace(/±/g, " \\pm ");
  s = s.replace(/≠/g, " \\neq ");
  s = s.replace(/≤/g, " \\le ");
  s = s.replace(/≥/g, " \\ge ");
  s = s.replace(/⇒/g, " \\implies ");

  // 10. Fractions: (a+b)/(c+d) if not already \frac
  s = s.replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, "\\frac{$1}{$2}");

  // 11. Simple algebraic fractions: e.g. u/x (only if not inside LaTeX commands)
  if (!s.includes("\\frac")) {
    s = s.replace(/\b([a-zA-Z0-9]+)\/([a-zA-Z0-9]+)\b/g, "\\frac{$1}{$2}");
  }

  // 12. Modulus: |expr| (only if not already containing \left|)
  if (!s.includes("\\left|")) {
    s = s.replace(/\|([^|]+)\|/g, "\\left| $1 \\right|");
  }

  // 13. Dots / Ellipsis
  s = s.replace(/\.\.\./g, " \\dots ");

  // 14. Math operators (only bare words not preceded by \)
  s = s.replace(/(?<!\\)\bRe\b/g, "\\operatorname{Re}");
  s = s.replace(/(?<!\\)\bIm\b/g, "\\operatorname{Im}");

  return s;
}

/**
 * Tokenize a candidate string into math expressions and surrounding text/punctuation.
 */
function processCandidate(raw: string, segments: TextSegment[]) {
  let s = raw;

  // Leading whitespace / punctuation
  const leadMatch = s.match(/^[\s,.:;?]+/);
  if (leadMatch) {
    segments.push({ type: "text", content: leadMatch[0] });
    s = s.slice(leadMatch[0].length);
  }

  // Check if variable before colon, e.g. "k: "
  const colonVarMatch = s.match(/^[a-zA-Z]:\s*/);
  if (colonVarMatch) {
    segments.push({ type: "text", content: colonVarMatch[0] });
    s = s.slice(colonVarMatch[0].length);
  }

  // Handle unbalanced leading '('
  if (s.startsWith("(") && !s.includes(")")) {
    segments.push({ type: "text", content: "(" });
    s = s.slice(1);
  }

  // Trailing numbered list marker, e.g. ". (2)" or ". (3)"
  const listMarkerMatch = s.match(/\.\s*\(\d+\)\s*$/);
  let listMarker = "";
  if (listMarkerMatch) {
    listMarker = listMarkerMatch[0];
    s = s.slice(0, -listMarker.length);
  }

  // Trailing whitespace / punctuation
  const trailMatch = s.match(/[\s,.:;?]+$/);
  let trailing = "";
  if (trailMatch) {
    trailing = trailMatch[0];
    s = s.slice(0, -trailing.length);
  }

  // Handle unbalanced trailing '(' or ')'
  const openCount = (s.match(/\(/g) || []).length;
  const closeCount = (s.match(/\)/g) || []).length;
  if (openCount > closeCount && s.endsWith("(")) {
    trailing = "(" + trailing;
    s = s.slice(0, -1).trimEnd();
  } else if (closeCount > openCount && s.endsWith(")")) {
    trailing = ")" + trailing;
    s = s.slice(0, -1).trimEnd();
  }

  if (!s) {
    if (trailing) segments.push({ type: "text", content: trailing });
    if (listMarker) segments.push({ type: "text", content: listMarker });
    return;
  }

  // Check if multiple comma/semicolon-separated equations:
  // Avoid splitting if inside LaTeX commands like \text or \left or braces
  if ((s.includes(",") || s.includes(";")) && !s.includes("\\left") && !s.includes("\\text")) {
    const parts = s.split(/([,;]\s*)/);
    for (const p of parts) {
      if (!p) continue;
      if (/^[,;]\s*$/.test(p)) {
        segments.push({ type: "text", content: p });
      } else if (hasMathSymbol(p)) {
        const norm = normalizeUnicodeMath(p);
        segments.push({ type: "inline-math", content: norm, raw: p.trim() });
      } else {
        segments.push({ type: "text", content: p });
      }
    }
  } else {
    if (hasMathSymbol(s)) {
      const norm = normalizeUnicodeMath(s);
      segments.push({ type: "inline-math", content: norm, raw: s.trim() });
    } else {
      segments.push({ type: "text", content: s });
    }
  }

  if (trailing) {
    segments.push({ type: "text", content: trailing });
  }
  if (listMarker) {
    segments.push({ type: "text", content: listMarker });
  }
}

/**
 * Robustly segments plain/Unicode/raw-LaTeX text into prose text and isolated math expressions.
 * Ensures English words never lose their whitespace, and raw LaTeX commands are correctly rendered.
 */
function segmentMixedText(text: string): TextSegment[] {
  // If the whole text contains LaTeX commands or math symbols and ZERO prose words:
  // (e.g. "\frac {2}{13} + i\frac{3}{13}", "\text Re(z) = -1, \text{Im}(z) = \frac{3}{4}")
  // Render the entire string as a single, cohesive math formula
  const words = text.match(/\b[a-zA-Z]+\b/g) || [];
  const proseWords = words.filter((w) => isProseWord(w));

  if (proseWords.length === 0 && hasMathSymbol(text)) {
    const norm = normalizeUnicodeMath(text);
    return [{ type: "inline-math", content: norm, raw: text.trim() }];
  }

  // Otherwise, identify prose word boundaries and extract math between them
  const wordRegex = /\b[a-zA-Z]+(?:-[a-zA-Z]+)*\b/g;
  const proseMatches: { word: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = wordRegex.exec(text)) !== null) {
    const rawWord = m[0];
    const prevChar = m.index > 0 ? text[m.index - 1] : " ";

    // If preceded by '\', it is a LaTeX command name (e.g. \frac, \sqrt, \text, \theta)
    if (prevChar === "\\") {
      continue;
    }

    // If preceded by a math operator like '+', '-', '*', '/', '=', it's part of a formula (e.g. e+if or a+ib)
    if (/[\+\-\*\/=]/.test(prevChar)) {
      continue;
    }

    const subwords = rawWord.split("-");
    if (subwords.some((w) => isProseWord(w))) {
      proseMatches.push({
        word: rawWord,
        start: m.index,
        end: m.index + rawWord.length,
      });
    }
  }

  if (proseMatches.length === 0) {
    if (hasMathSymbol(text)) {
      const norm = normalizeUnicodeMath(text);
      return [{ type: "inline-math", content: norm, raw: text.trim() }];
    }
    return [{ type: "text", content: text }];
  }

  // Group consecutive prose words into prose spans
  const proseSpans: { start: number; end: number }[] = [];
  let curSpan = { start: proseMatches[0].start, end: proseMatches[0].end };

  for (let i = 1; i < proseMatches.length; i++) {
    const nextMatch = proseMatches[i];
    const between = text.slice(curSpan.end, nextMatch.start);

    if (hasMathSymbol(between)) {
      proseSpans.push(curSpan);
      curSpan = { start: nextMatch.start, end: nextMatch.end };
    } else {
      curSpan.end = nextMatch.end;
    }
  }
  proseSpans.push(curSpan);

  // Everything between prose spans is candidate math
  const segments: TextSegment[] = [];
  let pos = 0;

  for (const span of proseSpans) {
    if (span.start > pos) {
      const candidateMath = text.slice(pos, span.start);
      processCandidate(candidateMath, segments);
    }
    const proseText = text.slice(span.start, span.end);
    segments.push({ type: "text", content: proseText });
    pos = span.end;
  }

  if (pos < text.length) {
    const candidateMath = text.slice(pos);
    processCandidate(candidateMath, segments);
  }

  // Merge adjacent text segments
  const merged: TextSegment[] = [];
  for (const seg of segments) {
    if (
      seg.type === "text" &&
      merged.length > 0 &&
      merged[merged.length - 1].type === "text"
    ) {
      merged[merged.length - 1].content += seg.content;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}

/**
 * Highlight query terms in plain text segments.
 */
function highlightText(text: string, query?: string): React.ReactNode {
  if (!query || !query.trim()) {
    return text;
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

  return parts.map((part, i) =>
    part.isMatch ? (
      <mark
        key={i}
        className="rounded-xs bg-amber-300/40 text-inherit font-medium dark:bg-amber-500/30 px-0.5"
      >
        {part.text}
      </mark>
    ) : (
      part.text
    )
  );
}

export function FormattedMathText({
  text,
  query,
  className,
  as = "span",
}: FormattedMathTextProps) {
  const segments = useMemo<TextSegment[]>(() => {
    if (!text) return [];

    // Check if the text contains standard LaTeX delimiters
    const hasLatexDelimiters =
      text.includes("$$") ||
      text.includes("\\[") ||
      (text.includes("$") && !text.includes("\\$"));

    if (hasLatexDelimiters) {
      const regex =
        /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$(?:\\.|[^\$\n])+\$|\\\([\s\S]*?\\\))/g;
      const rawParts = text.split(regex);
      const result: TextSegment[] = [];

      for (const part of rawParts) {
        if (!part) continue;

        if (
          (part.startsWith("$$") && part.endsWith("$$")) ||
          (part.startsWith("\\[") && part.endsWith("\\]"))
        ) {
          const rawMath = part.slice(2, -2).trim();
          result.push({ type: "block-math", content: rawMath, raw: part });
        } else if (
          (part.startsWith("$") && part.endsWith("$") && part.length > 2) ||
          (part.startsWith("\\(") && part.endsWith("\\)"))
        ) {
          const rawMath = part.startsWith("$")
            ? part.slice(1, -1).trim()
            : part.slice(2, -2).trim();

          // Check if an entire English prose sentence was erroneously wrapped inside $...$
          const words = rawMath.match(/[a-zA-Z]{3,}/g);
          const hasMultipleProseWords =
            words && words.filter((w) => isProseWord(w)).length >= 2;

          if (hasMultipleProseWords) {
            const subSegments = segmentMixedText(rawMath);
            result.push(...subSegments);
          } else {
            const normalized = normalizeUnicodeMath(rawMath);
            result.push({ type: "inline-math", content: normalized, raw: rawMath });
          }
        } else {
          // Plain text part: run segmentMixedText to capture any un-delimited formulas
          const subSegments = segmentMixedText(part);
          result.push(...subSegments);
        }
      }

      return result;
    }

    // Auto-detect math in text without dollar signs
    return segmentMixedText(text);
  }, [text]);

  const Component = as;

  return (
    <Component className={cn("inline-math-container leading-relaxed", className)}>
      {segments.map((seg, idx) => {
        if (seg.type === "block-math") {
          try {
            const html = katex.renderToString(seg.content, {
              displayMode: true,
              throwOnError: true,
            });
            return (
              <span
                key={idx}
                className="my-2 block overflow-x-auto text-center"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch {
            return (
              <code key={idx} className="block my-2 text-xs font-mono">
                {seg.raw || seg.content}
              </code>
            );
          }
        }

        if (seg.type === "inline-math") {
          try {
            const html = katex.renderToString(seg.content, {
              displayMode: false,
              throwOnError: true,
            });
            return (
              <span
                key={idx}
                className="inline-math px-0.5 align-baseline font-normal"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch {
            // Safe fallback to clean monospace text: never show raw red parse errors!
            return (
              <span key={idx} className="font-mono text-[0.9em] px-0.5 text-foreground/90">
                {seg.raw || seg.content}
              </span>
            );
          }
        }

        return (
          <React.Fragment key={idx}>
            {highlightText(seg.content, query)}
          </React.Fragment>
        );
      })}
    </Component>
  );
}
