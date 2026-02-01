"""
Simplified types for cloud service, without Qt dependency.
These replace Qt-dependent types from shared/client.py and shared/image.py.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import NamedTuple


@dataclass
class CloudUser:
    """Simplified User, no Qt dependency."""

    id: str
    name: str
    credits: int = 0
    images_generated: int = 0


class CloudNews(NamedTuple):
    """News from cloud service."""

    text: str
    digest: str


@dataclass
class CloudFeatures:
    """Features available from cloud service."""

    ip_adapter: bool = True
    translation: bool = True
    max_upload_size: int = 300 * 1024 * 1024  # 300MB
    max_control_layers: int = 4


class CloudJobStatus(str, Enum):
    """Cloud job status."""

    queued = "queued"
    uploading = "uploading"
    in_queue = "in_queue"
    in_progress = "in_progress"
    finished = "finished"
    error = "error"
    cancelled = "cancelled"
    timed_out = "timed_out"


@dataclass
class CloudJobState:
    """Cloud job state tracking."""

    status: CloudJobStatus = CloudJobStatus.queued
    progress: float = 0.0
    images: list[bytes] = field(default_factory=list)
    error: str | None = None


class ImageData:
    """
    Simplified ImageCollection, handles bytes directly.
    Replaces Qt's QImage-based ImageCollection.
    """

    def __init__(self, images: list[bytes]):
        self.images = images

    def __len__(self):
        return len(self.images)

    def __getitem__(self, index: int) -> bytes:
        return self.images[index]

    def __iter__(self):
        return iter(self.images)

    @staticmethod
    def from_bytes(data: bytes, offsets: list[int]) -> "ImageData":
        """
        Extract images from concatenated bytes using offsets.

        Args:
            data: Concatenated image bytes
            offsets: List of byte offsets where each image starts

        Returns:
            ImageData containing extracted images
        """
        images = []
        for i, offset in enumerate(offsets):
            if i + 1 < len(offsets):
                end = offsets[i + 1]
            else:
                end = len(data)
            images.append(data[offset:end])
        return ImageData(images)

    @staticmethod
    def from_base64(b64: str, offsets: list[int]) -> "ImageData":
        """
        Extract images from base64 encoded concatenated bytes.

        Args:
            b64: Base64 encoded concatenated image bytes
            offsets: List of byte offsets where each image starts

        Returns:
            ImageData containing extracted images
        """
        import base64

        data = base64.b64decode(b64)
        return ImageData.from_bytes(data, offsets)
