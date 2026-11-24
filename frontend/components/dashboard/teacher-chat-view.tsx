"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  History,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Sparkles,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DocumentResponse,
  ExplanationDepth,
  GetSessionToken,
  PreferredLanguage,
  TeacherConversationDetailResponse,
  TeacherConversationResponse,
  TeacherMessageResponse,
  TeachingMode,
  createTeacherConversation,
  deleteTeacherConversation,
  fetchStreamingSpeechBlob,
  fetchTeacherSpeechBlob,
  getTeacherConversation,
  listTeacherConversations,
  retryTeacherMessage,
  sendTeacherMessage,
  streamTeacherMessage,
  updateTeacherConversation,
} from "@/lib/api";
import { TeacherMessage } from "@/components/dashboard/teacher-message";
import { TeacherChatInput } from "@/components/dashboard/teacher-chat-input";
import { TeacherModeSelector } from "@/components/dashboard/teacher-mode-selector";
import { TeacherConversationList } from "@/components/dashboard/teacher-conversation-list";
import { useVoiceRecognition } from "@/hooks/use-voice-recognition";
import { useVoicePlayback } from "@/hooks/use-voice-playback";
import {
  DEFAULT_VOICE_SETTINGS,
  TeacherVoiceSettingsDialog,
  VoiceSettings,
} from "@/components/dashboard/teacher-voice-settings-dialog";

interface TeacherChatViewProps {
  document: DocumentResponse;
  documentTitle?: string;
  getToken: GetSessionToken;
  onOpenPdf: (page: number) => void;
}

const STARTER_PROMPTS = [
  "Explain this chapter in simple words.",
  "What are the most important concepts to remember?",
  "Help me understand a difficult topic from this textbook.",
  "Test my understanding with a conceptual doubt.",
];

let messageIdSequence = 0;
function createClientMessageId(): string {
  messageIdSequence += 1;
  return `cli_${Date.now()}_${messageIdSequence}`;
}
function createTempMessageId(prefix: string): string {
  messageIdSequence += 1;
  return `${prefix}_${Date.now()}_${messageIdSequence}`;
}
function getCurrentIsoTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Extract completed sentences from an accumulated token buffer for real-time streaming TTS.
 * Only splits on full sentence boundaries (.?!। followed by space/line) or double newlines.
 * Never cuts on commas or within mid-sentence phrases.
 */
function extractSentencesFromBuffer(buffer: string): { completed: string[]; remainder: string } {
  const sentenceRegex = /^([\s\S]*?[.?!।]+(?:\s+|$)|[\s\S]*?\n\n+)([\s\S]*)$/;
  const completed: string[] = [];
  let current = buffer;

  while (true) {
    const match = current.match(sentenceRegex);
    if (!match) break;
    const sentence = match[1].trim();
    if (sentence.length > 0) {
      completed.push(sentence);
    }
    current = match[2];
  }

  return { completed, remainder: current };
}

