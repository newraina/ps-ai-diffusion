"""Qt-less image helpers compatible with shared API."""
from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from math import sqrt
from typing import Iterable, NamedTuple

from PIL import Image as PilImage

from .settings import ImageFileFormat


def multiple_of(number: int, multiple: int) -> int:
    """Round up to the nearest multiple of a number."""
    return ((number + multiple - 1) // multiple) * multiple


@dataclass(frozen=True)
class Extent:
    width: int
    height: int

    def at_least(self, min_size: int) -> "Extent":
        return Extent(max(self.width, min_size), max(self.height, min_size))

    def multiple_of(self, multiple: int) -> "Extent":
        return Extent(multiple_of(self.width, multiple), multiple_of(self.height, multiple))

    def is_multiple_of(self, multiple: int) -> bool:
        return self.width % multiple == 0 and self.height % multiple == 0

    def scale_keep_aspect(self, target: "Extent") -> "Extent":
        scale = min(target.width / self.width, target.height / self.height)
        return self * scale

    def scale_to_pixel_count(self, pixel_count: int) -> "Extent":
        scale = sqrt(pixel_count / self.pixel_count)
        return self * scale

    @property
    def longest_side(self) -> int:
        return max(self.width, self.height)

    @property
    def shortest_side(self) -> int:
        return min(self.width, self.height)

    @property
    def average_side(self) -> int:
        return (self.width + self.height) // 2

    @property
    def diagonal(self) -> float:
        return sqrt(self.width**2 + self.height**2)

    @property
    def pixel_count(self) -> int:
        return self.width * self.height

    @staticmethod
    def largest(a: "Extent", b: "Extent") -> "Extent":
        return a if a.width * a.height > b.width * b.height else b

    @staticmethod
    def min(a: "Extent", b: "Extent") -> "Extent":
        return Extent(min(a.width, b.width), min(a.height, b.height))

    @staticmethod
    def ratio(a: "Extent", b: "Extent") -> float:
        return sqrt(a.pixel_count / b.pixel_count)

    def __add__(self, other: "Extent") -> "Extent":
        return Extent(self.width + other.width, self.height + other.height)

    def __sub__(self, other: "Extent") -> "Extent":
        return Extent(self.width - other.width, self.height - other.height)

    def __mul__(self, scale: float | int) -> "Extent":
        if isinstance(scale, (float, int)):
            return Extent(round(self.width * scale), round(self.height * scale))
        raise NotImplementedError()

    def __floordiv__(self, div: int) -> "Extent":
        return Extent(self.width // div, self.height // div)


class Bounds(NamedTuple):
    x: int
    y: int
    width: int
    height: int

    @property
    def extent(self) -> Extent:
        return Extent(self.width, self.height)

    @property
    def offset(self):
        return (self.x, self.y)

    @property
    def is_zero(self):
        return self.width * self.height == 0

    def __iter__(self):
        return iter((self.x, self.y, self.width, self.height))

    def is_within(self, x: int, y: int) -> bool:
        return x >= 0 and x < self.width and y >= 0 and y < self.height

    @staticmethod
    def scale(b: "Bounds", scale: float):
        if scale == 1:
            return b

        def apply(value: int):
            return int(round(value * scale))

        return Bounds(apply(b.x), apply(b.y), apply(b.width), apply(b.height))

    @staticmethod
    def from_extent(extent: Extent) -> "Bounds":
        return Bounds(0, 0, extent.width, extent.height)

    @staticmethod
    def from_points(start: "Point", end: "Point") -> "Bounds":
        return Bounds(start.x, start.y, end.x - start.x, end.y - start.y)

    @staticmethod
    def pad(
        bounds: "Bounds",
        padding: int,
        min_size: int = 0,
        multiple: int = 1,
        square: bool = False,
    ) -> "Bounds":
        width = bounds.width + padding * 2
        height = bounds.height + padding * 2
        if square:
            size = max(width, height, min_size)
            width = height = size
        else:
            width = max(width, min_size)
            height = max(height, min_size)
        width = multiple_of(width, multiple)
        height = multiple_of(height, multiple)
        x = bounds.x - (width - bounds.width) // 2
        y = bounds.y - (height - bounds.height) // 2
        return Bounds(x, y, width, height)

    @staticmethod
    def clamp(bounds: "Bounds", extent: Extent) -> "Bounds":
        x = max(0, min(bounds.x, extent.width - 1))
        y = max(0, min(bounds.y, extent.height - 1))
        width = max(1, min(bounds.width, extent.width - x))
        height = max(1, min(bounds.height, extent.height - y))
        return Bounds(x, y, width, height)


class Point(NamedTuple):
    x: int
    y: int

    def __add__(self, other):
        x, y = other[0], other[1]
        return Point(self.x + x, self.y + y)

    def __sub__(self, other: "Point"):
        return Point(self.x - other.x, self.y - other.y)

    def __mul__(self, other):
        if isinstance(other, Point):
            return Point(self.x * other.x, self.y * other.y)
        return Point(self.x * other, self.y * other)

    def __floordiv__(self, div: int):
        return Point(self.x // div, self.y // div)

    def clamp(self, bounds: Bounds):
        x = min(max(self.x, bounds.x), bounds.x + bounds.width)
        y = min(max(self.y, bounds.y), bounds.y + bounds.height)
        return Point(x, y)


class Image:
    """Pillow-backed image wrapper with shared-like API."""

    def __init__(self, pil_image: PilImage.Image):
        self._pil = pil_image

    @staticmethod
    def load(filepath: str) -> "Image":
        return Image(PilImage.open(filepath))

    @staticmethod
    def create(extent: Extent, fill=None) -> "Image":
        size = (extent.width, extent.height)
        img = PilImage.new("RGBA", size, fill if fill is not None else (0, 0, 0, 0))
        return Image(img)

    @staticmethod
    def copy(image: "Image") -> "Image":
        return Image(image._pil.copy())

    @staticmethod
    def from_bytes(data: bytes | memoryview, format: str | None = None) -> "Image":
        raw = bytes(data)
        with BytesIO(raw) as buffer:
            img = PilImage.open(buffer)
            img.load()
            if format:
                img.format = format
            return Image(img)

    @staticmethod
    def from_base64(data: str) -> "Image":
        import base64

        raw = base64.b64decode(data)
        return Image.from_bytes(raw)

    @property
    def width(self) -> int:
        return self._pil.width

    @property
    def height(self) -> int:
        return self._pil.height

    @property
    def extent(self) -> Extent:
        return Extent(self.width, self.height)

    @property
    def is_mask(self) -> bool:
        return self._pil.mode == "L"

    def to_grayscale(self) -> "Image":
        if self._pil.mode != "L":
            self._pil = self._pil.convert("L")
        return self

    @property
    def data(self) -> bytes:
        return self._pil.tobytes()

    def to_bytes(self, format: ImageFileFormat | None = ImageFileFormat.png) -> bytes:
        fmt = ImageFileFormat.png if format is None else format
        return _encode_image_bytes(self._pil, fmt)

    @staticmethod
    def scale(img: "Image", target: Extent) -> "Image":
        if img.extent == target:
            return img
        resized = img._pil.resize((target.width, target.height), resample=PilImage.LANCZOS)
        return Image(resized)

    @staticmethod
    def scale_to_fit(img: "Image", target: Extent) -> "Image":
        return Image.scale(img, img.extent.scale_keep_aspect(target))

    @staticmethod
    def crop(img: "Image", bounds: Bounds) -> "Image":
        cropped = img._pil.crop(
            (bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height)
        )
        return Image(cropped)

    @classmethod
    def mask_subtract(cls, lhs: "Image", rhs: "Image"):
        from PIL import ImageChops

        a = lhs._pil.convert("L")
        b = rhs._pil.convert("L")
        return Image(ImageChops.subtract(a, b))

    @classmethod
    def mask_add(cls, lhs: "Image", rhs: "Image"):
        from PIL import ImageChops

        a = lhs._pil.convert("L")
        b = rhs._pil.convert("L")
        return Image(ImageChops.add(a, b))


class Mask:
    """Minimal grayscale mask container."""

    def __init__(self, bounds: Bounds, data: bytes | Image):
        self.bounds = bounds
        if isinstance(data, Image):
            self._image = data.to_grayscale()
        else:
            pil = PilImage.frombytes("L", (bounds.width, bounds.height), data)
            self._image = Image(pil)

    @staticmethod
    def transparent(bounds: Bounds) -> "Mask":
        return Mask(bounds, bytes(bounds.width * bounds.height))

    def to_image(self, extent: Extent | None = None) -> Image:
        if extent is None or (extent.width == self.bounds.width and extent.height == self.bounds.height):
            return self._image
        img = PilImage.new("L", (extent.width, extent.height), 0)
        img.paste(self._image._pil, (self.bounds.x, self.bounds.y))
        return Image(img)

    def value(self, x: int, y: int) -> int:
        if not self.bounds.is_within(x, y):
            return 0
        return self._image._pil.getpixel((x, y))

    def to_array(self) -> list[int]:
        e = self.bounds.extent
        return [self.value(x, y) for y in range(e.height) for x in range(e.width)]


class ImageCollection:
    """Collection of Images with binary packing helpers."""

    def __init__(self, images: Iterable[Image] | None = None):
        self._images = list(images or [])

    def append(self, image: Image) -> None:
        self._images.append(image)

    def __len__(self) -> int:
        return len(self._images)

    def __iter__(self):
        return iter(self._images)

    def __getitem__(self, index: int) -> Image:
        return self._images[index]

    def to_bytes(self, format: ImageFileFormat | None = ImageFileFormat.png):
        blob = bytearray()
        offsets: list[int] = []
        for img in self._images:
            offsets.append(len(blob))
            blob.extend(img.to_bytes(format))
        return _BlobBytes(bytes(blob)), offsets

    @staticmethod
    def from_bytes(data: bytes, offsets: list[int]) -> "ImageCollection":
        images: list[Image] = []
        for i, offset in enumerate(offsets):
            end = offsets[i + 1] if i + 1 < len(offsets) else len(data)
            images.append(Image.from_bytes(data[offset:end]))
        return ImageCollection(images)


class _BlobBytes:
    """QByteArray-like wrapper for Serializer expectations."""

    def __init__(self, data: bytes):
        self._data = data

    def size(self) -> int:
        return len(self._data)

    def data(self) -> bytes:
        return self._data


def _encode_image_bytes(img: PilImage.Image, fmt: ImageFileFormat) -> bytes:
    format_extension = fmt.extension.upper()
    pil_image = img
    params: dict[str, object] = {}

    if format_extension in ["JPG", "JPEG"]:
        if pil_image.mode not in ["RGB", "L"]:
            pil_image = pil_image.convert("RGB")
        params["quality"] = fmt.quality
    elif format_extension == "WEBP":
        params["quality"] = fmt.quality
        if fmt is ImageFileFormat.webp_lossless:
            params["lossless"] = True

    try:
        with BytesIO() as buffer:
            pil_image.save(buffer, format=format_extension, **params)
            return buffer.getvalue()
    except Exception:
        if fmt is not fmt.no_webp_fallback:
            return _encode_image_bytes(pil_image, fmt.no_webp_fallback)
        raise
