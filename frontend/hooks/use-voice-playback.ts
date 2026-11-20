"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseVoicePlaybackOptions {
  onEnded?: () => void;
  onPlay?: () => void;
  onError?: (error: string) => void;
}

// 1-sample silent WAV base64 to unlock browser autoplay on user interaction
const SILENT_WAV_BASE64 =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

export function useVoicePlayback(options: UseVoicePlaybackOptions = {}) {
  const { onEnded, onPlay, onError } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persistent reusable HTMLAudioElement primed during user gestures
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isUnlockedRef = useRef(false);
  const currentBlobUrlRef = useRef<string | null>(null);

  // Queue of audio blobs waiting to play sequentially in real-time stream
  const audioQueueRef = useRef<Blob[]>([]);
  const isStreamCompleteRef = useRef(false);
  const inFlightCountRef = useRef(0);
  const isPlayingRef = useRef(false);
  const playbackRateRef = useRef(1.0);

  // Safely cleanup active blob URL
  const cleanupBlobUrl = useCallback(() => {
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
  }, []);

  // Initialize persistent Audio instance on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const audio = new Audio();
      audio.preload = "auto";
      audioRef.current = audio;
    }

    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.src = "";
        } catch {}
      }
      cleanupBlobUrl();
      audioQueueRef.current = [];
    };
  }, [cleanupBlobUrl]);

  /**
   * Unlock browser audio autoplay policy during a synchronous user gesture
   * (e.g. clicking Send, clicking Mic, pressing Enter, or clicking Listen).
   */
  const unlock = useCallback(() => {
    if (isUnlockedRef.current) return;
    try {
      if (!audioRef.current && typeof window !== "undefined") {
        audioRef.current = new Audio();
      }
      if (audioRef.current) {
        audioRef.current.src = SILENT_WAV_BASE64;
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              isUnlockedRef.current = true;
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
              }
            })
            .catch(() => {
              // Ignore unlock error; will retry on next user click
            });
        }
      }
    } catch {
      // Autoplay unlock fallback
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = "";
      } catch {}
    }
    cleanupBlobUrl();
    audioQueueRef.current = [];
    isStreamCompleteRef.current = false;
    inFlightCountRef.current = 0;
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    setIsLoading(false);
  }, [cleanupBlobUrl]);

  const pause = useCallback(() => {
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      setIsPaused(true);
    }
  }, [isPlaying]);

  const resume = useCallback(() => {
    if (audioRef.current && isPaused) {
      audioRef.current.play().then(
        () => {
          setIsPlaying(true);
          setIsPaused(false);
        },
        (err) => {
          const msg = err instanceof Error ? err.message : "Failed to resume audio playback.";
          setError(msg);
          onError?.(msg);
        },
      );
    }
  }, [isPaused, onError]);

  // Plays the next blob from the audio queue
  const playNextInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsPaused(false);
      cleanupBlobUrl();

      // If the LLM has finished streaming and the audio queue is exhausted
      // AND no more synthesis requests are in flight, turn is complete!
      if (isStreamCompleteRef.current && inFlightCountRef.current === 0) {
        isStreamCompleteRef.current = false;
        onEnded?.();
      }
      return;
    }

    const nextBlob = audioQueueRef.current.shift()!;
    cleanupBlobUrl();

    try {
      const blobUrl = URL.createObjectURL(nextBlob);
      currentBlobUrlRef.current = blobUrl;

      // Reuse persistent audio element
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audioRef.current = audio;
      }

      audio.src = blobUrl;
      audio.playbackRate = playbackRateRef.current;

      audio.onplay = () => {
        isPlayingRef.current = true;
        setIsPlaying(true);
        setIsPaused(false);
        onPlay?.();
      };

      audio.onended = () => {
        playNextInQueue();
      };

      audio.onerror = () => {
        console.warn("Audio chunk playback error, advancing to next chunk.");
        playNextInQueue();
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err: unknown) => {
          console.warn("Audio play() caught error (autoplay policy or interruption):", err);
          // Advance queue gracefully rather than crashing voice mode
          playNextInQueue();
        });
      }
    } catch (err: unknown) {
      console.warn("Failed to set audio blob source:", err);
      playNextInQueue();
    }
  }, [cleanupBlobUrl, onEnded, onPlay]);

  // Register that a new speech synthesis request is in flight
  const registerInFlight = useCallback(() => {
    inFlightCountRef.current += 1;
  }, []);

  // Decrement in-flight count (e.g. if network request failed)
  const decrementInFlight = useCallback(() => {
    inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1);
    if (
      isStreamCompleteRef.current &&
      !isPlayingRef.current &&
      audioQueueRef.current.length === 0 &&
      inFlightCountRef.current === 0
    ) {
      isStreamCompleteRef.current = false;
      setIsPlaying(false);
      onEnded?.();
    }
  }, [onEnded]);

  // Enqueue a real-time synthesized sentence audio blob
  const enqueueBlob = useCallback(
    (blob: Blob, fromInFlight: boolean = false) => {
      if (fromInFlight) {
        inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1);
      }
      audioQueueRef.current.push(blob);

      // If not currently playing anything, start playing the queue immediately
      if (!isPlayingRef.current) {
        isPlayingRef.current = true;
        playNextInQueue();
      }
    },
    [playNextInQueue],
  );

  // Notify that LLM generation has finished and no more chunks will be enqueued
  const notifyStreamComplete = useCallback(() => {
    isStreamCompleteRef.current = true;
    // If nothing is playing, queue is empty, and no requests are in flight, trigger onEnded
    if (
      !isPlayingRef.current &&
      audioQueueRef.current.length === 0 &&
      inFlightCountRef.current === 0
    ) {
      isStreamCompleteRef.current = false;
      setIsPlaying(false);
      onEnded?.();
    }
  }, [onEnded]);

  // Play a single standalone blob (legacy/direct message playback)
  const playBlob = useCallback(
    async (blob: Blob) => {
      stop();
      enqueueBlob(blob, false);
      notifyStreamComplete();
    },
    [stop, enqueueBlob, notifyStreamComplete],
  );

  return {
    isPlaying,
    isPaused,
    isLoading,
    error,
    unlock,
    registerInFlight,
    decrementInFlight,
    enqueueBlob,
    notifyStreamComplete,
    playBlob,
    pause,
    resume,
    stop,
  };
}
