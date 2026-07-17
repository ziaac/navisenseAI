"""Speech-to-text using faster-whisper (CTranslate2) with ROCm-friendly fallback.

faster-whisper's CTranslate2 backend has limited ROCm support; if GPU init
fails we fall back to openai-whisper on PyTorch ROCm, which runs fine on
Radeon GPUs (torch.cuda maps to HIP).
"""
from __future__ import annotations

import io
import logging

import config

log = logging.getLogger(__name__)


class STT:
    def __init__(self):
        self.backend = None
        self._load()

    def _load(self) -> None:
        try:
            from faster_whisper import WhisperModel

            self.model = WhisperModel(
                config.WHISPER_MODEL,
                device=config.WHISPER_DEVICE,
                compute_type=config.WHISPER_COMPUTE,
            )
            self.backend = "faster-whisper"
        except Exception as e:  # pragma: no cover
            log.warning("faster-whisper GPU init failed (%s); falling back to openai-whisper", e)
            import torch
            import whisper

            device = "cuda" if torch.cuda.is_available() else "cpu"
            name = "turbo" if "turbo" in config.WHISPER_MODEL else config.WHISPER_MODEL
            self.model = whisper.load_model(name, device=device)
            self.backend = "openai-whisper"
        log.info("STT backend: %s (%s)", self.backend, config.WHISPER_MODEL)

    def transcribe(self, wav_bytes: bytes) -> str:
        if self.backend == "faster-whisper":
            segments, _ = self.model.transcribe(
                io.BytesIO(wav_bytes), language="en", beam_size=1, vad_filter=True
            )
            return " ".join(s.text.strip() for s in segments).strip()
        # openai-whisper path: needs a file or ndarray
        import numpy as np
        import soundfile as sf

        audio, sr = sf.read(io.BytesIO(wav_bytes), dtype="float32")
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        if sr != 16000:
            import librosa

            audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
        result = self.model.transcribe(audio, language="en", fp16=True)
        return result["text"].strip()
