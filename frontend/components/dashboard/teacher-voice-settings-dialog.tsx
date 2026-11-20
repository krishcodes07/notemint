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
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-brand-soft border border-primary/20 flex items-center justify-center text-primary">
              <Settings2 className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">AI Teacher Voice Settings</DialogTitle>
              <DialogDescription className="text-xs">
                Customize Microsoft Edge TTS voice, speed, and continuous conversation.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 1. Voice Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
                Teacher Voice
              </label>
              {onPreviewVoice && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onPreviewVoice(selectedVoice, selectedRate)}
                  disabled={isPreviewing}
                  className="h-7 text-xs gap-1.5 px-2.5 rounded-lg border-primary/30 hover:bg-brand-soft/50 text-primary cursor-pointer"
                  title="Test selected voice and speed"
                >
                  {isPreviewing ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Volume2 className="size-3" />
                  )}
                  <span>Test Voice</span>
                </Button>
              )}
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {AVAILABLE_VOICES.map((v) => {
                const isSelected = selectedVoice === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVoice(v.id)}
                    className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all flex items-start justify-between cursor-pointer ${
                      isSelected
                        ? "border-primary bg-brand-soft/50 text-foreground ring-1 ring-primary/30"
                        : "border-border/80 hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{v.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                          {v.language} • {v.gender}
                        </span>
                        {v.recommended && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium flex items-center gap-1">
                            <Sparkles className="size-2.5" />
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">{v.description}</p>
                    </div>
                    {isSelected && <Check className="size-4 text-primary shrink-0 mt-0.5 ml-2" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Speed Selection */}
          <div>
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider block mb-2">
              Speech Speed
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SPEED_OPTIONS.map((opt) => {
                const isSelected = selectedRate === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedRate(opt.value)}
                    className={`p-2 rounded-xl border text-xs font-medium text-center transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "border-border/80 hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Continuous Conversation Mode */}
          <div className="pt-2 border-t border-border/80">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-foreground block">
                  Continuous Conversation
                </span>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  Automatically listen for your follow-up questions after the AI Teacher finishes speaking.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={continuous}
                onClick={() => setContinuous(!continuous)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  continuous ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block size-4 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                    continuous ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 4. Browser Compatibility Note */}
          <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
            <p className="font-semibold text-foreground mb-0.5">Using Brave Browser?</p>
            <p>
              Brave disables Google speech recognition by default. To enable voice recognition in Brave:
              open <code className="text-[10px] px-1 py-0.5 rounded bg-muted font-mono text-foreground">brave://settings/extensions</code> and
              toggle on <strong>&ldquo;Use Google services for speech recognition&rdquo;</strong>, or open NoteMint in Chrome or Microsoft Edge.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save Preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
