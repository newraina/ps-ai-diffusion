"""Localization shim with identity translation."""


def translate(text: str, **kwargs) -> str:
    try:
        return text.format(**kwargs) if kwargs else text
    except Exception:
        return text
