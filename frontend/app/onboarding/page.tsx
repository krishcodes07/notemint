"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";

export default function Onboarding() {
  const { user } = useUser();
  const [step, setStep] = useState(0);

  const [formData, setFormData] = useState({
    name: "",
    class: "",
    subjects: "",
    state: "",
    goal: "",
  });

  const questions = [
    {
      title: "What's your name?",
      description: "So we can personalize your dashboard and experience.",
      input: (
        <Input
          className="h-12"
          placeholder="Enter your name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      ),
    },
    {
      title: "Which class are you studying in?",
      description: "This helps us generate accurate study content.",
      input: (
        <Select
          onValueChange={(val) => setFormData({ ...formData, class: val })}
        >
          <SelectTrigger className="h-12">
            <SelectValue placeholder="Select your class" />
          </SelectTrigger>
          <SelectContent>
            {["6th","7th","8th","9th","10th","11th","12th","College"].map((item) => (
              <SelectItem value={item} key={item}>{item}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      title: "Which subjects do you focus on?",
      description: "We'll suggest personalized resources.",
      input: (
        <Input
          className="h-12"
          placeholder="Eg. Maths, Physics"
          value={formData.subjects}
          onChange={(e) => setFormData({ ...formData, subjects: e.target.value })}
        />
      ),
    },
    {
      title: "Where do you study from?",
      description: "Optional: Helps with localization.",
      input: (
        <Input
          className="h-12"
          placeholder="State (Optional)"
          value={formData.state}
          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
        />
      ),
    },
    {
      title: "What's your current study goal?",
      description: "Helps us personalize your plan and AI tutor.",
      input: (
        <Textarea
          className="min-h-[100px]"
          placeholder="Eg. Prepare for JEE, Boards, CAT..."
          value={formData.goal}
          onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
        />
      ),
    },
  ];

  const handleSubmit = async () => {
    await fetch("http://localhost:8000/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user?.id,
        ...formData,
      }),
    });
    window.location.href = "/dashboard";
  };

  return (
    <div
      className="flex justify-center items-center h-screen px-4 
      bg-gradient-to-br from-zinc-900 via-black to-zinc-900 text-white 
      dark:from-black dark:via-zinc-900 dark:to-black
      relative overflow-hidden"
    >
      {/* Soft Glow Background Element */}
      <div className="absolute w-[600px] h-[600px] bg-teal-900/20 blur-[150px] rounded-full top-1/3 left-1/3 -z-10" />

      {/* Main card with animations */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="w-full max-w-lg"
        >
          <Card className="p-6 bg-black/60 dark:bg-zinc-900/80 text-white shadow-xl rounded-xl border border-zinc-800/50 backdrop-blur-lg">
            <CardHeader className="text-center space-y-2">
              <CardTitle className="text-2xl font-bold">
                {questions[step].title}
              </CardTitle>
              <CardDescription className="text-zinc-400">
                {questions[step].description}
              </CardDescription>
            </CardHeader>

            <CardContent>
              {questions[step].input}
            </CardContent>

            <CardFooter className="flex justify-between mt-4">
              {step > 0 ? (
                <Button variant="outline" onClick={() => setStep(step - 1)}>
                  Previous
                </Button>
              ) : (
                <div />
              )}

              {step < questions.length - 1 ? (
                <Button onClick={() => setStep(step + 1)}>Next</Button>
              ) : (
                <Button onClick={handleSubmit}>Finish</Button>
              )}
            </CardFooter>

            {/* Step indicator */}
            <div className="mt-4 text-center text-sm text-zinc-500">
              Step {step + 1} of {questions.length}
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
