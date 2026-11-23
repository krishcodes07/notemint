"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TeacherChatInputProps {
  onSendMessage: (content: string, fromVoice?: boolean) => void;
  onStopGeneration?: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  onToggleVoiceMode?: () => void;
  isVoiceModeActive?: boolean;
  isListening?: boolean;
  voiceTranscript?: string;
  onVoiceTranscriptHandled?: () => void;
  onUserGesture?: () => void;
}

export function TeacherChatInput({
  onSendMessage,
  onStopGeneration,
  isGenerating,
  disabled = false,
  placeholder = "Ask your AI Teacher anything about this textbook...",
  maxLength = 4000,
  onToggleVoiceMode,
  isVoiceModeActive = false,
  isListening = false,
  voiceTranscript = "",
  onVoiceTranscriptHandled,
  onUserGesture,
}: TeacherChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-resize textarea height up to ~160px
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Real-time transcript sync: type incoming voice words directly into chat box
  useEffect(() => {
    if (isListening && voiceTranscript) {
      setInput(voiceTranscript);

      // Reset 2-second silence timer on new spoken words
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      silenceTimerRef.current = setTimeout(() => {
        const textToSend = voiceTranscript.trim();
        if (textToSend && !isGenerating && !disabled) {
          onUserGesture?.();
          onSendMessage(textToSend, true);
          setInput("");
          onVoiceTranscriptHandled?.();
        }
      }, 2000);
    }
  }, [
    voiceTranscript,
    isListening,
    isGenerating,
    disabled,
    onSendMessage,
    onVoiceTranscriptHandled,
    onUserGesture,
  ]);

  // Clean up silence timer when listening ceases
  useEffect(() => {
    if (!isListening && silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, [isListening]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    onUserGesture?.();
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    const trimmed = input.trim();
    if (!trimmed || isGenerating || disabled) return;
    // Only voice if user was using speech recognition / voice mode
    const fromVoice = isListening || isVoiceModeActive;
    onSendMessage(trimmed, fromVoice);
    setInput("");
    onVoiceTranscriptHandled?.();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const activePlaceholder = isListening
    ? "Listening... speak now (pausing for 2s will send automatically)"
    : placeholder;

  return (
    <div className="relative w-full max-w-4xl mx-auto px-3 sm:px-4 pb-4 shrink-0">
      <div
        className={`relative rounded-2xl border transition-all p-2.5 shadow-sm ${
          isListening
            ? "border-emerald-500/80 bg-emerald-500/5 ring-2 ring-emerald-500/30"
            : "border-border/80 bg-background/95 dark:bg-muted/30 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary"
        }`}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // If user manually edits while listening, reset the silence timer
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={activePlaceholder}
          maxLength={maxLength}
          rows={1}
          className="w-full resize-none bg-transparent px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden disabled:opacity-50 leading-relaxed max-h-40 overflow-y-auto no-scrollbar"
        />

        <div className="flex items-center justify-between pt-1 px-1 text-[11px] text-muted-foreground/70">
          <div className="flex items-center gap-2">
            {isListening ? (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium animate-pulse">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span>Listening... (pausing 2s auto-sends)</span>
              </span>
            ) : (
              <span>Shift + Enter for new line</span>
            )}
            {input.length > 500 && (
              <span>· {input.length} / {maxLength}</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Microphone Button */}
            {onToggleVoiceMode && (
              <Button
                type="button"
                size="sm"
                variant={isListening ? "default" : "ghost"}
                onClick={() => {
                  onUserGesture?.();
                  onToggleVoiceMode();
                }}
                disabled={disabled || isGenerating}
                className={`size-8 p-0 rounded-full transition-all cursor-pointer ${
                  isListening
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm animate-pulse ring-2 ring-emerald-500/40"
                    : isVoiceModeActive
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                }`}
                title={isListening ? "Microphone active — click to stop" : "Speak to AI Teacher"}
              >
                <Mic className="size-4" />
              </Button>
            )}

            {isGenerating ? (
              <Button
                type="button"
                size="sm"
                onClick={onStopGeneration}
                variant="outline"
                className="size-8 p-0 rounded-full bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive hover:text-white transition-colors cursor-pointer"
                title="Stop generation"
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={!input.trim() || disabled}
                className="size-8 p-0 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-30 transition-all cursor-pointer shadow-xs"
                title="Send message (Enter)"
              >
                <ArrowUp className="size-4 stroke-[2.5]" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
