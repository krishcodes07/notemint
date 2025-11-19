"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-screen bg-black" />;
  }

  const isDark = theme === "dark";

  return (
    <div
      className={`min-h-screen w-full lg:grid lg:grid-cols-2 h-screen overflow-hidden 
      ${isDark ? "bg-black text-white" : "bg-white text-black"}`}
    >
      {/* LEFT SIDE */}
      <div
        className={`relative hidden h-full flex-col justify-between p-12 lg:flex border-r 
        ${isDark ? "bg-zinc-950 border-zinc-900" : "bg-zinc-100 border-zinc-200"}`}
      >
        <div className="absolute inset-0 z-0 w-full h-full">
          <div
            className={`absolute h-full w-full ${
              isDark
                ? "bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)]"
                : "bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)]"
            } bg-[size:24px_24px]`}
          />
        </div>

        <div className="relative z-20 mt-auto mb-auto max-w-lg mx-auto">
          <h1 className="text-5xl font-bold tracking-tight mb-6">
            Capture ideas.<br />
            <span className={isDark ? "text-zinc-500" : "text-zinc-600"}>
              Unlock intelligence.
            </span>
          </h1>
          <p className={isDark ? "text-zinc-400" : "text-zinc-700"}>
            Turn your textbooks, PDFs and chapters into AI-generated revision notes,
            flashcards, MCQs, and personalized study plans.
          </p>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div
        className={`relative flex h-full items-center justify-center p-4 lg:p-8 
        ${isDark ? "bg-black" : "bg-white"}`}
      >
        <div className="relative z-10 w-full max-w-[400px]">
          <div className="animate-in fade-in zoom-in-95 duration-500">{children}</div>
        </div>
      </div>
    </div>
  );
}
