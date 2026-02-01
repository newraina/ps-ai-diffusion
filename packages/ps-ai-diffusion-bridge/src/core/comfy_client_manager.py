"""ComfyUI client manager for Bridge.

Simplified ComfyClient implementation using aiohttp instead of PyQt5.
Manages connection, job queue, and result storage.
"""
import asyncio
import json
import struct
import uuid
import logging
from itertools import chain
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


DEFAULT_CHECKPOINT = "v1-5-pruned-emaonly.safetensors"


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
        self._object_info: Optional[dict] = None
        self._supports_etn: Optional[bool] = None
        self._models = None
        self._missing_nodes: list[str] = []
        self._missing_required_models: list[str] = []
        self._missing_optional_models: list[str] = []

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

            # Validate environment and load models for shared workflow
            await self._refresh_shared_models()

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
        image: Optional[str] = None,
        strength: float = 1.0,
    ) -> str:
        """Submit a generation job and return job_id."""
        if not self._session or not self._is_connected:
            raise Exception("Not connected to ComfyUI")

        return await self._enqueue_shared_workflow(
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
            image=image,
            strength=strength,
        )

    async def _enqueue_shared_workflow(
        self,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        steps: int,
        cfg_scale: float,
        seed: int,
        checkpoint: str,
        batch_size: int,
        sampler: str,
        scheduler: str,
        image: Optional[str],
        strength: float,
    ) -> str | None:
        """Enqueue a job using shared workflow and ETN nodes."""
        await self._require_shared_nodes()

        import base64
        import random
        import src.path_setup  # noqa: F401

        from shared.api import (
            WorkflowInput,
            WorkflowKind,
            ImageInput,
            ExtentInput,
            SamplingInput,
            ConditioningInput,
            CheckpointInput,
        )
        from shared.image import Extent, Image
        from shared.workflow import create as create_workflow
        from shared.comfy_workflow import ComfyRunMode
        from src.shared_shim.client import resolve_arch

        actual_seed = seed if seed >= 0 else random.randint(0, 2**31 - 1)
        ckpt_name = checkpoint or DEFAULT_CHECKPOINT
        arch = resolve_arch(ckpt_name)

        if self._models is None:
            await self._refresh_shared_models()
        assert self._models is not None
        if ckpt_name not in self._models.checkpoints:
            raise RuntimeError(f"Checkpoint not found: {ckpt_name}")

        extent = Extent(width, height)
        extent_input = ExtentInput(
            input=extent,
            initial=extent,
            desired=extent,
            target=extent,
        )

        kind = WorkflowKind.generate
        images = ImageInput(extent=extent_input)
        if image and strength < 1.0:
            kind = WorkflowKind.refine
            image_b64 = image.split(",", 1)[1] if "," in image else image
            image_bytes = base64.b64decode(image_b64)
            images.initial_image = Image.from_bytes(image_bytes)

        sampling = SamplingInput(
            sampler=sampler,
            scheduler=scheduler,
            cfg_scale=cfg_scale,
            total_steps=steps,
            start_step=0 if strength >= 1.0 else int(steps * (1 - strength)),
            seed=actual_seed,
        )

        conditioning = ConditioningInput(
            positive=prompt,
            negative=negative_prompt or "",
        )

        work = WorkflowInput(
            kind=kind,
            images=images,
            sampling=sampling,
            conditioning=conditioning,
            models=CheckpointInput(checkpoint=ckpt_name, version=arch),
            batch_count=batch_size,
        )

        return await self.enqueue_workflow(work, batch_size=batch_size, seed=actual_seed)

    async def _get_object_info(self) -> dict | None:
        """Fetch ComfyUI /object_info and cache it."""
        if self._object_info is not None:
            return self._object_info
        if not self._session:
            return None
        try:
            async with self._session.get(
                f"{self.url}/object_info",
                timeout=30,
            ) as resp:
                if resp.status == 200:
                    self._object_info = await resp.json()
                    return self._object_info
        except Exception as e:
            logger.debug("Failed to fetch object_info: %s", e)
        return None

    async def _get_model_info(self, folder_name: str) -> dict | None:
        """Fetch model info via ETN endpoint if available."""
        if not self._session:
            return None
        try:
            offset = 0
            total = 100
            results: dict = {}
            while offset < total:
                async with self._session.get(
                    f"{self.url}/api/etn/model_info/{folder_name}?offset={offset}&limit=8",
                    timeout=30,
                ) as resp:
                    if resp.status != 200:
                        return None
                    data = await resp.json()
                    if "_meta" not in data:
                        return data
                    total = data["_meta"]["total"]
                    del data["_meta"]
                    results.update(data)
                    offset += 8
            return results
        except Exception:
            return None

    @staticmethod
    def _compute_missing_nodes(nodes, required_custom_nodes) -> list[str]:
        missing = []
        for node in required_custom_nodes:
            for name in node.nodes:
                if name not in nodes:
                    missing.append(name)
        return sorted(set(missing))

    @staticmethod
    def _compute_missing_models(
        models,
        required_models,
        default_checkpoints,
        upscale_models,
        optional_models,
        ResourceKind,
    ) -> tuple[list[str], list[str]]:
        missing_required = []
        for model in chain(required_models, default_checkpoints, upscale_models):
            if model.id.kind is ResourceKind.checkpoint:
                if model.filename not in models.checkpoints:
                    missing_required.append(model.id.string)
            elif models.find(model.id) is None:
                missing_required.append(model.id.string)

        missing_optional = []
        for model in optional_models:
            if model.id.kind is ResourceKind.checkpoint:
                if model.filename not in models.checkpoints:
                    missing_optional.append(model.id.string)
            elif models.find(model.id) is None:
                missing_optional.append(model.id.string)

        return sorted(set(missing_required)), sorted(set(missing_optional))

    async def get_diagnostics(self) -> dict:
        """Collect missing node/model diagnostics for shared workflow."""
        if not self._session or not self._is_connected:
            return {
                "connected": False,
                "error": "Not connected to ComfyUI",
                "missing_nodes": [],
                "missing_required_models": [],
                "missing_optional_models": [],
            }

        import src.path_setup  # noqa: F401

        from shared.comfy_workflow import ComfyObjectInfo
        from shared.resources import (
            required_custom_nodes,
            required_models,
            default_checkpoints,
            upscale_models,
            optional_models,
            ResourceKind,
        )
        from src.shared_shim.client import build_client_models

        object_info = await self._get_object_info()
        if not object_info:
            return {
                "connected": True,
                "error": "ComfyUI /object_info is unavailable",
                "missing_nodes": [],
                "missing_required_models": [],
                "missing_optional_models": [],
            }

        nodes = ComfyObjectInfo(object_info)
        missing_nodes = self._compute_missing_nodes(nodes, required_custom_nodes)

        checkpoints_info = await self._get_model_info("checkpoints")
        diffusion_info = await self._get_model_info("diffusion_models")
        models = build_client_models(nodes, checkpoints_info, diffusion_info)
        missing_required, missing_optional = self._compute_missing_models(
            models,
            required_models,
            default_checkpoints,
            upscale_models,
            optional_models,
            ResourceKind,
        )

        return {
            "connected": True,
            "missing_nodes": missing_nodes,
            "missing_required_models": missing_required,
            "missing_optional_models": missing_optional,
        }

    async def _refresh_shared_models(self) -> None:
        import src.path_setup  # noqa: F401

        from shared.comfy_workflow import ComfyObjectInfo
        from shared.resources import (
            required_custom_nodes,
            required_models,
            default_checkpoints,
            upscale_models,
            optional_models,
            ResourceKind,
        )
        from src.shared_shim.client import build_client_models
        from src.shared_shim.files import FileLibrary

        object_info = await self._get_object_info()
        if not object_info:
            raise RuntimeError("ComfyUI /object_info is unavailable.")

        nodes = ComfyObjectInfo(object_info)
        missing_nodes = self._compute_missing_nodes(nodes, required_custom_nodes)
        self._missing_nodes = missing_nodes
        if missing_nodes:
            missing_list = ", ".join(missing_nodes)
            raise RuntimeError(
                "Missing required ComfyUI nodes for shared workflow: "
                f"{missing_list}. Install required custom nodes."
            )

        checkpoints_info = await self._get_model_info("checkpoints")
        diffusion_info = await self._get_model_info("diffusion_models")
        self._models = build_client_models(nodes, checkpoints_info, diffusion_info)

        library = FileLibrary.instance()
        library.set_loras(self._models.loras)
        library.set_checkpoints(list(self._models.checkpoints.keys()))

        missing_required, missing_optional = self._compute_missing_models(
            self._models,
            required_models,
            default_checkpoints,
            upscale_models,
            optional_models,
            ResourceKind,
        )
        self._missing_required_models = missing_required
        self._missing_optional_models = missing_optional
        if missing_required:
            missing_list = ", ".join(missing_required)
            raise RuntimeError(f"Missing required models: {missing_list}")

        if missing_optional:
            logger.warning(
                "Missing optional models: %s",
                ", ".join(missing_optional),
            )


    async def _require_shared_nodes(self) -> None:
        if self._supports_etn is True:
            return
        info = await self._get_object_info()
        if not info:
            raise RuntimeError(
                "ComfyUI /object_info is unavailable. Shared-only workflow requires comfyui-tooling-nodes."
            )
        required = {"ETN_LoadImageCache", "ETN_SaveImageCache"}
        missing = required.difference(set(info.keys()))
        if missing:
            missing_list = ", ".join(sorted(missing))
            raise RuntimeError(
                "Missing required ComfyUI nodes for shared workflow: "
                f"{missing_list}. Install comfyui-tooling-nodes."
            )
        self._supports_etn = True

    async def _upload_etn_images(self, image_data: dict[str, bytes]) -> None:
        """Upload input images for ETN_LoadImageCache."""
        if not image_data or not self._session:
            return
        for image_id, data in image_data.items():
            async with self._session.put(
                f"{self.url}/api/etn/image/{image_id}",
                data=data,
                timeout=60,
            ) as resp:
                if resp.status >= 400:
                    error_text = await resp.text()
                    raise Exception(
                        f"Failed to upload ETN image {image_id}: {error_text}"
                    )

    async def _fetch_etn_image(self, image_id: str) -> bytes | None:
        """Fetch an ETN cached image by id."""
        if not self._session:
            return None
        async with self._session.get(
            f"{self.url}/api/etn/image/{image_id}",
            timeout=120,
        ) as resp:
            if resp.status == 200:
                return await resp.read()
            return None

    async def enqueue_workflow(
        self,
        work,
        batch_size: int = 1,
        seed: int = 0,
    ) -> str:
        """Submit a prepared WorkflowInput using shared workflow."""
        if not self._session or not self._is_connected:
            raise Exception("Not connected to ComfyUI")

        await self._require_shared_nodes()
        if self._models is None:
            await self._refresh_shared_models()
        assert self._models is not None

        from shared.api import CheckpointInput
        from shared.comfy_workflow import ComfyRunMode
        from shared.workflow import create as create_workflow
        from src.shared_shim.client import resolve_arch

        if work.models is None or not work.models.checkpoint:
            work.models = CheckpointInput(
                checkpoint=DEFAULT_CHECKPOINT,
                version=resolve_arch(DEFAULT_CHECKPOINT),
            )

        if work.models.checkpoint not in self._models.checkpoints:
            raise RuntimeError(f"Checkpoint not found: {work.models.checkpoint}")

        workflow = create_workflow(work, self._models, comfy_mode=ComfyRunMode.server)
        await self._upload_etn_images(workflow.image_data)

        job_id = str(uuid.uuid4())
        sample_count = workflow.sample_count or workflow.guess_sample_count()
        data = {
            "prompt": workflow.root,
            "client_id": self.client_id,
            "prompt_id": job_id,
        }

        async with self._session.post(
            f"{self.url}/prompt",
            json=data,
            timeout=30,
        ) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                raise Exception(f"Failed to submit job: {error_text}")
            result = await resp.json()
            if result.get("prompt_id") != job_id:
                logger.warning(
                    "Prompt ID mismatch: expected %s, got %s",
                    job_id,
                    result.get("prompt_id"),
                )
            self.jobs[job_id] = JobState(
                status=JobStatus.queued,
                node_count=len(workflow.root),
                sample_count=sample_count,
                batch_size=batch_size,
                seed=seed,
            )
            logger.info("Shared workflow job %s submitted successfully", job_id)
            return job_id

    def get_job(self, job_id: str) -> Optional[JobState]:
        """Get job state by ID."""
        return self.jobs.get(job_id)

    async def enqueue_upscale(
        self,
        image_base64: str,
        factor: float = 2.0,
        model: str = "",
    ) -> str:
        """Submit an upscale job and return job_id."""
        if not self._session or not self._is_connected:
            raise Exception("Not connected to ComfyUI")

        await self._require_shared_nodes()

        import base64
        import src.path_setup  # noqa: F401

        from shared.image import Image
        from shared.workflow import prepare_upscale_simple
        from .upscaler import DEFAULT_UPSCALE_MODEL

        image_b64 = image_base64.split(",", 1)[1] if "," in image_base64 else image_base64
        image_bytes = base64.b64decode(image_b64)
        image = Image.from_bytes(image_bytes)

        model_name = model or DEFAULT_UPSCALE_MODEL
        work = prepare_upscale_simple(image=image, model=model_name, factor=factor)

        if self._models is None:
            await self._refresh_shared_models()
        assert self._models is not None

        return await self.enqueue_workflow(work, batch_size=1, seed=0)

    async def enqueue_raw_prompt(self, prompt: dict) -> str:
        """Submit a raw ComfyUI prompt graph (custom workflow).

        Notes:
            - This bypasses shared WorkflowInput serialization.
            - Use this for executing user-supplied custom graphs.
        """
        if not self._session or not self._is_connected:
            raise Exception("Not connected to ComfyUI")

        import uuid
        import logging

        logger = logging.getLogger(__name__)

        job_id = str(uuid.uuid4())
        data = {
            "prompt": prompt,
            "client_id": self.client_id,
            "prompt_id": job_id,
        }

        async with self._session.post(
            f"{self.url}/prompt",
            json=data,
            timeout=30,
        ) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                raise Exception(f"Failed to submit custom workflow: {error_text}")
            result = await resp.json()
            if result.get("prompt_id") != job_id:
                logger.warning(
                    "Prompt ID mismatch: expected %s, got %s",
                    job_id,
                    result.get("prompt_id"),
                )
            # Minimal job state tracking; progress is driven by websocket events.
            self.jobs[job_id] = JobState(
                status=JobStatus.queued,
                node_count=len(prompt or {}),
                sample_count=0,
                batch_size=1,
                seed=0,
            )
            logger.info("Custom workflow job %s submitted successfully", job_id)
            return job_id

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

        source = img_info.get("source")
        image_id = img_info.get("id")
        if source == "http" and image_id:
            try:
                image_data = await self._fetch_etn_image(image_id)
                if image_data and job_id in self.jobs:
                    self.jobs[job_id].images.append(image_data)
                    logger.info(f"Fetched ETN image for job {job_id}: {image_id}")
            except Exception as e:
                logger.error(f"Failed to fetch ETN image {image_id}: {e}")
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
