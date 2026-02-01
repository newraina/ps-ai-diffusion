"""Minimal prompt helpers for shared workflow."""
from __future__ import annotations

import logging
import random
import re
from pathlib import Path
from typing import Tuple, List

from .files import FileSource
from .localization import translate as _

logger = logging.getLogger("shared_shim.text")


def strip_prompt_comments(prompt: str) -> str:
    """Strip comments (text after #) unless escaped."""
    lines = prompt.splitlines()
    stripped = [
        re.sub(r"(?<!\\)#.*", "", line).replace(r"\#", "#").rstrip() for line in lines
    ]
    return "\n".join(stripped).strip()


def merge_prompt(prompt: str, style_prompt: str, language: str = "") -> str:
    if language and prompt:
        prompt = f"lang:{language} {prompt} lang:en "
    if style_prompt == "":
        return prompt
    if "{prompt}" in style_prompt:
        return style_prompt.replace("{prompt}", prompt)
    if prompt == "":
        return style_prompt
    return f"{prompt}, {style_prompt}"


_pattern_lora = re.compile(r"<lora:([^:<>]+)(?::(-?[^:<>]*))?>", re.IGNORECASE)
_pattern_layer = re.compile(r"<layer:([^>]+)>", re.IGNORECASE)
_pattern_wildcard = re.compile(r"(\{[^{}]+\|[^{}]+\})")


def extract_loras(prompt: str, lora_files) -> Tuple[str, List["LoraInput"]]:
    """Extract <lora:name:weight> tags and return (clean_prompt, loras)."""
    from shared.api import LoraInput

    loras: list[LoraInput] = []

    def replace(match: re.Match[str]) -> str:
        lora_file = None
        input_name = (match[1] or "").lower()

        for file in lora_files:
            if file.source is not FileSource.unavailable:
                lora_filename = Path(file.id).stem.lower()
                lora_normalized = file.name.lower()
                if input_name == lora_filename or input_name == lora_normalized:
                    lora_file = file
                    break

        if not lora_file:
            error = _("LoRA not found") + f": {input_name}"
            logger.warning(error)
            raise Exception(error)

        lora_strength: float = lora_file.meta("lora_strength", 1.0)
        if match[2]:
            try:
                lora_strength = float(match[2])
            except ValueError:
                error = _("Invalid LoRA strength for") + f" {input_name}: {lora_strength}"
                logger.warning(error)
                raise Exception(error)

        loras.append(LoraInput(lora_file.id, lora_strength))
        return ""

    prompt = _pattern_lora.sub(replace, prompt)
    return prompt.strip(), loras


def extract_layers(prompt: str, replacement: str = "Picture {}", start_index: int = 1):
    layer_index = start_index
    layer_names: list[str] = []

    def replace(match: re.Match[str]):
        nonlocal layer_index
        replacement_text = replacement.format(layer_index)
        layer_index += 1
        layer_names.append(match[1])
        return replacement_text

    prompt = _pattern_layer.sub(replace, prompt)
    return prompt.strip(), layer_names


def eval_wildcards(text: str, seed: int) -> str:
    rng = random.Random(seed)

    def replace(match: re.Match[str]):
        wildcard_name = match[1]
        options = wildcard_name.split("|")
        return rng.choice(options).strip("{} ")

    for __ in range(10):
        prev = text
        text = _pattern_wildcard.sub(replace, text)
        if text == prev:
            break

    return text
