"use client";

import { Upload, LinkIcon, Mic } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function UploadSection() {
  const uploadOptions = [
    {
      icon: <Upload size={26} />,
      title: "Upload",
      desc: "File, audio, video",
      action: "Choose File",
    },
    {
      icon: <LinkIcon size={26} />,
      title: "Paste",
      desc: "YouTube, website, text",
      action: "Paste Link",
    },
    {
      icon: <Mic size={26} />,
      title: "Record",
      desc: "Capture lectures, mic, screen",
      action: "Start Recording",
    },
  ];

  return (
    <section className="w-full py-10 px-6">
      <div className="max-w-5xl mx-auto">

        {/* Heading */}
        <h2 className="text-2xl md:text-3xl font-semibold text-zinc-900 dark:text-white mb-6">
          What do you want to learn?
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm md:text-base mb-10">
          Turn your learning materials into notes, interactive chats, quizzes, and more.
        </p>

        {/* Upload Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {uploadOptions.map((item, index) => (
            <Card
              key={index}
              className="cursor-pointer hover:shadow-lg transition rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
            >
              <CardContent className="flex flex-col items-center text-center py-8">
                <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-3">
                  {item.icon}
                </div>
                <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-1">
                  {item.title}
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                  {item.desc}
                </p>
                <button className="px-4 py-2 text-sm font-medium rounded-md border border-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:border-zinc-700 transition">
                  {item.action}
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
