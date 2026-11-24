"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Settings2, Sparkles, Volume2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface VoiceSettings {
  voice: string;
  rate: string;
  continuousMode: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  voice: "en-IN-NeerjaNeural",
  rate: "+0%",
  continuousMode: true,
};

export const AVAILABLE_VOICES = [
  {
    id: "en-IN-NeerjaNeural",
    name: "Neerja",
    language: "English (India)",
    gender: "Female",
    description: "Recommended for Indian curriculum, clear & natural pronunciation.",
    recommended: true,
  },
  {
    id: "en-IN-PrabhatNeural",
    name: "Prabhat",
    language: "English (India)",
    gender: "Male",
    description: "Natural male Indian English tone.",
  },
  {
    id: "hi-IN-SwaraNeural",
    name: "Swara",
    language: "Hindi",
    gender: "Female",
    description: "Clear Hindi voice, best for Hindi explanations.",
  },
  {
    id: "hi-IN-MadhurNeural",
    name: "Madhur",
    language: "Hindi",
    gender: "Male",
    description: "Male Hindi voice.",
  },
  {
    id: "en-US-JennyNeural",
    name: "Jenny",
    language: "English (US)",
    gender: "Female",
    description: "Standard US English female voice.",
  },
  {
    id: "en-US-GuyNeural",
    name: "Guy",
    language: "English (US)",
    gender: "Male",
    description: "Standard US English male voice.",
  },
];

export const SPEED_OPTIONS = [
  { value: "-15%", label: "0.85x (Slower)" },
  { value: "+0%", label: "1.0x (Normal)" },
  { value: "+20%", label: "1.2x (Faster)" },
];

interface TeacherVoiceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: VoiceSettings;
  onSave: (newSettings: VoiceSettings) => void;
  onPreviewVoice?: (voice: string, rate: string) => Promise<void>;
  isPreviewing?: boolean;
}

export function TeacherVoiceSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSave,
  onPreviewVoice,
  isPreviewing = false,
}: TeacherVoiceSettingsDialogProps) {
  const [selectedVoice, setSelectedVoice] = useState(settings.voice);
  const [selectedRate, setSelectedRate] = useState(settings.rate);
  const [continuous, setContinuous] = useState(settings.continuousMode);

  // Synchronize state whenever dialog opens or settings prop changes
  useEffect(() => {
    if (open) {
      setSelectedVoice(settings.voice);
      setSelectedRate(settings.rate);
      setContinuous(settings.continuousMode);
    }
  }, [open, settings]);

  const handleSave = () => {
    onSave({
      voice: selectedVoice,
      rate: selectedRate,
      continuousMode: continuous,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[85dvh] overflow-y-auto sm:rounded-2xl p-4 sm:p-6">
        <DialogHeader className="gap-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Volume2 className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                Voice & Audio Settings
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground leading-relaxed pt-0.5">
                Configure teacher voice narration, reading speed, and automatic follow-up listening.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 1. Voice Selection */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-sm font-semibold text-foreground block">
                Teacher Voice
              </label>
              {onPreviewVoice && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onPreviewVoice(selectedVoice, selectedRate)}
                  disabled={isPreviewing}
                  className="h-8 text-xs font-semibold gap-1.5 px-3 rounded-xl border-primary/30 hover:bg-primary/10 text-primary cursor-pointer"
                  title="Test selected voice and speed"
                >
                  {isPreviewing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Volume2 className="size-3.5" />
                  )}
                  <span>Test Voice</span>
                </Button>
              )}
            </div>
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {AVAILABLE_VOICES.map((v) => {
                const isSelected = selectedVoice === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVoice(v.id)}
                    className={`w-full text-left p-3.5 rounded-2xl border text-sm transition-all flex items-start justify-between cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/5 dark:bg-primary/10 text-foreground ring-1 ring-primary/40 shadow-xs"
                        : "border-border/70 hover:border-border hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-sm sm:text-base">{v.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                          {v.language} • {v.gender}
                        </span>
                        {v.recommended && (
                          <span className="text-xs px-2 py-0.5 rounded-md bg-primary/15 text-primary font-semibold">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{v.description}</p>
                    </div>
                    {isSelected && <Check className="size-4 text-primary shrink-0 mt-1 ml-2" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Speed Selection */}
          <div>
            <label className="text-sm font-semibold text-foreground block mb-2">
              Speech Speed
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {SPEED_OPTIONS.map((opt) => {
                const isSelected = selectedRate === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedRate(opt.value)}
                    className={`h-10 rounded-xl border text-xs sm:text-sm font-semibold text-center transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                        : "border-border/70 hover:border-border hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Continuous Conversation Mode */}
          <div className="pt-3 border-t border-border/80">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-sm font-semibold text-foreground block">
                  Continuous Conversation
                </span>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-1">
                  Automatically listens for your follow-up questions after the AI Teacher finishes speaking.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={continuous}
                onClick={() => setContinuous(!continuous)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  continuous ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block size-5 transform rounded-full bg-background shadow-md ring-0 transition duration-200 ease-in-out ${
                    continuous ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 4. Browser Compatibility Note */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 text-xs text-muted-foreground leading-relaxed">
            <p className="font-semibold text-foreground mb-1">Using Brave Browser?</p>
            <p>
              Brave disables web speech recognition by default. To enable voice interaction:
              open <code className="text-xs px-1.5 py-0.5 rounded bg-muted font-mono text-foreground">brave://settings/extensions</code> and
              toggle on <strong>&ldquo;Use Google services for speech recognition&rdquo;</strong>, or use Chrome or Microsoft Edge.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end pt-2 border-t mt-1">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl h-10 text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="rounded-xl h-10 text-sm font-semibold"
          >
            Save Preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
