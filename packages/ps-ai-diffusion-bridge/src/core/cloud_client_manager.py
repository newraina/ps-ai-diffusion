"""
CloudClientManager wraps the cloud service API, providing an interface similar to ComfyClientManager.
This is a reimplementation of shared/cloud_client.py without Qt dependencies.
"""

import asyncio
import os
import platform
import uuid
from dataclasses import asdict
from enum import Enum
from typing import AsyncIterator

from .aiohttp_request_manager import AiohttpRequestManager, NetworkError
from .cloud_types import (
    CloudFeatures,
    CloudJobState,
    CloudJobStatus,
    CloudNews,
    CloudUser,
    ImageData,
)

# Import shared modules that don't depend on Qt
import src.path_setup  # noqa: F401

from shared.api import WorkflowInput

# Plugin version for API calls
PLUGIN_VERSION = "1.0.0"

# Polling interval for job status
POLL_INTERVAL = 0.5  # seconds

# Auth timeout
AUTH_TIMEOUT = 300  # seconds


class JobState(Enum):
    """Internal job state for three-stage processing."""

    send = 1
    generate = 2
    receive = 3
    cancelled = 4
    finalized = 5


class CloudClientManager:
    """
    Manages connection to Interstice cloud service.
    Provides interface similar to ComfyClientManager for consistency.
    """

    default_api_url = os.getenv("INTERSTICE_URL", "https://api.interstice.cloud")
    default_web_url = os.getenv("INTERSTICE_WEB_URL", "https://www.interstice.cloud")

    def __init__(self):
        self._requests = AiohttpRequestManager()
        self._token: str | None = None
        self._user: CloudUser | None = None
        self._news: CloudNews | None = None
        self._features = CloudFeatures()
        self._is_connected = False
        self._jobs: dict[str, CloudJobState] = {}
        self._models: dict = {}

        # For sign-in flow state
        self._sign_in_client_id: str | None = None

    @property
    def is_connected(self) -> bool:
        return self._is_connected

    @property
    def user(self) -> CloudUser | None:
        return self._user

    @property
    def news(self) -> CloudNews | None:
        return self._news

    @property
    def features(self) -> CloudFeatures:
        return self._features

    @property
    def models(self) -> dict:
        return self._models

    async def _get(self, op: str) -> dict:
        """GET request to cloud API."""
        return await self._requests.get(
            f"{self.default_api_url}/{op}", bearer=self._token
        )

    async def _post(self, op: str, data: dict) -> dict:
        """POST request to cloud API."""
        return await self._requests.post(
            f"{self.default_api_url}/{op}", data, bearer=self._token
        )

    # === Authentication ===

    async def sign_in_start(self) -> str:
        """
        Start the sign-in flow. Returns the URL for user to visit.

        Returns:
            URL for user to open in browser to complete sign-in
        """
        self._sign_in_client_id = str(uuid.uuid4())
        info = f"PS AI Diffusion [Device: {platform.node()}]"

        init = await self._post(
            "auth/initiate",
            {"client_id": self._sign_in_client_id, "client_info": info},
        )

        sign_in_url = f"{self.default_web_url}{init['url']}"
        return sign_in_url

    async def sign_in_confirm(self) -> tuple[str, CloudUser] | None:
        """
        Check if sign-in is complete.

        Returns:
            Tuple of (token, user) if authorized, None if still pending
        """
        if not self._sign_in_client_id:
            raise ValueError("sign_in_start() must be called first")

        auth_confirm = await self._post(
            "auth/confirm", {"client_id": self._sign_in_client_id}
        )

        status = auth_confirm.get("status", "")

        if status == "authorized":
            token = auth_confirm["token"]
            self._sign_in_client_id = None  # Clear state
            user = await self.authenticate(token)
            return (token, user)
        elif status == "not-found":
            return None
        else:
            self._sign_in_client_id = None
            raise RuntimeError(f"Authorization failed: {status}")

    async def sign_in(self) -> AsyncIterator[str | tuple[str, CloudUser]]:
        """
        Complete sign-in flow as async generator.
        First yields sign_in_url, then yields (token, user) when complete.

        Yields:
            First: sign_in_url (str)
            Then: (token, user) tuple when authorized
        """
        sign_in_url = await self.sign_in_start()
        yield sign_in_url

        start_time = asyncio.get_event_loop().time()
        while True:
            result = await self.sign_in_confirm()
            if result is not None:
                yield result
                return

            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed > AUTH_TIMEOUT:
                raise TimeoutError("Sign-in attempt timed out after 5 minutes")

            await asyncio.sleep(2)

    async def authenticate(self, token: str) -> CloudUser:
        """
        Authenticate with existing token.

        Args:
            token: Access token from previous sign-in

        Returns:
            CloudUser with account info
        """
        if not token:
            raise ValueError("Authorization token is required")

        self._token = token

        try:
            user_data = await self._get(f"user?plugin_version={PLUGIN_VERSION}")
        except NetworkError as e:
            self._token = None
            if e.status == 401:
                e.message = "The login data is incorrect, please sign in again."
            raise e

        self._user = CloudUser(
            id=user_data["id"],
            name=user_data["name"],
            credits=user_data.get("credits", 0),
            images_generated=user_data.get("images_generated", 0),
        )

        self._features = self._enumerate_features(user_data)

        if news_text := user_data.get("news"):
            import hashlib

            digest = hashlib.sha256(news_text.encode("utf-8")).hexdigest()[:16]
            self._news = CloudNews(news_text, digest)

        # Fetch available models
        model_data = await self._get("plugin/resources")
        self._models = model_data

        self._is_connected = True
        return self._user

    def _enumerate_features(self, user_data: dict) -> CloudFeatures:
        """Extract features from user data."""
        return CloudFeatures(
            ip_adapter=True,
            translation=True,
            max_upload_size=user_data.get("max_upload_size", 300 * 1024 * 1024),
            max_control_layers=user_data.get("max_control_layers", 4),
        )

    async def disconnect(self):
        """Disconnect from cloud service."""
        self._is_connected = False
        self._token = None
        self._user = None
        await self._requests.close()

    # === Job Management ===

    async def enqueue(self, work: WorkflowInput) -> str:
        """
        Submit a generation job.

        Args:
            work: WorkflowInput describing the generation

        Returns:
            Local job ID
        """
        if not self._is_connected:
            raise RuntimeError("Not connected to cloud service")

        job_id = str(uuid.uuid4())
        self._jobs[job_id] = CloudJobState(status=CloudJobStatus.queued)

        # Start job processing in background
        asyncio.create_task(self._process_job(job_id, work))

        return job_id

    async def _process_job(self, job_id: str, work: WorkflowInput):
        """Process a job through send -> generate -> receive stages."""
        job = self._jobs[job_id]

        try:
            # Stage 1: Send (prepare and upload inputs)
            job.status = CloudJobStatus.uploading
            input_data = work.to_dict(max_image_size=16 * 1024)
            await self._send_images(input_data)

            # Stage 2: Generate (submit and poll)
            job.status = CloudJobStatus.in_queue
            data = {
                "input": {
                    "workflow": input_data,
                    "clientInfo": f"ps-ai-diffusion {PLUGIN_VERSION}",
                    "options": {"useWebpCompression": False},
                }
            }

            response = await self._post("generate", data)
            remote_id = response["id"]
            worker_id = response.get("worker_id")

            # Update user credits
            if self._user and "user" in response:
                self._user.credits = response["user"].get(
                    "credits", self._user.credits
                )
                self._user.images_generated = response["user"].get(
                    "images_generated", self._user.images_generated
                )

            # Poll for completion
            status = response.get("status", "").lower()
            while status in ("in_queue", "in_progress"):
                response = await self._post(f"status/{remote_id}", {})
                status = response.get("status", "").lower()

                if status == "in_queue":
                    job.status = CloudJobStatus.in_queue
                elif status == "in_progress":
                    job.status = CloudJobStatus.in_progress
                    if output := response.get("output"):
                        job.progress = output.get("progress", 0.09)

                await asyncio.sleep(POLL_INTERVAL)

            # Handle final status
            if status == "completed":
                # Stage 3: Receive images
                output = response.get("output", {})
                images = await self._receive_images(output.get("images", {}))
                job.images = images.images
                job.status = CloudJobStatus.finished
                job.progress = 1.0

            elif status == "failed":
                error = response.get("error", "Generation failed")
                job.status = CloudJobStatus.error
                job.error = str(error)

            elif status == "cancelled":
                job.status = CloudJobStatus.cancelled

            elif status == "timed_out":
                job.status = CloudJobStatus.timed_out
                job.error = "Generation took too long and was cancelled (timeout)"

        except NetworkError as e:
            job.status = CloudJobStatus.error
            if e.status == 402:
                job.error = "Insufficient credits. Please purchase more tokens."
            else:
                job.error = e.message

        except Exception as e:
            job.status = CloudJobStatus.error
            job.error = str(e)

    async def _send_images(self, inputs: dict, max_inline_size: int = 4096):
        """Upload images if needed."""
        if image_data := inputs.get("image_data"):
            blob = image_data.get("bytes", b"")
            offsets = image_data.get("offsets", [])

            if isinstance(blob, bytes):
                import base64
                import math

                base64_size = math.ceil(len(blob) / 3) * 4
                if base64_size < max_inline_size:
                    # Small image: inline as base64
                    encoded = base64.b64encode(blob).decode("utf-8")
                    inputs["image_data"] = {"base64": encoded, "offsets": offsets}
                else:
                    # Large image: upload to S3
                    s3_object = await self._upload_image(blob)
                    inputs["image_data"] = {"s3_object": s3_object, "offsets": offsets}

    async def _upload_image(self, data: bytes) -> str:
        """Upload image to temporary S3 storage."""
        upload_info = await self._post("upload/image", {})
        await self._requests.put(upload_info["url"], data)
        return upload_info["object"]

    async def _receive_images(self, images: dict) -> ImageData:
        """Download result images."""
        offsets = images.get("offsets", [])
        if not offsets:
            return ImageData([])

        if url := images.get("url"):
            data = await self._requests.download(url)
            return ImageData.from_bytes(data, offsets)
        elif b64 := images.get("base64"):
            return ImageData.from_base64(b64, offsets)
        else:
            raise ValueError("No result images found in server response")

    def get_job(self, job_id: str) -> CloudJobState | None:
        """Get job state by ID."""
        return self._jobs.get(job_id)

    async def cancel(self, job_id: str) -> bool:
        """
        Cancel a job.

        Args:
            job_id: Job ID to cancel

        Returns:
            True if cancellation was requested
        """
        job = self._jobs.get(job_id)
        if not job:
            return False

        # Mark as cancelled - the processing task will handle it
        job.status = CloudJobStatus.cancelled
        return True

    def get_job_images(self, job_id: str) -> list[bytes]:
        """Get images for a completed job."""
        job = self._jobs.get(job_id)
        if job and job.status == CloudJobStatus.finished:
            return job.images
        return []


# Global instance
cloud_manager = CloudClientManager()
