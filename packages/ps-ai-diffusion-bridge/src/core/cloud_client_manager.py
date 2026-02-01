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
    CloudPaymentRequired,
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

    async def enqueue(
        self,
        work: WorkflowInput,
        lora_payloads: dict[str, tuple[str, bytes]] | None = None,
    ) -> str:
        """
        Submit a generation job.

        Args:
            work: WorkflowInput describing the generation

        Returns:
            Local job ID
        """
        if not self._is_connected:
            raise RuntimeError("Not connected to cloud service")

        # Apply cloud service limits (same as krita-ai-diffusion)
        _apply_limits(work, self._features)

        job_id = str(uuid.uuid4())
        self._jobs[job_id] = CloudJobState(status=CloudJobStatus.queued)

        # Start job processing in background
        asyncio.create_task(self._process_job(job_id, work, lora_payloads or {}))

        return job_id

    async def _process_job(
        self,
        job_id: str,
        work: WorkflowInput,
        lora_payloads: dict[str, tuple[str, bytes]],
    ):
        """Process a job through send -> generate -> receive stages."""
        import logging
        logger = logging.getLogger(__name__)

        job = self._jobs[job_id]

        try:
            # Stage 1: Send (prepare and upload inputs)
            job.status = CloudJobStatus.uploading
            input_data = work.to_dict(max_image_size=16 * 1024)
            logger.info(f"[Cloud] Workflow input_data keys: {input_data.keys()}")
            logger.info(f"[Cloud] Workflow kind: {input_data.get('kind')}")
            logger.info(f"[Cloud] Workflow models: {input_data.get('models')}")
            logger.info(f"[Cloud] Workflow sampling: {input_data.get('sampling')}")
            await self._send_loras(work, lora_payloads)
            await self._send_images(input_data)

            if job.cancel_requested:
                job.status = CloudJobStatus.cancelled
                return

            # Stage 2: Generate (submit and poll)
            job.status = CloudJobStatus.in_queue
            data = {
                "input": {
                    "workflow": input_data,
                    "clientInfo": f"ps-ai-diffusion {PLUGIN_VERSION}",
                    "options": {"useWebpCompression": False},
                }
            }

            logger.info(f"[Cloud] Submitting generate request...")
            response = await self._post("generate", data)
            logger.info(f"[Cloud] Generate response keys: {response.keys()}")
            logger.info(f"[Cloud] Generate response id: {response.get('id')}")
            logger.info(f"[Cloud] Generate response worker_id: {response.get('worker_id')}")
            logger.info(f"[Cloud] Generate response status: {response.get('status')}")
            logger.info(f"[Cloud] Generate response full: {response}")
            remote_id = response["id"]
            worker_id = response.get("worker_id")
            job.remote_id = remote_id
            job.worker_id = worker_id

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
            logger.info(f"[Cloud] Initial status: {status}")
            while status in ("in_queue", "in_progress"):
                if job.cancel_requested:
                    # Cancellation request is handled via cancel() which also performs remote cancel.
                    # We stop polling and let the job end in cancelled state.
                    job.status = CloudJobStatus.cancelled
                    return

                response = await self._post(f"status/{remote_id}", {})
                status = response.get("status", "").lower()
                logger.info(f"[Cloud] Poll status: {status}, response: {response}")

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
            logger.error(f"[Cloud] NetworkError: status={e.status}, message={e.message}")
            job.status = CloudJobStatus.error
            if e.status == 402:
                # 402 Payment Required: provide structured payload for UI CTAs.
                credits = None
                details = None
                if isinstance(e.data, dict):
                    credits = e.data.get("credits")
                    details = e.data

                if self._user and isinstance(credits, int):
                    self._user.credits = credits

                job.payment_required = CloudPaymentRequired(
                    url=f"{self.default_web_url}/user",
                    credits=credits,
                    details=details,
                )
                job.error = e.message or "Insufficient credits. Please purchase more tokens."
            else:
                job.error = e.message

        except Exception as e:
            logger.exception(f"[Cloud] Unexpected error: {e}")
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

    async def _send_loras(self, work: WorkflowInput, lora_payloads: dict[str, tuple[str, bytes]]):
        """Upload LoRA payloads if provided.

        Notes:
            This is a simplified version of upstream LoRA upload logic.
            It only uploads LoRAs that include payload bytes in the request.
        """
        if not lora_payloads:
            return

        models = work.models
        if not models or not models.loras:
            return

        for lora in models.loras:
            if lora.name not in lora_payloads:
                continue
            storage_id, data = lora_payloads[lora.name]
            # Ensure WorkflowInput references the uploaded storage id.
            lora.storage_id = storage_id
            await self._upload_lora(storage_id, data)

    async def _upload_lora(self, storage_id: str, data: bytes) -> None:
        """Upload LoRA to temporary S3 storage via cloud API."""
        upload = await self._post("upload/lora", {"hash": storage_id, "size": len(data)})
        status = upload.get("status", "")
        if status == "too-large":
            max_size = int(upload.get("max", 0)) / (1024 * 1024)
            raise ValueError(f"LoRA model is too large to upload (max {max_size:.1f} MB)")
        if status == "limit-exceeded":
            raise ValueError("Can't upload LoRA model, limit exceeded")
        if status == "cached":
            return

        url = upload.get("url")
        if not url:
            raise ValueError("Invalid upload URL for LoRA")

        # Use S3 checksum header with base64-encoded sha256 (storage_id).
        async for _sent, _total in self._requests.upload(url, data, sha256=storage_id):
            pass

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

        job.cancel_requested = True

        # If we already have remote identifiers, request remote cancellation as well.
        if job.remote_id and job.worker_id:
            try:
                await self._post(f"cancel/{job.worker_id}/{job.remote_id}", {})
            except Exception:
                # If remote cancel fails, still mark local job as cancelled.
                # The status polling loop will stop on cancel_requested.
                pass

        job.status = CloudJobStatus.cancelled
        return True

    def get_job_images(self, job_id: str) -> list[bytes]:
        """Get images for a completed job."""
        job = self._jobs.get(job_id)
        if job and job.status == CloudJobStatus.finished:
            return job.images
        return []


def _apply_limits(work: WorkflowInput, features: CloudFeatures):
    """Apply cloud service limits to workflow (same as krita-ai-diffusion)."""
    if work.models:
        work.models.self_attention_guidance = False
    if work.conditioning:
        max_control = features.max_control_layers if features else 4
        work.conditioning.control = work.conditioning.control[:max_control]
        for region in work.conditioning.regions:
            region.control = region.control[:max_control]
    if work.sampling:
        work.sampling.total_steps = min(work.sampling.total_steps, 1000)


# Global instance
cloud_manager = CloudClientManager()
