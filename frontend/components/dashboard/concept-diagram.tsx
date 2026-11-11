"use client";

import { Sparkles } from "lucide-react";

export function ConceptDiagram({ title }: { title?: string }) {
  return (
    <figure className="my-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/90 bg-muted/20 p-5 transition-all hover:bg-muted/30">
      <div className="relative flex size-44 items-center justify-center rounded-full border-2 border-border/80 bg-background/80 shadow-xs sm:size-48">
        {/* Minimal geometric diagram inspired by the hand-drawn reference circle */}
        <svg
          viewBox="0 0 200 200"
          className="size-full p-3 text-primary"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Subtle dashed orbit */}
          <circle
            cx="100"
            cy="100"
            r="82"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="opacity-30"
          />

          {/* Central ATP Energy Node */}
          <circle
            cx="100"
            cy="100"
            r="24"
            fill="currentColor"
            className="opacity-15"
          />
          <circle
            cx="100"
            cy="100"
            r="24"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <text
            x="100"
            y="104"
            textAnchor="middle"
            fontSize="10"
            fontWeight="bold"
            fill="currentColor"
            className="font-mono"
          >
            ATP
          </text>

          {/* Diamond Node (Nutrients / Glucose) */}
          <g transform="translate(100, 36)">
            <rect
              x="-12"
              y="-12"
              width="24"
              height="24"
              transform="rotate(45)"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="currentColor"
              className="fill-brand-soft/40"
            />
            <text
              x="0"
              y="3"
              textAnchor="middle"
              fontSize="7"
              fontWeight="600"
              fill="currentColor"
            >
              C₆H₁₂O₆
            </text>
          </g>

          {/* Square Node (Respiration / O₂) */}
          <g transform="translate(154, 110)">
            <rect
              x="-12"
              y="-12"
              width="24"
              height="24"
              rx="4"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="currentColor"
              className="fill-brand-soft/40"
            />
            <text
              x="0"
              y="3"
              textAnchor="middle"
              fontSize="8"
              fontWeight="600"
              fill="currentColor"
            >
              O₂
            </text>
          </g>

          {/* Circle Node (Transport / H₂O & CO₂) */}
          <g transform="translate(46, 110)">
            <circle
              cx="0"
              cy="0"
              r="13"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="currentColor"
              className="fill-brand-soft/40"
            />
            <text
              x="0"
              y="3"
              textAnchor="middle"
              fontSize="8"
              fontWeight="600"
              fill="currentColor"
            >
              H₂O
            </text>
          </g>

          {/* Flow Arrows */}
          <path
            d="M 116 52 Q 146 72 148 94"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M 144 126 Q 124 154 98 156"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M 78 152 Q 52 136 50 124"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M 58 92 Q 74 62 86 52"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>

        <span className="absolute -bottom-2 rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-semibold text-muted-foreground shadow-2xs">
          Bio Cycle
        </span>
      </div>

      <figcaption className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="size-3 text-primary" />
        <span>{title || "Energy & Nutrient Flow Diagram"}</span>
      </figcaption>
    </figure>
  );
}

