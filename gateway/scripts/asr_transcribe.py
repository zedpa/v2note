"""
ASR transcription script using DashScope Python SDK.

Usage:
    cat audio.wav | python asr_transcribe.py
    python asr_transcribe.py < audio.wav

Reads WAV binary from stdin, transcribes via DashScope Recognition API,
writes JSON result to stdout:
    {"text": "transcribed text", "sentences": [...]}

Requires DASHSCOPE_API_KEY environment variable.
"""

import json
import os
import sys
import tempfile

import dashscope
from dashscope.audio.asr import Recognition, RecognitionCallback, RecognitionResult

# Read API key from environment
api_key = os.environ.get("DASHSCOPE_API_KEY")
if not api_key:
    print(json.dumps({"error": "Missing DASHSCOPE_API_KEY"}), flush=True)
    sys.exit(1)

dashscope.api_key = api_key

MODEL = os.environ.get("ASR_MODEL", "fun-asr-realtime")


class SimpleCallback(RecognitionCallback):
    """Collect sentences from recognition events."""

    def __init__(self):
        self.sentences = []

    def on_event(self, result: RecognitionResult):
        sentence = result.get_sentence()
        if isinstance(sentence, dict) and sentence.get("end_time") is not None:
            self.sentences.append(sentence)

    def on_error(self, result: RecognitionResult):
        print(
            json.dumps(
                {
                    "error": f"Recognition error: {result.message}",
                    "code": result.code,
                    "request_id": result.request_id,
                }
            ),
            file=sys.stderr,
        )

    def on_complete(self):
        pass


def main():
    # Read WAV from stdin
    if sys.stdin.isatty():
        print(json.dumps({"error": "No audio data on stdin"}), flush=True)
        sys.exit(1)

    wav_data = sys.stdin.buffer.read()
    if not wav_data:
        print(json.dumps({"text": "", "sentences": []}), flush=True)
        return

    # Write to temp file (Recognition.call requires a file path)
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    try:
        tmp.write(wav_data)
        tmp.close()

        callback = SimpleCallback()
        recognition = Recognition(
            model=MODEL,
            callback=callback,
            format="wav",
            sample_rate=16000,
        )

        result = recognition.call(tmp.name, disfluency_removal_enabled=True)

        if result.status_code != 200:
            print(
                json.dumps(
                    {
                        "error": f"Recognition failed: {result.message}",
                        "code": result.code,
                        "status_code": result.status_code,
                        "request_id": result.request_id,
                    }
                ),
                flush=True,
            )
            sys.exit(1)

        # Collect sentences from the result
        sentences = result.get_sentence()
        if sentences is None:
            sentences = callback.sentences

        if isinstance(sentences, dict):
            sentences = [sentences]

        sentence_list = []
        text_parts = []
        if sentences:
            for s in sentences:
                txt = s.get("text", "")
                text_parts.append(txt)
                sentence_list.append(
                    {
                        "text": txt,
                        "begin_time": s.get("begin_time"),
                        "end_time": s.get("end_time"),
                    }
                )

        full_text = "".join(text_parts)

        print(
            json.dumps(
                {"text": full_text, "sentences": sentence_list}, ensure_ascii=False
            ),
            flush=True,
        )

    finally:
        os.unlink(tmp.name)


if __name__ == "__main__":
    main()
