"""Qt-less style definitions for shared workflow."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, NamedTuple

from shared.resources import Arch


class _Setting:
    def __init__(self, default):
        self.default = default


class StyleSettings:
    clip_skip = _Setting(0)
    vae = _Setting("")
    sampler = _Setting("Default - DPM++ 2M")


class SamplerPreset(NamedTuple):
    sampler: str
    scheduler: str
    cfg: float
    steps: int
    minimum_steps: int


class SamplerPresets:
    _instance = None

    def __init__(self):
        self._presets: dict[str, SamplerPreset] = {}
        self._load_presets()

    def _load_presets(self) -> None:
        shared_dir = Path(__file__).resolve().parents[3] / "shared"
        preset_file = shared_dir / "presets" / "samplers.json"
        try:
            with preset_file.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
        for name, values in data.items():
            self._presets[name] = SamplerPreset(
                sampler=values.get("sampler", "euler"),
                scheduler=values.get("scheduler", "normal"),
                cfg=float(values.get("cfg", 7.0)),
                steps=int(values.get("steps", 20)),
                minimum_steps=int(values.get("minimum_steps", 0)),
            )

    def __getitem__(self, key: str) -> SamplerPreset:
        return self._presets.get(
            key,
            SamplerPreset("euler", "normal", 7.0, 20, 0),
        )

    @classmethod
    def instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance


@dataclass
class Style:
    filepath: Path | None = None
    name: str = "Default Style"
    architecture: Arch = Arch.auto
    checkpoints: list[str] = field(default_factory=list)
    loras: list[dict] = field(default_factory=list)
    style_prompt: str = "{prompt}"
    negative_prompt: str = ""
    vae: str = ""
    clip_skip: int = 0
    v_prediction_zsnr: bool = False
    rescale_cfg: float = 0.7
    self_attention_guidance: bool = False
    preferred_resolution: int = 0
    linked_edit_style: str = ""
    sampler: str = StyleSettings.sampler.default
    sampler_steps: int = 20
    cfg_scale: float = 7.0
    live_sampler: str = "Realtime - Hyper"
    live_sampler_steps: int = 6
    live_cfg_scale: float = 1.8

    @staticmethod
    def load(filepath: Path) -> "Style" | None:
        try:
            with filepath.open("r", encoding="utf-8") as f:
                data = json.load(f)
            style = Style(filepath=filepath)
            for key, value in data.items():
                if not hasattr(style, key):
                    continue
                if key == "architecture" and isinstance(value, str):
                    style.architecture = Arch.from_string(value, filename=str(filepath)) or Arch.auto
                    continue
                setattr(style, key, value)
            return style
        except Exception:
            return None

    def preferred_checkpoint(self, available_checkpoints: Iterable[str]):
        def sanitize(p):
            return p.replace("\\", "/").lower()

        available = {sanitize(cp): cp for cp in available_checkpoints}
        for cp in self.checkpoints:
            if found := available.get(sanitize(cp)):
                return found
        if self.checkpoints:
            return self.checkpoints[0]
        return "not-found"

    def get_models(self, available_checkpoints: Iterable[str]):
        from shared.api import CheckpointInput, LoraInput

        result = CheckpointInput(
            checkpoint=self.preferred_checkpoint(available_checkpoints),
            vae=self.vae,
            clip_skip=self.clip_skip,
            v_prediction_zsnr=self.v_prediction_zsnr,
            rescale_cfg=self.rescale_cfg,
            loras=[LoraInput.from_dict(l) for l in self.loras if l.get("enabled", True)],
            self_attention_guidance=self.self_attention_guidance,
        )
        return result

    def get_steps(self, is_live: bool) -> tuple[int, int]:
        sampler_name = self.live_sampler if is_live else self.sampler
        preset = SamplerPresets.instance()[sampler_name]
        max_steps = self.live_sampler_steps if is_live else self.sampler_steps
        max_steps = max_steps or preset.steps
        min_steps = min(preset.minimum_steps, max_steps)
        return min_steps, max_steps
