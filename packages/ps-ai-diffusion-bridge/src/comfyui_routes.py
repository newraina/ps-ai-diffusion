"""ComfyUI extension routes using aiohttp.

This module provides REST API endpoints when running as a ComfyUI extension.
Routes are registered with ComfyUI's PromptServer.
"""
try:
    from server import PromptServer
    from aiohttp import web
except ImportError:
    # Not running inside ComfyUI
    PromptServer = None
    web = None

from src.core.handlers import (
    ApiResponse,
    GenerateParams,
    UpscaleParams,
    ControlImageParams,
    handle_health,
    handle_get_connection,
    handle_get_diagnostics,
    handle_post_connection,
    handle_generate,
    handle_get_job,
    handle_get_job_images,
    handle_get_job_image,
    handle_cancel_job,
    handle_get_styles,
    handle_upscale,
    handle_control_image,
    handle_custom_workflow,
    handle_auth_sign_in,
    handle_auth_confirm,
    handle_auth_validate,
)

API_PREFIX = "/api/ps-ai-diffusion-bridge"


def _json_response(resp: ApiResponse) -> "web.Response":
    """Convert ApiResponse to aiohttp json_response."""
    return web.json_response(resp.data, status=resp.status)


if PromptServer is not None:
    routes = PromptServer.instance.routes

    @routes.get(f"{API_PREFIX}/health")
    async def health(request):
        resp = await handle_health()
        return _json_response(resp)

    @routes.get(f"{API_PREFIX}/connection")
    async def get_connection(request):
        resp = await handle_get_connection()
        return _json_response(resp)

    @routes.get(f"{API_PREFIX}/diagnostics")
    async def get_diagnostics(request):
        resp = await handle_get_diagnostics()
        return _json_response(resp)

    @routes.post(f"{API_PREFIX}/connection")
    async def post_connection(request):
        data = await request.json()
        resp = await handle_post_connection(
            backend=data.get("backend", "local"),
            comfy_url=data.get("comfy_url"),
            auth_token=data.get("auth_token"),
        )
        return _json_response(resp)

    @routes.post(f"{API_PREFIX}/generate")
    async def generate(request):
        data = await request.json()
        params = GenerateParams(
            prompt=data.get("prompt", ""),
            negative_prompt=data.get("negative_prompt", ""),
            width=data.get("width", 512),
            height=data.get("height", 512),
            steps=data.get("steps", 20),
            cfg_scale=data.get("cfg_scale", 7.0),
            seed=data.get("seed", -1),
            model=data.get("model", ""),
            batch_size=data.get("batch_size", 1),
            sampler=data.get("sampler", "euler"),
            scheduler=data.get("scheduler", "normal"),
            image=data.get("image"),
            strength=data.get("strength", 1.0),
            mask=data.get("mask"),
            inpaint_mode=data.get("inpaint_mode", "automatic"),
            inpaint_fill=data.get("inpaint_fill", "neutral"),
            inpaint_context=data.get("inpaint_context", "automatic"),
            inpaint_padding=data.get("inpaint_padding", 0),
            inpaint_grow=data.get("inpaint_grow", 0),
            inpaint_feather=data.get("inpaint_feather", 0),
            loras=data.get("loras", []) or [],
            control=data.get("control", []) or data.get("controls", []) or [],
            regions=data.get("regions", []) or [],
            performance=data.get("performance"),
        )
        resp = await handle_generate(params)
        return _json_response(resp)

    @routes.post(f"{API_PREFIX}/control-image")
    async def control_image(request):
        data = await request.json()
        params = ControlImageParams(
            mode=data.get("mode", ""),
            image=data.get("image", ""),
            bounds=data.get("bounds"),
            seed=data.get("seed", -1),
            performance=data.get("performance"),
        )
        resp = await handle_control_image(params)
        return _json_response(resp)

    @routes.get(f"{API_PREFIX}/jobs/{{job_id}}")
    async def get_job_status(request):
        job_id = request.match_info["job_id"]
        resp = await handle_get_job(job_id)
        return _json_response(resp)

    @routes.get(f"{API_PREFIX}/jobs/{{job_id}}/images")
    async def get_job_images(request):
        job_id = request.match_info["job_id"]
        resp = await handle_get_job_images(job_id)
        return _json_response(resp)

    @routes.get(f"{API_PREFIX}/jobs/{{job_id}}/images/{{index}}")
    async def get_job_image(request):
        job_id = request.match_info["job_id"]
        index = int(request.match_info["index"])
        result = await handle_get_job_image(job_id, index)
        if isinstance(result, ApiResponse):
            return _json_response(result)
        image_data, media_type = result
        return web.Response(body=image_data, content_type=media_type)

    @routes.post(f"{API_PREFIX}/jobs/{{job_id}}/cancel")
    async def cancel_job(request):
        job_id = request.match_info["job_id"]
        resp = await handle_cancel_job(job_id)
        return _json_response(resp)

    @routes.get(f"{API_PREFIX}/styles")
    async def get_styles(request):
        resp = await handle_get_styles()
        return _json_response(resp)

    @routes.post(f"{API_PREFIX}/upscale")
    async def upscale(request):
        data = await request.json()
        params = UpscaleParams(
            image=data.get("image", ""),
            factor=data.get("factor", 2.0),
            model=data.get("model", ""),
            refine=bool(data.get("refine", False)),
            checkpoint=data.get("checkpoint", ""),
            prompt=data.get("prompt", ""),
            negative_prompt=data.get("negative_prompt", ""),
            steps=data.get("steps", 20),
            cfg_scale=data.get("cfg_scale", 7.0),
            sampler=data.get("sampler", "euler"),
            scheduler=data.get("scheduler", "normal"),
            seed=data.get("seed", -1),
            strength=data.get("strength", 0.35),
            tile_overlap=data.get("tile_overlap", -1),
            loras=data.get("loras", []) or [],
        )
        resp = await handle_upscale(params)
        return _json_response(resp)

    @routes.post(f"{API_PREFIX}/custom")
    async def custom_workflow(request):
        data = await request.json()
        resp = await handle_custom_workflow(data.get("workflow", {}))
        return _json_response(resp)

    # Cloud Authentication Endpoints

    @routes.post(f"{API_PREFIX}/auth/sign-in")
    async def auth_sign_in(request):
        resp = await handle_auth_sign_in()
        return _json_response(resp)

    @routes.post(f"{API_PREFIX}/auth/confirm")
    async def auth_confirm(request):
        resp = await handle_auth_confirm()
        return _json_response(resp)

    @routes.post(f"{API_PREFIX}/auth/validate")
    async def auth_validate(request):
        data = await request.json()
        token = data.get("token", "")
        resp = await handle_auth_validate(token)
        return _json_response(resp)
