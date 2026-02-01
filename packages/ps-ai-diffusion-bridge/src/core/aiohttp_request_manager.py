"""
Aiohttp implementation of RequestManager, replacing Qt's QNetworkAccessManager.
Provides the same interface as shared/network.py's RequestManager but uses aiohttp.
"""

import asyncio
import json
import ssl
from typing import AsyncIterator

import aiohttp
import certifi


class NetworkError(Exception):
    """Network error with status code and details."""

    def __init__(
        self,
        code: int,
        message: str,
        url: str,
        status: int | None = None,
        data: dict | None = None,
    ):
        self.code = code
        self.message = message
        self.url = url
        self.status = status
        self.data = data
        super().__init__(message)

    def __str__(self):
        return self.message


class AiohttpRequestManager:
    """
    Aiohttp implementation of RequestManager.
    Provides async HTTP methods compatible with shared/cloud_client.py.
    """

    def __init__(self):
        self._session: aiohttp.ClientSession | None = None
        self._bearer_token: str | None = None

    async def ensure_session(self):
        """Lazy session creation with proper SSL context."""
        if self._session is None or self._session.closed:
            # Create SSL context using certifi's CA bundle
            ssl_context = ssl.create_default_context(cafile=certifi.where())
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            self._session = aiohttp.ClientSession(connector=connector)

    def set_auth(self, bearer: str):
        """Set default bearer token for all requests."""
        self._bearer_token = bearer

    def _get_headers(self, bearer: str | None = None) -> dict:
        """Build request headers with optional bearer token."""
        headers = {}
        token = bearer or self._bearer_token
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    async def get(
        self,
        url: str,
        timeout: float | None = None,
        bearer: str | None = None,
    ) -> dict | bytes:
        """
        GET request, auto-parses JSON responses.

        Args:
            url: Request URL
            timeout: Optional timeout in seconds
            bearer: Optional bearer token (overrides default)

        Returns:
            Parsed JSON dict or raw bytes
        """
        await self.ensure_session()
        assert self._session is not None

        headers = self._get_headers(bearer)
        client_timeout = aiohttp.ClientTimeout(total=timeout) if timeout else None

        try:
            async with self._session.get(
                url, headers=headers, timeout=client_timeout
            ) as response:
                return await self._handle_response(response, url)
        except aiohttp.ClientError as e:
            raise NetworkError(0, str(e), url)
        except asyncio.TimeoutError:
            raise NetworkError(
                0, "Connection timed out, the server took too long to respond", url
            )

    async def post(
        self,
        url: str,
        data: dict,
        bearer: str | None = None,
    ) -> dict | bytes:
        """
        POST JSON request.

        Args:
            url: Request URL
            data: JSON data to send
            bearer: Optional bearer token (overrides default)

        Returns:
            Parsed JSON dict or raw bytes
        """
        await self.ensure_session()
        assert self._session is not None

        headers = self._get_headers(bearer)
        headers["Content-Type"] = "application/json"

        try:
            async with self._session.post(
                url, json=data, headers=headers
            ) as response:
                return await self._handle_response(response, url)
        except aiohttp.ClientError as e:
            raise NetworkError(0, str(e), url)

    async def put(self, url: str, data: bytes) -> None:
        """
        PUT binary data (for S3 upload).

        Args:
            url: Request URL
            data: Binary data to upload
        """
        await self.ensure_session()
        assert self._session is not None

        headers = {"Content-Type": "application/octet-stream"}

        try:
            async with self._session.put(url, data=data, headers=headers) as response:
                if response.status >= 400:
                    text = await response.text()
                    raise NetworkError(
                        response.status,
                        f"Upload failed: {text}",
                        url,
                        status=response.status,
                    )
        except aiohttp.ClientError as e:
            raise NetworkError(0, str(e), url)

    async def upload(
        self,
        url: str,
        data: bytes,
        sha256: str | None = None,
    ) -> AsyncIterator[tuple[int, int]]:
        """
        Upload file with progress tracking.

        Args:
            url: Request URL
            data: Binary data to upload
            sha256: Optional SHA256 checksum for S3

        Yields:
            Tuple of (bytes_sent, total_bytes)
        """
        await self.ensure_session()
        assert self._session is not None

        headers = {"Content-Type": "application/octet-stream"}
        if sha256:
            headers["x-amz-checksum-sha256"] = sha256

        total = len(data)
        chunk_size = 64 * 1024  # 64KB chunks for progress reporting

        try:
            # For simple implementation, we upload all at once
            # and report progress at start and end
            yield (0, total)

            async with self._session.put(url, data=data, headers=headers) as response:
                if response.status >= 400:
                    text = await response.text()
                    raise NetworkError(
                        response.status,
                        f"Upload failed: {text}",
                        url,
                        status=response.status,
                    )

            yield (total, total)
        except aiohttp.ClientError as e:
            raise NetworkError(0, str(e), url)

    async def download(self, url: str, timeout: float | None = None) -> bytes:
        """
        Download file.

        Args:
            url: Request URL
            timeout: Optional timeout in seconds

        Returns:
            Downloaded bytes
        """
        await self.ensure_session()
        assert self._session is not None

        client_timeout = aiohttp.ClientTimeout(total=timeout) if timeout else None

        try:
            async with self._session.get(url, timeout=client_timeout) as response:
                if response.status >= 400:
                    text = await response.text()
                    raise NetworkError(
                        response.status,
                        f"Download failed: {text}",
                        url,
                        status=response.status,
                    )
                return await response.read()
        except aiohttp.ClientError as e:
            raise NetworkError(0, str(e), url)
        except asyncio.TimeoutError:
            raise NetworkError(
                0, "Connection timed out, the server took too long to respond", url
            )

    async def _handle_response(
        self, response: aiohttp.ClientResponse, url: str
    ) -> dict | bytes:
        """Handle response, parsing JSON if appropriate."""
        if response.status >= 400:
            try:
                data = await response.json()
                error = data.get("error", "Network error")
                raise NetworkError(
                    response.status,
                    f"{error} ({response.reason})",
                    url,
                    status=response.status,
                    data=data,
                )
            except (json.JSONDecodeError, aiohttp.ContentTypeError):
                text = await response.text()
                raise NetworkError(
                    response.status,
                    f"{text} ({response.reason})",
                    url,
                    status=response.status,
                )

        content_type = response.headers.get("Content-Type", "")
        if "application/json" in content_type:
            return await response.json()
        else:
            return await response.read()

    async def close(self):
        """Close the session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
