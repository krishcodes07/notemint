"use client";

import SpotlightCard from "../SpotlightCard";
import { BookOpen, Sparkles, PenTool, Brain } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const features = [
  {
    icon: <BookOpen size={26} />,
    title: "AI Notes Generator",
    description:
      "Upload textbooks, PDFs, or chapters and instantly turn them into structured revision notes.",
  },
  {
    icon: <PenTool size={26} />,
    title: "Flashcards & MCQs",
    description:
      "Automatically generate flashcards, quizzes, and MCQs to boost your exam preparation.",
  },
  {
    icon: <Brain size={26} />,
    title: "AI Teacher",
    description:
      "Talk to your AI teacher, ask questions, clear doubts, and even get quizzed back.",
  },
  {
    icon: <Sparkles size={26} />,
    title: "Smart Revision",
    description:
      "Use spaced repetition, AI search, and concept linking for effective retention.",
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-6 bg-white dark:bg-zinc-950">
      <div className="max-w-6xl mx-auto text-center mb-16">
        <h2 className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-white mb-4">
          Everything you need to study smarter
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400 text-base md:text-lg">
          NoteMint makes studying effortless with AI-powered tools built for students.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-6xl mx-auto">
        {features.map((item, index) => {
          const ref = useRef(null);
          const isInView = useInView(ref, { amount: 0.3 });

          return (
            <motion.div
                key={index}
                ref={ref}
                initial={{ opacity: 0, y: 40 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                whileHover={{
                    scale: 1.03,
                    transition: { duration: 0.2 },
                }}
                >
                <SpotlightCard
                    className="p-6 rounded-xl bg-white dark:bg-zinc-900 shadow-md hover:shadow-lg transition duration-300"
                    spotlightColor="rgba(0, 255, 94, 0.31)"
                >
                    <div className="flex flex-col items-start gap-3">
                    <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        {item.icon}
                    </div>
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                        {item.title}
                    </h3>
                    <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                        {item.description}
                    </p>
                    </div>
                </SpotlightCard>
            </motion.div>

          );
        })}
      </div>
    </section>
  );
}
