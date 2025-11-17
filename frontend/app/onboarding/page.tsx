"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import clsx from "clsx";

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
      description: "Tell us how you'd like to be addressed.",
      input: (
        <Input
          placeholder="Enter your name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      ),
    },
    {
      title: "Which class do you study in?",
      description: "This helps us generate accurate notes.",
      input: (
        <Select
          onValueChange={(val) => setFormData({ ...formData, class: val })}
        >
          <SelectTrigger>
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
      description: "This helps improve recommendations.",
      input: (
        <Input
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
          placeholder="State (Optional)"
          value={formData.state}
          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
        />
      ),
    },
    {
      title: "What's your current study goal?",
      description: "Optional: Helps personalize your AI teacher.",
      input: (
        <Textarea
          placeholder="Eg. Prepare for Class 10 Boards"
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
        userId: user?.id,   // <-- MUST BE HERE
        ...formData,
      }),
    });

    window.location.href = "/dashboard";
};


  return (
    <div className="flex justify-center items-center h-screen px-4">
      <Card className="w-full max-w-md p-2 overflow-hidden relative">
        <CardHeader>
          <CardTitle>{questions[step].title}</CardTitle>
          <CardDescription>{questions[step].description}</CardDescription>
        </CardHeader>

        <CardContent>
          <div
            className={clsx(
              "transform transition-all duration-300",
              step === 0 ? "" : "translate-x-0"
            )}
          >
            {questions[step].input}
          </div>
        </CardContent>

        <CardFooter className="flex justify-between">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              Previous
            </Button>
          ) : (
            <div></div>
          )}

          {step < questions.length - 1 ? (
            <Button onClick={() => setStep(step + 1)}>Next</Button>
          ) : (
            <Button onClick={handleSubmit}>Finish</Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
