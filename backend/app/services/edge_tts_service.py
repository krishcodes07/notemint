"""Edge TTS Service for Phase 9.1 AI Teacher Voice Mode.

Encapsulates Microsoft Edge TTS for high-quality, neural text-to-speech synthesis
in English, Hindi, and Hinglish. Synthesizes authorized AI Teacher responses into MP3 audio
with speech-specific text normalization (stripping Markdown syntax, citations, and table formatting).
"""

from __future__ import annotations

import io
import logging
import re
from typing import Final

import edge_tts

logger = logging.getLogger(__name__)

# Supported Edge TTS neural voices for NoteMint
SUPPORTED_VOICES: Final[dict[str, dict[str, str]]] = {
    "en-IN-NeerjaNeural": {
        "name": "Neerja",
        "gender": "Female",
        "language": "English (India)",
        "locale": "en-IN",
        "description": "Natural Indian English female voice, recommended for Indian curricula & Hinglish.",
    },
    "en-IN-PrabhatNeural": {
        "name": "Prabhat",
        "gender": "Male",
        "language": "English (India)",
        "locale": "en-IN",
        "description": "Natural Indian English male voice.",
    },
    "hi-IN-SwaraNeural": {
        "name": "Swara",
        "gender": "Female",
        "language": "Hindi",
        "locale": "hi-IN",
        "description": "Clear Hindi female voice.",
    },
    "hi-IN-MadhurNeural": {
        "name": "Madhur",
        "gender": "Male",
        "language": "Hindi",
        "locale": "hi-IN",
        "description": "Clear Hindi male voice.",
    },
    "en-US-JennyNeural": {
        "name": "Jenny",
        "gender": "Female",
        "language": "English (US)",
        "locale": "en-US",
        "description": "US English female voice.",
    },
    "en-US-GuyNeural": {
        "name": "Guy",
        "gender": "Male",
        "language": "English (US)",
        "locale": "en-US",
        "description": "US English male voice.",
    },
}

DEFAULT_VOICE: Final[str] = "en-IN-NeerjaNeural"
MAX_SPEECH_TEXT_LENGTH: Final[int] = 5000


class TTSError(Exception):
    """Base exception for Text-to-Speech operations."""


class TTSValidationError(TTSError):
    """Raised when text or synthesis parameters fail validation."""


class TTSServiceError(TTSError):
    """Raised when speech synthesis fails due to service or network error."""


def clean_text_for_speech(text: str) -> str:
    """Normalize and strip Markdown, citations, and formatting for natural speech synthesis.

    - Removes page citations: e.g. [Page 3], [Pages 4, 5]
    - Converts Markdown tables into readable spoken sentences
    - Strips Markdown headings (#, ##, ###)
    - Strips code fences and bold/italic asterisks
    - Converts bullet items to natural sentences
    - Removes horizontal rules (---)
    - Normalizes whitespace
    """
    if not text or not text.strip():
        return ""

    # 1. Remove citations like [Page 1], [Pages 2, 3], [Pages 4-6]
    cleaned = re.sub(r"\[Pages?\s+[0-9,\s\-]+\]", "", text, flags=re.IGNORECASE)

    # 2. Convert markdown tables into spoken sentences
    lines = cleaned.splitlines()
    table_processed: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        # Check if line is a table row and next line is a table separator
        if (
            line.startswith("|")
            and i + 1 < len(lines)
            and re.match(r"^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$", lines[i + 1].strip())
        ):
            headers = [c.strip() for c in line.strip("|").split("|")]
            i += 2  # Skip header row and separator line
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip("|").split("|")]
                row_parts = []
                for idx, cell in enumerate(cells):
                    if cell:
                        header = headers[idx] if idx < len(headers) else ""
                        if header:
                            row_parts.append(f"{header}: {cell}")
                        else:
                            row_parts.append(cell)
                if row_parts:
                    table_processed.append(". ".join(row_parts) + ".")
                i += 1
            continue

        table_processed.append(lines[i])
        i += 1

    cleaned = "\n".join(table_processed)

    # 3. Strip code blocks: keep code content or summarize
    cleaned = re.sub(r"```[a-zA-Z]*\n?(.*?)```", r"\1", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)

    # 4. Strip headings (#, ##, ###, ####)
    cleaned = re.sub(r"^#{1,6}\s*", "", cleaned, flags=re.MULTILINE)

    # 5. Strip bold and italic markdown
    cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"\*([^*]+)\*", r"\1", cleaned)
    cleaned = re.sub(r"__([^_]+)__", r"\1", cleaned)
    cleaned = re.sub(r"_([^_]+)_", r"\1", cleaned)

    # 6. Strip bullet markers (•, -, *)
    cleaned = re.sub(r"^\s*[\*•\-]\s+", "", cleaned, flags=re.MULTILINE)

    # 7. Strip blockquote symbols
    cleaned = re.sub(r"^\s*>\s*", "", cleaned, flags=re.MULTILINE)

    # 8. Strip horizontal dividers
    cleaned = re.sub(r"^(-{3,}|\*{3,}|_{3,})$", "", cleaned, flags=re.MULTILINE)

    # 9. Strip any stray markdown symbols that might be read phonetically
    cleaned = re.sub(r"[*#`~|>]", " ", cleaned)

    # 10. Clean up spaces before punctuation (e.g. 'word .' -> 'word.')
    cleaned = re.sub(r"\s+([.,?!।])", r"\1", cleaned)

    # 11. Clean up whitespace and line breaks
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    return cleaned.strip()


