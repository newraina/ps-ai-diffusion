"""Minimal settings for shared modules without Qt."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class ImageFileFormat(Enum):
    png = "PNG (fast)"
    png_small = "PNG"
    webp = "WebP"
    webp_lossless = "WebP (lossless)"
    jpeg = "JPEG"

    @staticmethod
    def from_extension(filepath: str | Path):
        extension = Path(filepath).suffix.lower()
        if extension == ".png":
            return ImageFileFormat.png_small
        if extension == ".webp":
            return ImageFileFormat.webp
        if extension in [".jpg", ".jpeg"]:
            return ImageFileFormat.jpeg
        raise ValueError(f"Unsupported image extension: {extension}")

    @property
    def extension(self) -> str:
        if self in [ImageFileFormat.png, ImageFileFormat.png_small]:
            return "png"
        if self in [ImageFileFormat.webp, ImageFileFormat.webp_lossless]:
            return "webp"
        return "jpg"

    @property
    def quality(self) -> int:
        if self is ImageFileFormat.png:
            return 85
        if self is ImageFileFormat.png_small:
            return 50
        if self is ImageFileFormat.webp:
            return 80
        if self is ImageFileFormat.webp_lossless:
            return 100
        if self is ImageFileFormat.jpeg:
            return 85
        return 85

    @property
    def no_webp_fallback(self) -> "ImageFileFormat":
        if self is ImageFileFormat.webp_lossless:
            return ImageFileFormat.png
        if self is ImageFileFormat.webp:
            return ImageFileFormat.jpeg
        return self


@dataclass
class PerformanceSettings:
    batch_size: int = 4
    resolution_multiplier: float = 1.0
    max_pixel_count: int = 6
    dynamic_caching: bool = False
    tiled_vae: bool = False


@dataclass
class _Settings:
    nsfw_filter: float = 0.0


settings = _Settings()
