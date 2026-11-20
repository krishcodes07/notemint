# Phase 9.1: AI Teacher Real-Time Voice Conversation Mode

Status: **Complete**. Date: Phase 9.1 implementation session.

---

## 1. Phase Overview

Phase 9.1 extends NoteMint's **AI Teacher** with a real-time, hands-free **Voice Conversation Mode**. Students can press a single Talk button, speak naturally into their browser microphone, watch their spoken transcript appear in the persistent conversation thread, and hear the AI Teacher speak back with human-quality neural voice synthesis powered by **Microsoft Edge TTS** (`edge-tts`).

Voice mode does not create an isolated chatbot or bypass NoteMint's study architecture. Instead, it reuses the exact same document context retriever, conversation memory, teaching modes (Explain, Simplify, Socratic), languages (English, Hindi, Hinglish), and persistent database records.

---

## 2. Architecture & Technology Stack

```
   ┌─────────────────────────────────────────────────────────────┐
   │                       BROWSER CLIENT                        │
   │                                                             │
   │  Student Speaks ──> Web Speech API ──> Transcript Preview   │
   │  (Microphone)      (SpeechRecognition) (Local Display)      │
   │                                              │              │
   │                                              ▼              │
   │  Audio Playback <── Authenticated MP3 <── POST /stream      │
   │  (HTMLAudio)       POST .../speech        (Chat Endpoint)   │
   └────────▲───────────────────▲─────────────────┬──────────────┘
            │                   │                 │
            │                   │                 ▼
   ┌────────┴───────────────────┴────────────────────────────────┐
   │                      FASTAPI BACKEND                        │
   │                                                             │
   │  1. TeacherChatService: Retrieves context & Kilo LLM answer │
   │  2. clean_text_for_speech: Strips citations & tables        │
   │  3. EdgeTTSService: edge-tts synthesizes neural MP3         │
   │  4. PostgreSQL: Persists user and assistant TeacherMessage  │
   └─────────────────────────────────────────────────────────────┘
```

### Key Components

1. **Speech-to-Text (STT)**:
   - Browser-native `SpeechRecognition` and `webkitSpeechRecognition` via `useVoiceRecognition` hook.
   - Progressive enhancement: if a browser lacks STT support, a clear notification guides the student to Chrome, Edge, or Safari while text input remains fully functional.
   - Real-time interim and final transcript preview.

2. **AI Intelligence**:
   - Reuses `TeacherChatService` with an `is_voice_mode` flag.
   - `build_teacher_system_prompt` adds conversational guidelines for voice interactions (natural sentence lengths, avoiding dense symbol tables, speaking clearly).

3. **Text-to-Speech (TTS)**:
   - Server-side synthesis via Python package `edge-tts` (v7.3.1) in `app/services/edge_tts_service.py`.
   - Generates high-fidelity neural speech streaming directly into an in-memory MP3 buffer (no temporary disk files).
   - Rate adjustment supported (`-15%`, `+0%`, `+20%`).

4. **Speech Normalization (`clean_text_for_speech`)**:
   - Strips PDF citations: e.g. `[Page 4]`, `[Pages 5, 6]` so they are not awkwardly read aloud.
   - Converts Markdown tables into natural spoken sentences (e.g. `Term: Chlorophyll. Definition: Green pigment.`).
   - Cleans code blocks, headings, bold/italic markers, and horizontal rules.

5. **Real-Time Streaming TTS & Audio Queue Playback (`useVoicePlayback`)**:
   - Rather than waiting for the entire LLM explanation to complete (which introduces 10-15s latency), NoteMint implements real-time sentence-by-sentence TTS streaming.
   - As tokens stream via Server-Sent Events (`onDelta`), completed sentences are extracted via `extractSentencesFromBuffer` (delimited by `. `, `? `, `! `, `\n`, or Hindi `। `).
   - Each completed sentence is immediately synthesized via `POST .../speech` in the background (~200ms per sentence).
   - Audio blobs are enqueued into an in-memory sequential playback queue.
   - Sentence 1 starts playing in ~1.5s (slashing time-to-first-voice from ~15s to ~1.5s!). While Sentence 1 is being spoken aloud, Sentence 2 and Sentence 3 are fetched and queued in parallel for gapless, zero-stutter playback.
   - Safe lifecycle management: automatically revokes object URLs via `URL.revokeObjectURL` on completion or unmount to prevent browser memory leaks.

---

## 3. Supported Edge TTS Neural Voices

NoteMint provides curated neural voices optimized for Indian English, Hindi, and US English:

