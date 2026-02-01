"""Qt-less file library stubs for shared workflow."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, Flag
from typing import Any


class FileSource(Flag):
    unavailable = 0
    local = 1
    remote = 2


class FileFormat(Enum):
    unknown = 0
    checkpoint = 1
    diffusion = 2
    lora = 3


@dataclass
class File:
    id: str
    name: str
    source: FileSource = FileSource.unavailable
    format: FileFormat = FileFormat.unknown
    metadata: dict[str, Any] = field(default_factory=dict)

    def meta(self, key: str, default=None) -> Any:
        return self.metadata.get(key, default)


class FileCollection:
    """Minimal list-like collection for File objects."""

    def __init__(self):
        self._files: list[File] = []

    def __iter__(self):
        return iter(self._files)

    def __len__(self):
        return len(self._files)

    def add(self, file: File) -> File:
        self._files.append(file)
        return file

    def extend(self, files: list[File]) -> None:
        self._files.extend(files)

    def clear(self) -> None:
        self._files = []

    def find(self, id: str):
        return next((f for f in self._files if f.id == id), None)

    def find_local(self, id: str):
        return next((f for f in self._files if f.id == id), None)


_instance = None


class FileLibrary:
    """Minimal singleton with checkpoints/loras collections."""

    def __init__(self, checkpoints: FileCollection, loras: FileCollection):
        self.checkpoints = checkpoints
        self.loras = loras

    @staticmethod
    def load():
        global _instance
        _instance = FileLibrary(FileCollection(), FileCollection())
        return _instance

    @staticmethod
    def instance():
        if _instance is None:
            return FileLibrary.load()
        return _instance

    def set_loras(self, lora_names: list[str]) -> None:
        self.loras.clear()
        files = [
            File(id=name, name=name, source=FileSource.remote, format=FileFormat.lora)
            for name in lora_names
        ]
        self.loras.extend(files)

    def set_checkpoints(self, checkpoint_names: list[str]) -> None:
        self.checkpoints.clear()
        files = [
            File(id=name, name=name, source=FileSource.remote, format=FileFormat.checkpoint)
            for name in checkpoint_names
        ]
        self.checkpoints.extend(files)
