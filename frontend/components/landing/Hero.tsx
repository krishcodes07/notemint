"use client";

import Link from "next/link";
import BlurText from "../BlurText";
import GradientText from "../GradientText";

export default function Hero() {
  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      {/* Soft background glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-emerald-500/5 to-transparent dark:via-emerald-500/10" />
      <div className="pointer-events-none absolute -z-10 left-1/2 top-[60%] h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl" />

      <div className="mx-auto flex max-w-5xl flex-col items-center px-6 text-center">
        {/* Small badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white/70 px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>AI-powered study copilot for students</span>
        </div>

        {/* Heading */}
        <h1 className="mb-6 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl md:text-6xl dark:text-white">
          <span className="inline-flex flex-wrap items-baseline justify-center gap-3">
            <BlurText
              text="Introducing"
              delay={50}
              animateBy="words"
              direction="top"
              stepDuration={0.6}
            />
            <GradientText
              colors={["#22c55e", "#38bdf8", "#22c55e"]}
              animationSpeed={3}
              showBorder={false}
              className="inline-block"
            >
              NoteMint
            </GradientText>
          </span>
        </h1>

        {/* Subtext */}
        <p className="mb-10 max-w-2xl text-base text-zinc-600 md:text-lg dark:text-zinc-400">
          The smartest way to study. Turn your textbooks, PDFs and chapters into
          AI-generated revision notes, flashcards, MCQs, and personalized study
          plans in seconds.
        </p>

        {/* CTA buttons */}
        <div className="mb-6 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/sign-up"
            className="w-full rounded-md bg-black px-7 py-3 text-sm font-medium text-white shadow-md transition hover:translate-y-0.5 hover:bg-zinc-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100 sm:w-auto"
          >
            Get Started
          </Link>

          <Link
            href="#demo"
            className="w-full rounded-md border border-zinc-300 px-7 py-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-900 hover:text-white dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-black sm:w-auto"
          >
            Watch Demo →
          </Link>
        </div>

        {/* Social proof line */}
        <p className="flex items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>No credit card required • Free while in beta</span>
        </p>
      </div>
    </section>
  );
}
