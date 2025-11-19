"use client";

import Link from "next/link";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Plus,
  BookOpen,
  Folder,
  Clock,
  HelpCircle,
  Settings,
  UserCircle,
} from "lucide-react";

export default function Sidebar() {
  const [spaces] = useState([
    { id: 1, name: "Krish's Space" },
    { id: 2, name: "Physics Notes" },
    { id: 3, name: "Board Exam Prep" },
  ]);

  const recents = [
    { id: 1, title: "Matter in Our Surroundings", link: "#" },
    { id: 2, title: "Class 10 Biology Chapter 3", link: "#" },
  ];

  return (
    <div className="h-screen w-64 border-r bg-white dark:bg-zinc-900 dark:border-zinc-800 flex flex-col">
      {/* Top Logo */}
      <div className="px-6 py-4 flex items-center gap-2 border-b dark:border-zinc-800">
        <img src="/logo.png" alt="NoteMint" className="h-8 w-8" />
        <span className="text-xl font-semibold dark:text-white">NoteMint</span>
      </div>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1 px-4 py-4">
        {/* Spaces Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Spaces
            </p>
            <Button size="icon" variant="ghost" className="h-6 w-6">
              <Plus size={16} />
            </Button>
          </div>

          <div className="space-y-1">
            {spaces.map((space) => (
              <Link
                key={space.id}
                href={`/space/${space.id}`}
                className="block rounded-md px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-300"
              >
                <Folder className="inline-block mr-2 h-4 w-4" />
                {space.name}
              </Link>
            ))}
          </div>
        </div>

        {/* Recents Section */}
        <div className="mt-6">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Recents
          </p>

          <div className="space-y-1">
            {recents.map((item) => (
              <Link
                key={item.id}
                href={item.link}
                className="block rounded-md px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-300"
              >
                <Clock className="inline-block mr-2 h-4 w-4" />
                {item.title}
              </Link>
            ))}
          </div>
        </div>

        {/* Help & Tools */}
        <div className="mt-6 space-y-1">
          <Link
            href="#"
            className="block rounded-md px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-300"
          >
            <HelpCircle className="inline-block mr-2 h-4 w-4" />
            Help & Guides
          </Link>
          <Link
            href="#"
            className="block rounded-md px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-300"
          >
            <Settings className="inline-block mr-2 h-4 w-4" />
            Settings
          </Link>
        </div>
      </ScrollArea>

      {/* Bottom User Section */}
      <div className="border-t dark:border-zinc-800 p-4">
        <Link
          href="/profile"
          className="flex items-center gap-2 text-sm hover:text-emerald-500 dark:text-zinc-300"
        >
          <UserCircle className="h-5 w-5" />
          My Profile
        </Link>
      </div>
    </div>
  );
}