export function TeacherChatView({
  document,
  documentTitle,
  getToken,
  onOpenPdf,
}: TeacherChatViewProps) {
  const resolvedTitle =
    documentTitle?.trim() ||
    document.title?.trim() ||
    document.original_filename.replace(/\.pdf$/i, "");
  const [conversations, setConversations] = useState<TeacherConversationResponse[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeConv, setActiveConv] = useState<TeacherConversationDetailResponse | null>(null);

  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRetrying, setIsRetrying] = useState<string | null>(null);

  // Streaming state
  const [streamingText, setStreamingText] = useState("");
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sidebar / Drawer toggle for conversations
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);

  // Voice Conversation Mode State (Phase 9.1)
  const [voiceModeActive, setVoiceModeActive] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const [showVoiceSettingsDialog, setShowVoiceSettingsDialog] = useState(false);

  // On-demand message audio state
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [loadingSpeechMessageId, setLoadingSpeechMessageId] = useState<string | null>(null);

  // Load persisted voice settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("notemint_voice_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.voice) {
          setVoiceSettings(parsed);
        }
      }
    } catch {}
  }, []);

  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const voiceSettingsRef = useRef(voiceSettings);
  useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
  }, [voiceSettings]);

  const handleSaveVoiceSettings = useCallback((newSettings: VoiceSettings) => {
    setVoiceSettings(newSettings);
    voiceSettingsRef.current = newSettings;
    try {
      localStorage.setItem("notemint_voice_settings", JSON.stringify(newSettings));
    } catch {}
  }, []);

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = messagesContainerRef.current;
    if (el) {
      if (smooth) {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: "smooth",
        });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, []);

  // Forward ref for handleSendMessage so hooks can invoke it before declaration
  const handleSendMessageRef = useRef<((content: string, fromVoice?: boolean) => Promise<void>) | null>(null);

  // Voice Playback Hook
  const voicePlayback = useVoicePlayback({
    onEnded: () => {
      setPlayingMessageId(null);
      if (voiceModeActive && voiceSettings.continuousMode) {
        setVoiceTranscript("");
        voiceRecognition.resetTranscript();
        // Pause 250ms before restarting speech recognition to avoid catching room reverb
        setTimeout(() => {
          voiceRecognition.startListening();
        }, 250);
      } else {
        setVoiceModeActive(false);
        setVoiceTranscript("");
      }
    },
    onError: (err) => {
      console.error("Audio playback error:", err);
      setPlayingMessageId(null);
      setVoiceModeActive(false);
      setVoiceTranscript("");
    },
  });

  const handlePreviewVoice = useCallback(async (voice: string, rate: string) => {
    voicePlayback.unlock();
    voicePlayback.stop();
    setIsPreviewingVoice(true);
    try {
      const sampleText = voice.startsWith("hi-")
        ? "नमस्ते! मैं आपका एआई शिक्षक हूँ।"
        : "Hello! I am your AI Teacher. How can I help you today?";
      const previewBlob = await fetchStreamingSpeechBlob(
        document.id,
        activeConvId ?? conversations[0]?.id ?? "",
        sampleText,
        { voice, rate },
        getToken
      );
      await voicePlayback.playBlob(previewBlob);
    } catch (err: unknown) {
      console.warn("Preview voice synthesis failed:", err);
    } finally {
      setIsPreviewingVoice(false);
    }
  }, [document.id, activeConvId, conversations, getToken, voicePlayback]);

  // Voice Recognition Hook
  const voiceRecognition = useVoiceRecognition({
    defaultLang: "en-IN",
    onTranscriptChange: (text) => {
      setVoiceTranscript(text);
    },
    onFinalTranscript: (text) => {
      setVoiceTranscript(text);
    },
    onError: (errMsg) => {
      setBannerError(errMsg);
      setVoiceModeActive(false);
      setVoiceTranscript("");
    },
  });

  // 1. Load initial conversations for this document
  useEffect(() => {
    let isCancelled = false;

    async function init() {
      try {
        const res = await listTeacherConversations(document.id, getToken);
        if (isCancelled) return;
        setConversations(res.items);

        if (res.items.length > 0) {
          setActiveConvId((prev) => prev ?? res.items[0].id);
        } else {
          const newConv = await createTeacherConversation(
            document.id,
            { title: "Conversation 1" },
            getToken
          );
          if (isCancelled) return;
          setConversations([newConv]);
          setActiveConvId(newConv.id);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          setInitError(
            err instanceof Error
              ? err.message
              : "Failed to load chat history. Please verify backend connection."
          );
        }
      } finally {
        if (!isCancelled) {
          setLoadingConversations(false);
        }
      }
    }

    void init();

    return () => {
      isCancelled = true;
    };
  }, [document.id, getToken]);

  // 2. Fetch full conversation messages whenever activeConvId changes
  useEffect(() => {
    if (!activeConvId) return;

    let isCancelled = false;
    setLoadingMessages(true);

    async function fetchDetail() {
      try {
        if (!activeConvId) return;
        const detail = await getTeacherConversation(
          document.id,
          activeConvId,
          getToken
        );
        if (isCancelled) return;
        setActiveConv(detail);
        setBannerError(null);
        setTimeout(() => scrollToBottom(false), 50);
      } catch (err: unknown) {
        if (!isCancelled) {
          setBannerError(
            err instanceof Error ? err.message : "Failed to load conversation messages."
          );
        }
      } finally {
        if (!isCancelled) {
          setLoadingMessages(false);
        }
      }
    }

    void fetchDetail();

    return () => {
      isCancelled = true;
    };
  }, [activeConvId, document.id, getToken, scrollToBottom]);

  // Scroll to bottom on new messages (smooth)
  useEffect(() => {
    scrollToBottom(true);
  }, [activeConv?.messages.length, scrollToBottom]);

  // Scroll to bottom during streaming (instant to avoid jerky animation frames)
  useEffect(() => {
    if (streamingText) {
      scrollToBottom(false);
    }
  }, [streamingText, scrollToBottom]);

  // 3. New conversation creation
  const handleNewConversation = async () => {
    if (isGenerating) return;

    voicePlayback.stop();
    voiceRecognition.abortListening();
    setVoiceModeActive(false);
    setVoiceTranscript("");

    try {
      const nextIndex = conversations.length + 1;
      const newConv = await createTeacherConversation(
        document.id,
        {
          title: `Conversation ${nextIndex}`,
          teaching_mode: "explain",
          explanation_depth: "standard",
          preferred_language: "auto",
        },
        getToken
      );
      setConversations((prev) => [newConv, ...prev]);
      setActiveConvId(newConv.id);
      setActiveConv({
        ...newConv,
        messages: [],
      });
      setBannerError(null);
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : "Failed to create new conversation.");
    }
  };

  // 4. Rename conversation
  const handleRenameConversation = async (conversationId: string, newTitle: string) => {
    try {
      const updated = await updateTeacherConversation(
        document.id,
        conversationId,
        { title: newTitle },
        getToken
      );
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, title: updated.title } : c))
      );
      if (activeConvId === conversationId) {
        setActiveConv((prev) => (prev ? { ...prev, title: updated.title } : null));
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to rename conversation.");
    }
  };

  // 5. Delete conversation
  const handleDeleteConversation = async (conversationId: string) => {
    try {
      await deleteTeacherConversation(document.id, conversationId, getToken);
      const remaining = conversations.filter((c) => c.id !== conversationId);
      setConversations(remaining);

      if (activeConvId === conversationId) {
        if (remaining.length > 0) {
          setActiveConvId(remaining[0].id);
        } else {
          setActiveConvId(null);
          setActiveConv(null);
          void handleNewConversation();
        }
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete conversation.");
    }
  };

  // 6. Update mode / depth / language
  const handleUpdateSettings = async (settings: {
    teaching_mode?: TeachingMode;
    explanation_depth?: ExplanationDepth;
    preferred_language?: PreferredLanguage;
  }) => {
    if (!activeConvId) return;
    try {
      const updated = await updateTeacherConversation(
        document.id,
        activeConvId,
        {
          teaching_mode: settings.teaching_mode,
          explanation_depth: settings.explanation_depth,
          preferred_language: settings.preferred_language,
        },
        getToken
      );
      setActiveConv((prev) =>
        prev
          ? {
              ...prev,
              teaching_mode: updated.teaching_mode,
              explanation_depth: updated.explanation_depth,
              preferred_language: updated.preferred_language,
            }
          : null
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConvId
            ? {
                ...c,
                teaching_mode: updated.teaching_mode,
                explanation_depth: updated.explanation_depth,
                preferred_language: updated.preferred_language,
              }
            : c
        )
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update teacher settings.");
    }
  };

  // 7. Send message handler (Supporting Streaming + Fallback + Edge TTS Voice Playback)
  const handleSendMessage = async (content: string, fromVoice = false) => {
    if (isGenerating) return;

    // Reset voice transcript & stop listening while generating (Echo prevention)
    setVoiceTranscript("");
    if (fromVoice || voiceModeActive) {
      voiceRecognition.stopListening();
      voicePlayback.stop();
    }

    let targetConvId = activeConvId;
    if (!targetConvId) {
      try {
        const title = content.slice(0, 30) + (content.length > 30 ? "..." : "");
        const newConv = await createTeacherConversation(
          document.id,
          {
            title: title || "New Conversation",
            teaching_mode: "explain",
            explanation_depth: "standard",
            preferred_language: "auto",
          },
          getToken
        );
        targetConvId = newConv.id;
        setActiveConvId(newConv.id);
        setActiveConv({
          ...newConv,
          messages: [],
        });
        setConversations((prev) => [newConv, ...prev]);
      } catch (err: unknown) {
        setBannerError(err instanceof Error ? err.message : "Failed to initialize conversation.");
        return;
      }
    }

    const clientMsgId = createClientMessageId();
    const tempUserMsg: TeacherMessageResponse = {
      id: createTempMessageId("temp_user"),
      conversation_id: targetConvId,
      role: "user",
      content,
      source_pages: null,
      model_name: null,
      input_tokens: null,
      output_tokens: null,
      status: "completed",
      error_message: null,
      client_message_id: clientMsgId,
      created_at: getCurrentIsoTimestamp(),
    };

    // Optimistically add user message
    setActiveConv((prev) =>
      prev
        ? {
            ...prev,
            messages: [...prev.messages, tempUserMsg],
            message_count: prev.message_count + 1,
          }
        : {
            id: targetConvId,
            document_id: document.id,
            clerk_user_id: "",
            title: "New Conversation",
            teaching_mode: "explain",
            explanation_depth: "standard",
            preferred_language: "auto",
            message_count: 1,
            created_at: getCurrentIsoTimestamp(),
            updated_at: getCurrentIsoTimestamp(),
            messages: [tempUserMsg],
          }
    );

    setIsGenerating(true);
    setStreamingText("");
    setStreamingAssistantId(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let sentenceBuffer = "";
    const isVoiceTurn = fromVoice || voiceModeActive;

    // Strict sequential chunk manager to guarantee in-order speech playback
    let chunkCounter = 0;
    let nextExpectedIndex = 0;
    const pendingBlobs = new Map<number, Blob>();

    const deliverOrderedChunk = (index: number, blob: Blob) => {
      pendingBlobs.set(index, blob);
      while (pendingBlobs.has(nextExpectedIndex)) {
        const nextBlob = pendingBlobs.get(nextExpectedIndex)!;
        pendingBlobs.delete(nextExpectedIndex);
        voicePlayback.enqueueBlob(nextBlob, true);
        nextExpectedIndex++;
      }
    };

    const skipFailedIndex = (index: number) => {
      voicePlayback.decrementInFlight();
      if (index === nextExpectedIndex) {
        nextExpectedIndex++;
        while (pendingBlobs.has(nextExpectedIndex)) {
          const nextBlob = pendingBlobs.get(nextExpectedIndex)!;
          pendingBlobs.delete(nextExpectedIndex);
          voicePlayback.enqueueBlob(nextBlob, true);
          nextExpectedIndex++;
        }
      }
    };

    try {
      // Stream via Server-Sent Events with voice mode flag
      await streamTeacherMessage(
        document.id,
        targetConvId,
        {
          content,
          client_message_id: clientMsgId,
          is_voice_mode: isVoiceTurn,
        },
        getToken,
        {
          onStarted: (data) => {
            setStreamingAssistantId(data.assistant_message_id);
          },
          onDelta: (delta) => {
            setStreamingText((prev) => prev + delta);

            // Real-time streaming TTS: synthesize sentence by sentence as generated in strict order!
            if (isVoiceTurn) {
              sentenceBuffer += delta;
              const { completed, remainder } = extractSentencesFromBuffer(sentenceBuffer);
              sentenceBuffer = remainder;

              for (const sentence of completed) {
                const cleanSentence = sentence.replace(/\[Pages?\s+[0-9,\s\-]+\]/gi, "").trim();
                if (cleanSentence && /[a-zA-Z0-9\u0900-\u097F]/.test(cleanSentence)) {
                  const currentIndex = chunkCounter++;
                  voicePlayback.registerInFlight();
                  void fetchStreamingSpeechBlob(
                    document.id,
                    targetConvId,
                    cleanSentence,
                    { voice: voiceSettingsRef.current.voice, rate: voiceSettingsRef.current.rate },
                    getToken,
                    controller.signal
                  )
                    .then((blob) => {
                      deliverOrderedChunk(currentIndex, blob);
                    })
                    .catch((err) => {
                      skipFailedIndex(currentIndex);
                      if (!controller.signal.aborted) {
                        console.warn("Real-time sentence TTS failed:", err);
                      }
                    });
                }
              }
            }
          },
          onCompleted: async (finalMessage) => {
            setActiveConv((prev) => {
              if (!prev) return null;
              const filtered = prev.messages.filter(
                (m) => m.id !== tempUserMsg.id && m.id !== finalMessage.id
              );
              return {
                ...prev,
                messages: [...filtered, tempUserMsg, finalMessage],
                message_count: prev.message_count + 1,
              };
            });
            setStreamingText("");
            setStreamingAssistantId(null);

            // Flush any final remainder sentence to audio queue
            if (isVoiceTurn) {
              const finalRemainder = sentenceBuffer.replace(/\[Pages?\s+[0-9,\s\-]+\]/gi, "").trim();
              if (finalRemainder && /[a-zA-Z0-9\u0900-\u097F]/.test(finalRemainder)) {
                const currentIndex = chunkCounter++;
                voicePlayback.registerInFlight();
                void fetchStreamingSpeechBlob(
                  document.id,
                  targetConvId,
                  finalRemainder,
                  { voice: voiceSettingsRef.current.voice, rate: voiceSettingsRef.current.rate },
                  getToken,
                  controller.signal
                )
                  .then((remainderBlob) => {
                    deliverOrderedChunk(currentIndex, remainderBlob);
                  })
                  .catch((err) => {
                    skipFailedIndex(currentIndex);
                    console.warn("Final remainder speech chunk failed:", err);
                  });
              }
              // Signal that all streaming chunks have been dispatched
              voicePlayback.notifyStreamComplete();
            }
          },
          onError: (errMsg) => {
            setBannerError(errMsg);
            setVoiceModeActive(false);
            voicePlayback.stop();
          },
        },
        controller.signal
      );
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      console.warn("SSE stream failed, attempting non-streaming fallback...", err);

      try {
        const assistantMsg = await sendTeacherMessage(
          document.id,
          targetConvId,
          {
            content,
            client_message_id: clientMsgId,
            is_voice_mode: isVoiceTurn,
          },
          getToken
        );
        setActiveConv((prev) => {
          if (!prev) return null;
          const filtered = prev.messages.filter(
            (m) => m.id !== tempUserMsg.id && m.id !== assistantMsg.id
          );
          return {
            ...prev,
            messages: [...filtered, tempUserMsg, assistantMsg],
            message_count: prev.message_count + 1,
          };
        });

        if (isVoiceTurn) {
          try {
            const speechBlob = await fetchTeacherSpeechBlob(
              document.id,
              targetConvId,
              assistantMsg.id,
              { voice: voiceSettingsRef.current.voice, rate: voiceSettingsRef.current.rate },
              getToken
            );
            await voicePlayback.playBlob(speechBlob);
          } catch (speechErr: unknown) {
            console.error("Speech synthesis failed:", speechErr);
            if (voiceSettingsRef.current.continuousMode) {
              setTimeout(() => voiceRecognition.startListening(), 200);
            } else {
              setVoiceModeActive(false);
            }
          }
        }
      } catch (fallbackErr: unknown) {
        const errorText =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : err instanceof Error
            ? err.message
            : "Failed to receive response from AI Teacher.";

        const failedMsg: TeacherMessageResponse = {
          id: createTempMessageId("failed"),
          conversation_id: targetConvId,
          role: "assistant",
          content: "",
          source_pages: null,
          model_name: null,
          input_tokens: null,
          output_tokens: null,
          status: "failed",
          error_message: errorText,
          client_message_id: null,
          created_at: getCurrentIsoTimestamp(),
        };

        setActiveConv((prev) =>
          prev
            ? {
                ...prev,
                messages: [...prev.messages, failedMsg],
              }
            : null
        );
        setVoiceModeActive(false);
        voicePlayback.stop();
      }
    } finally {
      setIsGenerating(false);
      setStreamingText("");
      setStreamingAssistantId(null);
      abortControllerRef.current = null;
      setTimeout(() => scrollToBottom(true), 50);
    }
  };

  handleSendMessageRef.current = handleSendMessage;

  // 8. Stop generation handler
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setStreamingText("");
    setStreamingAssistantId(null);
    voicePlayback.stop();
  };

  // 9. Retry message handler
  const handleRetryMessage = async (messageId: string) => {
    if (!activeConvId || isGenerating) return;
    setIsRetrying(messageId);
    try {
      const updatedAssistantMsg = await retryTeacherMessage(
        document.id,
        activeConvId,
        messageId,
        getToken
      );
      setActiveConv((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === messageId ? updatedAssistantMsg : m
          ),
        };
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to retry response.");
    } finally {
      setIsRetrying(null);
    }
  };

  // 10. On-demand message speech synthesis & playback
  const handlePlayMessageSpeech = async (messageId: string) => {
    voicePlayback.unlock();
    if (playingMessageId === messageId && voicePlayback.isPlaying) {
      voicePlayback.stop();
      setPlayingMessageId(null);
      return;
    }

    if (!activeConvId) return;

    voicePlayback.stop();
    setLoadingSpeechMessageId(messageId);
    try {
      const speechBlob = await fetchTeacherSpeechBlob(
        document.id,
        activeConvId,
        messageId,
        { voice: voiceSettingsRef.current.voice, rate: voiceSettingsRef.current.rate },
        getToken
      );
      setPlayingMessageId(messageId);
      await voicePlayback.playBlob(speechBlob);
    } catch (err: unknown) {
      console.error("Failed to synthesize speech for message:", err);
      setBannerError(
        err instanceof Error ? err.message : "Failed to synthesize speech."
      );
    } finally {
      setLoadingSpeechMessageId(null);
    }
  };

  // 11. Voice Mode Handlers
  const handleToggleVoiceMode = useCallback(() => {
    voicePlayback.unlock();
    if (voiceModeActive || voiceRecognition.isListening) {
      voiceRecognition.abortListening();
      voicePlayback.stop();
      setVoiceModeActive(false);
      setVoiceTranscript("");
    } else {
      if (!voiceRecognition.isSupported) {
        setBannerError(
          "Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari."
        );
        return;
      }
      setVoiceModeActive(true);
      setVoiceTranscript("");
      voiceRecognition.startListening();
    }
  }, [voiceModeActive, voiceRecognition, voicePlayback]);

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 max-w-4xl mx-auto w-full no-scrollbar">
      {/* 1. Header Toolbar (Borderless, minimal, clean) */}
      <div className="flex items-center justify-between px-1.5 sm:px-2 py-1.5 sm:py-2 mb-1 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          {/* Conversation Drawer Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistoryDialog(true)}
            className="h-8 gap-1 sm:gap-1.5 px-2 sm:px-2.5 text-xs rounded-xl border-border/80 hover:bg-muted/60 shrink-0"
            title="Chat History"
          >
            <History className="size-3.5 text-muted-foreground" />
            <span className="hidden sm:inline font-medium">History</span>
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground font-mono">
              {conversations.length}
            </span>
          </Button>

          {/* Active Conversation Title */}
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs font-semibold text-foreground truncate max-w-[85px] sm:max-w-[260px]">
              {activeConv?.title ?? "AI Teacher"}
            </span>
          </div>
        </div>

        {/* Right Settings & Controls */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Voice Settings button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowVoiceSettingsDialog(true)}
            className="size-8 p-0 text-muted-foreground hover:text-foreground rounded-xl shrink-0"
            title="AI Teacher Voice Settings"
          >
            <Volume2 className="size-3.5" />
          </Button>

          {activeConv && (
            <TeacherModeSelector
              mode={activeConv.teaching_mode}
              depth={activeConv.explanation_depth}
              language={activeConv.preferred_language}
              onUpdateSettings={handleUpdateSettings}
              disabled={isGenerating}
            />
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewConversation}
            disabled={isGenerating}
            className="h-8 px-2 sm:px-2.5 text-xs text-primary hover:bg-brand-soft/50 rounded-xl gap-1 shrink-0"
            title="New Conversation"
          >
            <MessageSquarePlus className="size-3.5" />
            <span className="hidden sm:inline">New</span>
          </Button>
        </div>
      </div>

      {/* 2. Message Thread Area (Completely borderless with scrollbar hidden) */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-2 sm:px-4 py-2 space-y-3 no-scrollbar"
      >
        {initError ? (
          <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center py-16 px-4">
            <div className="size-12 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mb-3.5 shadow-xs">
              <AlertCircle className="size-6" />
            </div>
            <h3 className="text-sm sm:text-base font-semibold text-foreground">
              Unable to load conversation
            </h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4 leading-relaxed">
              {initError}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLoadingConversations(true);
                setInitError(null);
                listTeacherConversations(document.id, getToken)
                  .then((res) => setConversations(res.items))
                  .catch(() => setInitError("Still unable to connect."))
                  .finally(() => setLoadingConversations(false));
              }}
              className="gap-1.5 text-xs rounded-xl cursor-pointer"
            >
              <RotateCcw className="size-3.5" />
              <span>Try Again</span>
            </Button>
          </div>
        ) : loadingConversations || (loadingMessages && !activeConv) ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16 text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary mb-2" />
            <p className="text-xs">Loading AI Teacher workspace...</p>
          </div>
        ) : (!activeConv || activeConv.messages.length === 0) && !isGenerating ? (
          /* Welcome Empty State */
          <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center py-10 px-4">
            <h3 className="text-base sm:text-lg font-bold text-foreground">
              Ask anything about your study material.
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Your AI Teacher is ready to explain concepts, clear doubts, and help you understand{" "}
              <strong className="text-foreground font-medium">
                {resolvedTitle}
              </strong>
              .
            </p>

            {/* Prompt Starter Chips */}
            <div className="w-full mt-6 space-y-2.5 text-left">
              <p className="text-xs font-semibold text-muted-foreground px-1">
                Suggested questions to get started:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSendMessage(prompt)}
                    className="p-3.5 rounded-xl border border-border/80 bg-muted/20 hover:bg-primary/5 hover:border-primary/40 text-xs sm:text-sm font-medium text-foreground transition-all cursor-pointer text-left shadow-2xs group flex items-start gap-2.5"
                  >
                    <Lightbulb className="size-4 text-primary shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Active Messages Thread */
          <div className="max-w-4xl mx-auto w-full">
            {activeConv?.messages.map((msg) => (
              <TeacherMessage
                key={msg.id}
                message={msg}
                onOpenPdf={onOpenPdf}
                onRetry={handleRetryMessage}
                isRetrying={isRetrying === msg.id}
                onPlaySpeech={handlePlayMessageSpeech}
                isPlayingSpeech={playingMessageId === msg.id && voicePlayback.isPlaying}
                isLoadingSpeech={loadingSpeechMessageId === msg.id}
              />
            ))}

            {/* Live Streaming Delta Message (Completely borderless) */}
            {isGenerating && streamingText && (
              <TeacherMessage
                message={{
                  id: streamingAssistantId ?? "streaming_active",
                  conversation_id: activeConvId ?? "",
                  role: "assistant",
                  content: streamingText,
                  source_pages: null,
                  model_name: null,
                  input_tokens: null,
                  output_tokens: null,
                  status: "completed",
                  error_message: null,
                  client_message_id: null,
                  created_at: new Date().toISOString(),
                }}
                onOpenPdf={onOpenPdf}
              />
            )}

            {/* Thinking Pulsating Indicator (Completely borderless, no container box) */}
            {isGenerating && !streamingText && (
              <div className="flex gap-3 my-4 pr-4 sm:pr-8 items-start">
                <div className="size-8 rounded-full bg-brand-soft border border-primary/20 flex items-center justify-center shrink-0 mt-0.5 text-primary shadow-xs">
                  <Sparkles className="size-4" />
                </div>
                <div className="pt-1.5 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>AI Teacher is reviewing your textbook to craft an answer...</span>
                </div>
              </div>
            )}

            <div className="h-2" />
          </div>
        )}
      </div>

      {/* Banner Error Notification */}
      {bannerError && (
        <div className="mx-4 mb-2 flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{bannerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            className="text-xs font-semibold hover:underline cursor-pointer ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3. Bottom Chat Composer with integrated mic & real-time speech typing */}
      <TeacherChatInput
        onSendMessage={handleSendMessage}
        onStopGeneration={handleStopGeneration}
        isGenerating={isGenerating}
        disabled={loadingConversations || loadingMessages || !!initError}
        onToggleVoiceMode={handleToggleVoiceMode}
        isVoiceModeActive={voiceModeActive}
        isListening={voiceRecognition.isListening}
        voiceTranscript={voiceTranscript}
        onVoiceTranscriptHandled={() => setVoiceTranscript("")}
        onUserGesture={() => voicePlayback.unlock()}
      />

      {/* 4. Voice Settings Dialog */}
      <TeacherVoiceSettingsDialog
        open={showVoiceSettingsDialog}
        onOpenChange={setShowVoiceSettingsDialog}
        settings={voiceSettings}
        onSave={handleSaveVoiceSettings}
        onPreviewVoice={handlePreviewVoice}
        isPreviewing={isPreviewingVoice}
      />

      {/* 5. Conversation History Dialog / Drawer */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="w-[95vw] sm:max-w-md h-[75dvh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b border-border/60">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <History className="size-4 text-brand-600" />
              <span>Conversation History</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            <TeacherConversationList
              conversations={conversations}
              activeConversationId={activeConvId}
              onSelectConversation={(id) => {
                if (id !== activeConvId) {
                  voicePlayback.stop();
                  voiceRecognition.abortListening();
                  setVoiceModeActive(false);
                  setVoiceTranscript("");
                  setLoadingMessages(true);
                  setActiveConvId(id);
                }
                setShowHistoryDialog(false);
              }}
              onNewConversation={handleNewConversation}
              onRenameConversation={handleRenameConversation}
              onDeleteConversation={handleDeleteConversation}
              isLoading={isGenerating}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
