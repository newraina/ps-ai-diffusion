"""ComfyUI client manager for Bridge.

Simplified ComfyClient implementation using aiohttp instead of PyQt5.
Manages connection, job queue, and result storage.
"""
import asyncio
import json
import struct
import uuid
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import aiohttp

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    queued = "queued"
    executing = "executing"
    finished = "finished"
    error = "error"
    interrupted = "interrupted"


@dataclass
class JobState:
    """State of a generation job."""
    status: JobStatus = JobStatus.queued
    progress: float = 0.0
    images: list[bytes] = field(default_factory=list)
    error: Optional[str] = None
    node_count: int = 0
    sample_count: int = 0
    nodes_done: int = 0
    samples_done: int = 0
    # For multi-image generation
    batch_size: int = 1
    seed: int = 0  # Starting seed, each image uses seed + index


def build_txt2img_workflow(
    prompt: str,
    negative_prompt: str = "",
    width: int = 512,
    height: int = 512,
    steps: int = 20,
    cfg_scale: float = 7.0,
    seed: int = -1,
    checkpoint: str = "",
    batch_size: int = 1,
    sampler: str = "euler",
    scheduler: str = "normal",
) -> tuple[dict, int]:
    """Build a simple txt2img workflow for ComfyUI.

    This is a basic SD1.5/SDXL compatible workflow.

    Returns:
        tuple of (workflow dict, actual seed used)
    """
    if seed < 0:
        seed = int(uuid.uuid4().int % (2**31))

    # Use default checkpoint if not specified
    ckpt_name = checkpoint or "v1-5-pruned-emaonly.safetensors"

    workflow = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": ckpt_name
            }
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": prompt,
                "clip": ["1", 1]
            }
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": negative_prompt,
                "clip": ["1", 1]
            }
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": batch_size
            }
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": steps,
                "cfg": cfg_scale,
                "sampler_name": sampler,
                "scheduler": scheduler,
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0]
            }
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["5", 0],
                "vae": ["1", 2]
            }
        },
        "7": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": "ps_ai_diffusion",
                "images": ["6", 0]
            }
        }
    }

    return workflow, seed


