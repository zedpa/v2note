"""
Realtime streaming ASR via DashScope Python SDK.

Protocol (stdin/stdout, newline-delimited):
  - stdin:  raw PCM bytes (16kHz, 16-bit, mono), EOF signals stop
  - stdout: one JSON line per event

Events emitted:
  {"type":"started"}
  {"type":"partial",  "text":"...", "sentence_id":0}
  {"type":"sentence", "text":"...", "sentence_id":0, "begin_time":0, "end_time":1200}
  {"type":"error",    "message":"..."}
  {"type":"complete"}

Env vars:
  DASHSCOPE_API_KEY  (required)
  ASR_MODEL          (default: paraformer-v2)
"""

import json
import os
import sys
import threading

import dashscope
from dashscope.audio.asr import Recognition, RecognitionCallback, RecognitionResult

api_key = os.environ.get("DASHSCOPE_API_KEY")
if not api_key:
    print(json.dumps({"type": "error", "message": "Missing DASHSCOPE_API_KEY"}), flush=True)
    sys.exit(1)

dashscope.api_key = api_key

MODEL = os.environ.get("ASR_MODEL", "fun-asr-realtime")
VOCABULARY_ID = os.environ.get("ASR_VOCABULARY_ID")  # DashScope 热词表 ID
CHUNK_SIZE = 3200  # 100ms of 16kHz 16-bit mono PCM


def emit(obj: dict):
    """Write a JSON line to stdout (thread-safe via GIL + flush)."""
    print(json.dumps(obj, ensure_ascii=False), flush=True)


class RealtimeCallback(RecognitionCallback):
    def on_open(self):
        emit({"type": "started"})

    def on_event(self, result: RecognitionResult):
        sentence = result.get_sentence()
        if sentence is None:
            return
        if isinstance(sentence, list):
            for s in sentence:
                self._handle_sentence(s)
        else:
            self._handle_sentence(sentence)

    def _handle_sentence(self, s: dict):
        if s.get("end_time") is not None:
            emit({
                "type": "sentence",
                "text": s.get("text", ""),
                "sentence_id": s.get("sentence_id", 0),
                "begin_time": s.get("begin_time"),
                "end_time": s.get("end_time"),
            })
        else:
            emit({
                "type": "partial",
                "text": s.get("text", ""),
                "sentence_id": s.get("sentence_id", 0),
            })

    def on_error(self, result: RecognitionResult):
        emit({
            "type": "error",
            "message": result.message or "Unknown recognition error",
            "code": getattr(result, "code", None),
        })

    def on_complete(self):
        emit({"type": "complete"})

    def on_close(self):
        pass


def main():
    callback = RealtimeCallback()
    recognition_kwargs = dict(
        model=MODEL,
        callback=callback,
        format="pcm",
        sample_rate=16000,
    )
    if VOCABULARY_ID:
        recognition_kwargs["vocabulary_id"] = VOCABULARY_ID
    recognition = Recognition(**recognition_kwargs)

    recognition.start(disfluency_removal_enabled=True)

    # Feed PCM from stdin until EOF
    try:
        while True:
            chunk = sys.stdin.buffer.read(CHUNK_SIZE)
            if not chunk:
                break
            recognition.send_audio_frame(chunk)
    except Exception as e:
        emit({"type": "error", "message": f"stdin read error: {e}"})

    try:
        recognition.stop()
    except Exception as e:
        emit({"type": "error", "message": f"stop error: {e}"})


if __name__ == "__main__":
    main()
