"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Web Speech API interfaces
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: {
        transcript: string;
        confidence: number;
      };
    };
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

interface UseVoiceRecognitionOptions {
  onTranscriptChange?: (text: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  onError?: (errorMessage: string) => void;
  defaultLang?: string;
}

export function useVoiceRecognition(options: UseVoiceRecognitionOptions = {}) {
  const { onTranscriptChange, onFinalTranscript, onError, defaultLang = "en-IN" } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isManuallyStoppedRef = useRef(false);
  const accumulatedFinalRef = useRef("");

  // Check support on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;

      setIsSupported(Boolean(SpeechRecognition));
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    accumulatedFinalRef.current = "";
  }, []);

  const stopListening = useCallback(() => {
    isManuallyStoppedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Recognition might already be stopped
      }
    }
    setIsListening(false);
  }, []);

  const abortListening = useCallback(() => {
    isManuallyStoppedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    setIsListening(false);
    resetTranscript();
  }, [resetTranscript]);

  const startListening = useCallback(
    (langOverride?: string) => {
      setError(null);
      resetTranscript();

      if (typeof window === "undefined") return;

      const SpeechRecognition =
        (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        const msg = "Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.";
        setError(msg);
        onError?.(msg);
        return;
      }

      // Cleanup any previous instance
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = langOverride || defaultLang;

        recognition.onstart = () => {
          isManuallyStoppedRef.current = false;
          setIsListening(true);
          setError(null);
        };

        recognition.onresult = (event: SpeechRecognitionEventLike) => {
          let interim = "";
          let final = accumulatedFinalRef.current;

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const item = event.results[i];
            const text = item[0]?.transcript || "";
            if (item.isFinal) {
              final += (final ? " " : "") + text.trim();
            } else {
              interim += text;
            }
          }

          accumulatedFinalRef.current = final;
          setTranscript(final);
          setInterimTranscript(interim);
          const currentCombined = (final + (interim ? (final ? " " : "") + interim : "")).trim();
          if (currentCombined) {
            onTranscriptChange?.(currentCombined);
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
          if (event.error === "no-speech") {
            // User did not say anything yet, ignore as normal pause
            return;
          }
          if (event.error === "aborted") {
            return;
          }
          let errText = `Speech recognition error: ${event.error}`;
          if (event.error === "not-allowed") {
            errText = "Microphone access was denied. Please allow microphone permission in your browser.";
          } else if (event.error === "audio-capture") {
            errText = "No microphone was found. Please ensure a microphone is connected and enabled.";
          } else if (event.error === "network") {
            // Brave and privacy browsers block Google Speech Recognition by default
            errText =
              "Speech recognition network error: If you are using Brave, enable Google Speech Services under brave://settings/extensions ('Use Google services for speech recognition'), or open NoteMint in Google Chrome or Microsoft Edge.";
          } else if (event.error === "service-not-allowed") {
            errText = "Speech recognition service is not allowed by this browser or operating system.";
          }
          setError(errText);
          onError?.(errText);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
          const finalTotal = accumulatedFinalRef.current.trim();
          if (finalTotal) {
            onFinalTranscript?.(finalTotal);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to start speech recognition.";
        setError(msg);
        onError?.(msg);
        setIsListening(false);
      }
    },
    [defaultLang, onError, onFinalTranscript, resetTranscript],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    abortListening,
    resetTranscript,
  };
}