class ComfyClientManager:
    """Manages ComfyUI connection and job execution."""

    def __init__(self):
        self.url: str = ""
        self.client_id: str = str(uuid.uuid4())
        self.jobs: dict[str, JobState] = {}
        self._session: Optional[aiohttp.ClientSession] = None
        self._ws: Optional[aiohttp.ClientWebSocketResponse] = None
        self._listener_task: Optional[asyncio.Task] = None
        self._is_connected: bool = False
        self._auth_token: Optional[str] = None

    @property
    def is_connected(self) -> bool:
        return self._is_connected

    async def connect(self, url: str, auth_token: Optional[str] = None) -> bool:
        """Connect to ComfyUI server."""
        self.url = url.rstrip("/")
        self._auth_token = auth_token

        try:
            # Create session with optional auth
            headers = {}
            if auth_token:
                headers["Authorization"] = f"Bearer {auth_token}"

            self._session = aiohttp.ClientSession(headers=headers)

            # Test connection
            async with self._session.get(f"{self.url}/system_stats", timeout=5) as resp:
                if resp.status != 200:
                    raise Exception(f"Failed to connect: status {resp.status}")
                data = await resp.json()
                logger.info(f"Connected to ComfyUI: {data.get('devices', [])}")

            # Start WebSocket listener
            self._listener_task = asyncio.create_task(self._listen_websocket())
            self._is_connected = True

            return True

        except Exception as e:
            logger.error(f"Failed to connect to ComfyUI: {e}")
            await self.disconnect()
            raise

    async def disconnect(self):
        """Disconnect from ComfyUI server."""
        self._is_connected = False

        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
            self._listener_task = None

        if self._ws:
            await self._ws.close()
            self._ws = None

        if self._session:
            await self._session.close()
            self._session = None

    async def enqueue(
        self,
        prompt: str,
        negative_prompt: str = "",
        width: int = 512,
        height: int = 512,
        steps: int = 20,
        cfg_scale: float = 7.0,
        seed: int = -1,
        checkpoint: str = "",
        batch_size: int = 1,
        sampler: str = "euler",
        scheduler: str = "normal",
    ) -> str:
        """Submit a generation job and return job_id."""
        if not self._session or not self._is_connected:
            raise Exception("Not connected to ComfyUI")

        job_id = str(uuid.uuid4())

        # Build workflow
        workflow, actual_seed = build_txt2img_workflow(
            prompt=prompt,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            steps=steps,
            cfg_scale=cfg_scale,
            seed=seed,
            checkpoint=checkpoint,
            batch_size=batch_size,
            sampler=sampler,
            scheduler=scheduler,
        )

        # Initialize job state
        self.jobs[job_id] = JobState(
            status=JobStatus.queued,
            node_count=len(workflow),
            sample_count=steps,
            batch_size=batch_size,
            seed=actual_seed,
        )

        # Submit to ComfyUI
        data = {
            "prompt": workflow,
            "client_id": self.client_id,
            "prompt_id": job_id,
        }

        try:
            async with self._session.post(
                f"{self.url}/prompt",
                json=data,
                timeout=30
            ) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    raise Exception(f"Failed to submit job: {error_text}")
                result = await resp.json()

                # Verify prompt_id matches
                if result.get("prompt_id") != job_id:
                    logger.warning(f"Prompt ID mismatch: expected {job_id}, got {result.get('prompt_id')}")

                logger.info(f"Job {job_id} submitted successfully")
                return job_id

        except Exception as e:
            self.jobs[job_id].status = JobStatus.error
            self.jobs[job_id].error = str(e)
            raise

    def get_job(self, job_id: str) -> Optional[JobState]:
        """Get job state by ID."""
        return self.jobs.get(job_id)

    async def cancel(self, job_id: str) -> bool:
        """Cancel a job."""
        if not self._session:
            return False

        try:
            async with self._session.post(
                f"{self.url}/queue",
                json={"delete": [job_id]}
            ) as resp:
                if resp.status == 200:
                    if job_id in self.jobs:
                        self.jobs[job_id].status = JobStatus.interrupted
                    return True
        except Exception as e:
            logger.error(f"Failed to cancel job {job_id}: {e}")

        return False

    async def _listen_websocket(self):
        """Listen for WebSocket messages from ComfyUI."""
        ws_url = self.url.replace("http", "ws", 1)

        while self._is_connected:
            try:
                async with self._session.ws_connect(
                    f"{ws_url}/ws?clientId={self.client_id}",
                    max_msg_size=2**30,
                ) as ws:
                    self._ws = ws
                    logger.info("WebSocket connected")

                    async for msg in ws:
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            await self._handle_ws_message(json.loads(msg.data))
                        elif msg.type == aiohttp.WSMsgType.BINARY:
                            await self._handle_ws_binary(msg.data)
                        elif msg.type == aiohttp.WSMsgType.ERROR:
                            logger.error(f"WebSocket error: {ws.exception()}")
                            break

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                if self._is_connected:
                    await asyncio.sleep(1)  # Reconnect delay

    async def _handle_ws_message(self, msg: dict):
        """Handle a WebSocket JSON message."""
        msg_type = msg.get("type")
        data = msg.get("data", {})

        if msg_type == "status":
            # Connection status update
            pass

        elif msg_type == "execution_start":
            job_id = data.get("prompt_id")
            if job_id and job_id in self.jobs:
                self.jobs[job_id].status = JobStatus.executing
                self.jobs[job_id].progress = 0.0
                logger.info(f"Job {job_id} started executing")

        elif msg_type == "progress":
            job_id = data.get("prompt_id")
            if job_id and job_id in self.jobs:
                job = self.jobs[job_id]
                job.samples_done = data.get("value", 0)
                max_val = data.get("max", job.sample_count)
                if max_val > 0:
                    job.progress = job.samples_done / max_val

        elif msg_type == "executing":
            job_id = data.get("prompt_id")
            node = data.get("node")

            if job_id and job_id in self.jobs:
                if node is None:
                    # Execution finished
                    job = self.jobs[job_id]
                    if job.status != JobStatus.error:
                        job.status = JobStatus.finished
                        job.progress = 1.0
                        logger.info(f"Job {job_id} finished")
                else:
                    # Node executing
                    self.jobs[job_id].nodes_done += 1

        elif msg_type == "executed":
            job_id = data.get("prompt_id")
            if job_id and job_id in self.jobs:
                # Check for output images
                output = data.get("output", {})
                images = output.get("images", [])
                for img_info in images:
                    await self._fetch_result_image(job_id, img_info)

        elif msg_type == "execution_error":
            job_id = data.get("prompt_id")
            if job_id and job_id in self.jobs:
                error = data.get("exception_message", "Unknown error")
                self.jobs[job_id].status = JobStatus.error
                self.jobs[job_id].error = error
                logger.error(f"Job {job_id} failed: {error}")

        elif msg_type == "execution_interrupted":
            job_id = data.get("prompt_id")
            if job_id and job_id in self.jobs:
                self.jobs[job_id].status = JobStatus.interrupted
                logger.info(f"Job {job_id} interrupted")

    async def _handle_ws_binary(self, data: bytes):
        """Handle binary WebSocket message (preview images)."""
        # Binary messages contain preview images during generation
        # Format: 4 bytes event type, 4 bytes format, rest is image data
        if len(data) > 8:
            event_type = struct.unpack(">I", data[0:4])[0]
            img_format = struct.unpack(">I", data[4:8])[0]

            # event_type 1 = preview image
            if event_type == 1:
                # We don't store preview images, only final results
                pass

    async def _fetch_result_image(self, job_id: str, img_info: dict):
        """Fetch a result image from ComfyUI."""
        if not self._session:
            return

        filename = img_info.get("filename")
        subfolder = img_info.get("subfolder", "")
        img_type = img_info.get("type", "output")

        if not filename:
            return

        try:
            params = {
                "filename": filename,
                "subfolder": subfolder,
                "type": img_type,
            }
            async with self._session.get(
                f"{self.url}/view",
                params=params,
                timeout=60
            ) as resp:
                if resp.status == 200:
                    image_data = await resp.read()
                    if job_id in self.jobs:
                        self.jobs[job_id].images.append(image_data)
                        logger.info(f"Fetched image for job {job_id}: {filename}")
                else:
                    logger.error(f"Failed to fetch image: status {resp.status}")
        except Exception as e:
            logger.error(f"Failed to fetch image {filename}: {e}")


# Singleton instance
_manager: Optional[ComfyClientManager] = None


def get_manager() -> ComfyClientManager:
    """Get the singleton ComfyClientManager instance."""
    global _manager
    if _manager is None:
        _manager = ComfyClientManager()
    return _manager