| Voice Identifier | Name | Gender | Language / Locale | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `en-IN-NeerjaNeural` | **Neerja** | Female | English (India) (`en-IN`) | **Default & Recommended**: Natural Indian English for CBSE/ICSE curricula and Hinglish. |
| `en-IN-PrabhatNeural` | **Prabhat** | Male | English (India) (`en-IN`) | Natural male Indian English tutor voice. |
| `hi-IN-SwaraNeural` | **Swara** | Female | Hindi (`hi-IN`) | Clear, expressive Hindi female voice. |
| `hi-IN-MadhurNeural` | **Madhur** | Male | Hindi (`hi-IN`) | Clear, authoritative Hindi male voice. |
| `en-US-JennyNeural` | **Jenny** | Female | English (US) (`en-US`) | Natural standard American English female voice. |
| `en-US-GuyNeural` | **Guy** | Male | English (US) (`en-US`) | Natural standard American English male voice. |

---

## 4. Echo Prevention & Continuous Turn-Taking

### Strict Echo Prevention Rule
To prevent the tutor from hearing its own voice or catching microphone feedback:
- The microphone is **automatically muted** as soon as the user finishes speaking and remains disabled while the AI is **Thinking**, **Synthesizing**, and **Speaking**.
- The microphone is **never active** while audio playback is running.

### Continuous Conversation Mode
- When continuous mode is enabled (default), NoteMint automatically waits for the tutor to finish speaking, pauses 250ms to allow room echo to clear, and then automatically starts listening again ("Listening... Speak now").
- Students can have natural back-and-forth conversations (e.g., asking follow-up questions) without clicking the microphone button each turn.
- A one-click **Interrupt / Stop** button allows the student to immediately cut off the tutor mid-speech and start asking their next question.

---

## 5. API Endpoints Added

### 1. Synthesize Speech Audio
- **Route**: `POST /api/v1/documents/{document_id}/conversations/{conversation_id}/messages/{message_id}/speech`
- **Auth**: Clerk JWT Bearer Token (verifies document access and conversation ownership).
- **Payload**:
  ```json
  {
    "voice": "en-IN-NeerjaNeural",
    "rate": "+0%"
  }
  ```
- **Validation**:
  - Message must belong to the conversation.
  - Message role must be `assistant` (user messages return 400 Bad Request).
  - Message status must be `completed`.
  - Non-empty content required.
- **Response**: `200 OK` with `Content-Type: audio/mpeg` binary stream.

### 2. List Supported Voices
- **Route**: `GET /api/v1/documents/{document_id}/conversations/voices`
- **Response**:
  ```json
  {
    "default_voice": "en-IN-NeerjaNeural",
    "voices": {
      "en-IN-NeerjaNeural": {
        "name": "Neerja",
        "gender": "Female",
        "language": "English (India)",
        "locale": "en-IN",
        "description": "Natural Indian English female voice..."
      }
    }
  }
  ```

---

## 6. Frontend UI Enhancements

1. **Talk Button & Toolbar Controls**:
   - Talk button in chat input and header toolbar with pulsating mic icon when active.
2. **Interactive Voice Banner (`TeacherVoiceControls`)**:
   - Visual state indicators: `Listening...`, `Thinking...`, `Generating voice audio...`, `Speaking...`, `Paused`.
   - Real-time spoken transcript display.
   - Pause / Resume microphone, Interrupt playback, Settings, and Exit Voice Mode.
3. **Voice Preferences Dialog (`TeacherVoiceSettingsDialog`)**:
   - Select voice from verified list.
   - Adjust speech rate (`0.85x`, `1.0x`, `1.2x`).
   - Toggle Continuous Conversation on/off.
   - Persists preferences across browser sessions via `localStorage`.
4. **Borderless, Scrollbar-Free Layout**:
   - Outer card borders, container boxes, and background cards removed from AI Teacher messages, thinking indicators, and workspace main.
   - Text flows cleanly and naturally across the study workspace like ChatGPT / Claude.
   - Global `.no-scrollbar` rule with `scrollbar-width: none !important; -ms-overflow-style: none !important; ::-webkit-scrollbar { display: none !important; }` completely eliminates the grey vertical scrollbar track and thumb while retaining smooth scrolling.
   - User messages styled with `bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white` for crisp contrast and visibility in both light and dark mode.
5. **Autoplay Audio Policy & On-Demand Playback**:
   - Audio elements pre-primed on user interaction (`voicePlayback.unlock()`) to eliminate browser `NotAllowedError` autoplay blocks.
   - Persistent `voiceOutputActive` state ensures typed and spoken responses are spoken aloud seamlessly.
   - On-demand "Listen" speaker button on completed AI answers allows re-listening to any answer anytime.

---

## 7. Verification & Test Suite

All 36 backend tests pass with 100% success rate:
- **`tests/test_edge_tts_service.py`**:
  - Text normalization tests (citation stripping, markdown cleanup, table translation).
  - Edge TTS service tests (voice whitelist, rate format, empty text validation, async audio synthesis).
  - API endpoint tests (200 audio/mpeg, 400 user message reject, 400 incomplete reject, 404 not found, voices listing).
- **`tests/test_teacher_service_and_api.py`**: All 10 existing Phase 9 integration tests pass with zero regressions.
- **Frontend Validation**:
  - `npx tsc --noEmit` passed with 0 errors.
  - Next.js development server running cleanly on port 3000.
  - FastAPI server running cleanly on port 8000.