class EdgeTTSService:
    """Service for synthesizing speech using Microsoft Edge TTS."""

    def __init__(self, default_voice: str = DEFAULT_VOICE) -> None:
        self.default_voice = default_voice

    def get_supported_voices(self) -> dict[str, dict[str, str]]:
        """Return the dictionary of verified supported voices."""
        return SUPPORTED_VOICES

    async def synthesize(
        self,
        text: str,
        voice: str | None = None,
        rate: str = "+0%",
    ) -> bytes:
        """Synthesize input text into MP3 audio bytes.

        Args:
            text: Text to synthesize.
            voice: Edge TTS voice name (must be in SUPPORTED_VOICES).
            rate: Speech rate adjustment string, e.g. "+0%", "-10%", "+20%".

        Returns:
            bytes: MP3 audio data.

        Raises:
            TTSValidationError: Invalid text, voice, or rate parameter.
            TTSServiceError: Synthesis network or service failure.
        """
        # Validate voice
        selected_voice = voice or self.default_voice
        if selected_voice not in SUPPORTED_VOICES:
            valid_list = ", ".join(SUPPORTED_VOICES.keys())
            raise TTSValidationError(
                f"Unsupported voice '{selected_voice}'. Must be one of: {valid_list}."
            )

        # Validate rate
        if not re.match(r"^[+-]\d{1,2}%$", rate):
            raise TTSValidationError(
                f"Invalid speech rate '{rate}'. Expected format like '+0%', '-10%', or '+20%'."
            )

        # Clean and validate text
        spoken_text = clean_text_for_speech(text)
        if not spoken_text:
            raise TTSValidationError("Text cannot be empty for speech synthesis.")

        if len(spoken_text) > MAX_SPEECH_TEXT_LENGTH:
            # Safely truncate at sentence boundary rather than failing hard
            truncated = spoken_text[:MAX_SPEECH_TEXT_LENGTH]
            last_period = truncated.rfind(".")
            if last_period > MAX_SPEECH_TEXT_LENGTH // 2:
                spoken_text = truncated[: last_period + 1]
            else:
                spoken_text = truncated

        try:
            communicate = edge_tts.Communicate(
                text=spoken_text,
                voice=selected_voice,
                rate=rate,
            )

            audio_buffer = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_buffer.write(chunk["data"])

            audio_bytes = audio_buffer.getvalue()
            if not audio_bytes:
                raise TTSServiceError("Edge TTS produced empty audio stream.")

            return audio_bytes

        except TTSValidationError:
            raise
        except Exception as exc:
            logger.error("Edge TTS synthesis failed for voice %s: %s", selected_voice, exc)
            raise TTSServiceError(f"Failed to synthesize speech: {exc}") from exc
