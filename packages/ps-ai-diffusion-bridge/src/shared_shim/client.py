"""Qt-less ClientModels implementation for shared workflow."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from itertools import chain, product
from typing import Dict, Iterable, Sequence

from shared.comfy_workflow import ComfyObjectInfo
from shared.resources import (
    Arch,
    ControlMode,
    ResourceId,
    ResourceKind,
    UpscalerName,
    resource_id,
)

from .files import FileFormat


class Quantization(Enum):
    none = 0
    svdq = 1

    @staticmethod
    def from_string(s: str):
        return Quantization.svdq if s == "svdq" else Quantization.none


@dataclass
class CheckpointInfo:
    filename: str
    arch: Arch
    format: FileFormat = FileFormat.checkpoint
    quantization: Quantization = Quantization.none

    @staticmethod
    def deduce_from_filename(filename: str):
        return CheckpointInfo(filename, Arch.from_checkpoint_name(filename), FileFormat.checkpoint)


class ClientModels:
    """Collects names of AI models the client has access to."""

    def __init__(self) -> None:
        self.checkpoints: dict[str, CheckpointInfo] = {}
        self.vae: list[str] = []
        self.loras: list[str] = []
        self.upscalers: list[str] = []
        self.node_inputs = ComfyObjectInfo({})
        self.resources: dict[str, str | None] = {}

    def resource(
        self, kind: ResourceKind, identifier: ControlMode | UpscalerName | str, arch: Arch
    ):
        id = ResourceId(kind, arch, identifier)
        model = self.find(id)
        if model is None:
            raise Exception(f"{id.name} not found")
        return model

    def find(self, id: ResourceId):
        if result := self.resources.get(id.string):
            return result
        if id.arch is Arch.illu_v:
            if result := self.resources.get(id._replace(arch=Arch.illu).string):
                return result
        return self.resources.get(id._replace(arch=Arch.all).string)

    def arch_of(self, checkpoint: str):
        if info := self.checkpoints.get(checkpoint):
            return info.arch
        return resolve_arch(checkpoint)

    def for_arch(self, arch: Arch):
        return ModelDict(self, ResourceKind.upscaler, arch)

    @property
    def upscale(self):
        return ModelDict(self, ResourceKind.upscaler, Arch.all)

    @property
    def default_upscaler(self):
        return self.resource(ResourceKind.upscaler, UpscalerName.default, Arch.all)

    def update_from_object_info(self, nodes: ComfyObjectInfo) -> None:
        self.node_inputs = nodes
        self.checkpoints = {
            filename: CheckpointInfo.deduce_from_filename(filename)
            for filename in nodes.options("CheckpointLoaderSimple", "ckpt_name")
        }
        self.vae = nodes.options("VAELoader", "vae_name")
        self.loras = nodes.options("LoraLoader", "lora_name")
        self.upscalers = nodes.options("UpscaleModelLoader", "model_name")

    def update_from_model_info(
        self,
        checkpoints: dict[str, dict] | None,
        diffusion_models: dict[str, dict] | None,
    ) -> None:
        def parse_model_info(models: dict, model_format: FileFormat):
            parsed = (
                (
                    filename,
                    Arch.from_string(info["base_model"], info.get("type", "eps"), filename),
                    Quantization.from_string(info.get("quant", "none")),
                )
                for filename, info in models.items()
            )
            return {
                filename: CheckpointInfo(filename, arch, model_format, quant)
                for filename, arch, quant in parsed
                if arch is not None
            }

        if checkpoints:
            self.checkpoints = parse_model_info(checkpoints, FileFormat.checkpoint)
        if diffusion_models:
            self.checkpoints.update(parse_model_info(diffusion_models, FileFormat.diffusion))

    def update_resources(self, nodes: ComfyObjectInfo) -> None:
        resources = {}
        clip_models = nodes.options("DualCLIPLoader", "clip_name1")
        clip_models += nodes.options("DualCLIPLoaderGGUF", "clip_name1")
        resources.update(_find_text_encoder_models(clip_models))

        vae_models = nodes.options("VAELoader", "vae_name")
        resources.update(_find_vae_models(vae_models))

        control_models = nodes.options("ControlNetLoader", "control_net_name")
        resources.update(_find_control_models(control_models))

        clip_vision_models = nodes.options("CLIPVisionLoader", "clip_name")
        resources.update(_find_clip_vision_model(clip_vision_models))

        ip_adapter_models = nodes.options("IPAdapterModelLoader", "ipadapter_file")
        resources.update(_find_ip_adapters(ip_adapter_models))

        model_patches = nodes.options("ModelPatchLoader", "name")
        resources.update(_find_model_patches(model_patches))

        style_models = nodes.options("StyleModelLoader", "style_model_name")
        resources.update(_find_style_models(style_models))

        self.upscalers = nodes.options("UpscaleModelLoader", "model_name")
        resources.update(_find_upscalers(self.upscalers))

        inpaint_models = nodes.options("INPAINT_LoadInpaintModel", "model_name")
        resources.update(_find_inpaint_models(inpaint_models))

        loras = nodes.options("LoraLoader", "lora_name")
        resources.update(_find_loras(loras))

        self.resources = resources


class _ModelFinder:
    def __init__(self, models: "ClientModels", kind: ResourceKind, arch: Arch):
        self._models = models
        self.kind = kind
        self.arch = arch

    def find(self, key: ControlMode | UpscalerName | str, allow_universal: bool = False):
        if isinstance(key, ControlMode) and key in [ControlMode.style, ControlMode.composition]:
            if self.arch in [Arch.sd15] or self.arch.is_sdxl_like:
                key = ControlMode.reference
        result = self._models.find(ResourceId(self.kind, self.arch, key))
        if result is None and allow_universal and isinstance(key, ControlMode):
            if key.can_substitute_universal(self.arch):
                result = self.find(ControlMode.universal)
        return result


class ModelDict:
    """Provides access to filtered list of models matching a certain base model."""

    def __init__(self, models: ClientModels, kind: ResourceKind, arch: Arch):
        self._models = models
        self.kind = kind
        self.arch = arch

    def __getitem__(self, key: ControlMode | UpscalerName | str):
        return self._models.resource(self.kind, key, self.arch)

    @property
    def text_encoder(self):
        return ModelDict(self._models, ResourceKind.text_encoder, self.arch)

    @property
    def clip_vision(self):
        return self._models.resource(ResourceKind.clip_vision, "ip_adapter", self.arch)

    @property
    def upscale(self):
        return ModelDict(self._models, ResourceKind.upscaler, Arch.all)

    @property
    def control(self):
        return _ModelFinder(self._models, ResourceKind.controlnet, self.arch)

    @property
    def ip_adapter(self):
        return _ModelFinder(self._models, ResourceKind.ip_adapter, self.arch)

    @property
    def inpaint(self):
        return ModelDict(self._models, ResourceKind.inpaint, Arch.all)

    @property
    def model_patch(self):
        return _ModelFinder(self._models, ResourceKind.model_patch, self.arch)

    @property
    def lora(self):
        return _ModelFinder(self._models, ResourceKind.lora, self.arch)

    @property
    def vae(self):
        return self._models.resource(ResourceKind.vae, "default", self.arch)

    @property
    def fooocus_inpaint(self):
        return dict(
            head=self._models.resource(ResourceKind.inpaint, "fooocus_head", Arch.sdxl),
            patch=self._models.resource(ResourceKind.inpaint, "fooocus_patch", Arch.sdxl),
        )


def resolve_arch(checkpoint: str) -> Arch:
    return Arch.from_checkpoint_name(checkpoint)


def build_client_models(
    node_inputs: ComfyObjectInfo,
    checkpoints: dict[str, dict] | None = None,
    diffusion_models: dict[str, dict] | None = None,
) -> ClientModels:
    models = ClientModels()
    models.update_from_object_info(node_inputs)
    if checkpoints or diffusion_models:
        models.update_from_model_info(checkpoints, diffusion_models)
    models.update_resources(node_inputs)
    return models


def find_model(model_list: Sequence[str], id: ResourceId):
    return _find_model(model_list, id.kind, id.arch, id.identifier)


def _find_text_encoder_models(model_list: Sequence[str]):
    kind = ResourceKind.text_encoder
    return {
        resource_id(kind, Arch.all, te): _find_model(model_list, kind, Arch.all, te)
        for te in ["clip_l", "clip_g", "t5", "qwen", "qwen_3_4b", "qwen_3_8b"]
    }


def _find_control_models(model_list: Sequence[str]):
    kind = ResourceKind.controlnet
    return {
        resource_id(kind, ver, mode): _find_model(model_list, kind, ver, mode)
        for mode, ver in product(ControlMode, Arch.list())
        if mode.is_control_net
    }


def _find_ip_adapters(model_list: Sequence[str]):
    kind = ResourceKind.ip_adapter
    return {
        resource_id(kind, ver, mode): _find_model(model_list, kind, ver, mode)
        for mode, ver in product(ControlMode, Arch.list())
        if mode.is_ip_adapter
    }


def _find_clip_vision_model(model_list: Sequence[str]):
    clip_vision_sd15 = ResourceId(ResourceKind.clip_vision, Arch.sd15, "ip_adapter")
    clip_vision_sdxl = ResourceId(ResourceKind.clip_vision, Arch.sdxl, "ip_adapter")
    clip_vision_flux = ResourceId(ResourceKind.clip_vision, Arch.flux, "redux")
    clip_vision_illu = ResourceId(ResourceKind.clip_vision, Arch.illu, "ip_adapter")
    return {
        clip_vision_sd15.string: find_model(model_list, clip_vision_sd15),
        clip_vision_sdxl.string: find_model(model_list, clip_vision_sdxl),
        clip_vision_flux.string: find_model(model_list, clip_vision_flux),
        clip_vision_illu.string: find_model(model_list, clip_vision_illu),
    }


def _find_model_patches(model_list: Sequence[str]):
    res = [
        ResourceId(ResourceKind.model_patch, Arch.zimage, ControlMode.universal),
        ResourceId(ResourceKind.model_patch, Arch.zimage, ControlMode.blur),
    ]
    return {r.string: _find_model(model_list, r.kind, r.arch, r.identifier) for r in res}


def _find_style_models(model_list: Sequence[str]):
    redux_flux = ResourceId(ResourceKind.ip_adapter, Arch.flux, ControlMode.reference)
    return {redux_flux.string: find_model(model_list, redux_flux)}


def _find_upscalers(model_list: Sequence[str]):
    kind = ResourceKind.upscaler
    models = {
        resource_id(kind, Arch.all, name): _find_model(model_list, kind, Arch.all, name)
        for name in UpscalerName
    }
    default_id = resource_id(kind, Arch.all, UpscalerName.default)
    if models[default_id] is None and len(model_list) > 0:
        models[default_id] = models[resource_id(kind, Arch.all, UpscalerName.fast_4x)]
    return models


def _find_loras(model_list: Sequence[str]):
    kind = ResourceKind.lora
    common_loras = list(product(["hyper", "lcm", "face"], [Arch.sd15, Arch.sdxl]))
    sdxl_loras = [("lightning", Arch.sdxl)]
    flux_loras = [
        ("turbo", Arch.flux),
        (ControlMode.depth, Arch.flux),
        (ControlMode.canny_edge, Arch.flux),
    ]
    flux_k_loras = [("turbo", Arch.flux_k)]
    return {
        resource_id(kind, arch, name): _find_model(model_list, kind, arch, name)
        for name, arch in chain(common_loras, sdxl_loras, flux_loras, flux_k_loras)
    }


def _find_vae_models(model_list: Sequence[str]):
    kind = ResourceKind.vae
    return {
        resource_id(kind, ver, "default"): _find_model(model_list, kind, ver, "default")
        for ver in Arch.list()
    }


def _find_inpaint_models(model_list: Sequence[str]):
    kind = ResourceKind.inpaint
    ids: list[tuple[Arch, str]] = [
        (Arch.all, "default"),
        (Arch.sdxl, "fooocus_head"),
        (Arch.sdxl, "fooocus_patch"),
    ]
    return {
        resource_id(kind, ver, name): _find_model(model_list, kind, ver, name) for ver, name in ids
    }


def _find_model(
    model_list: Sequence[str],
    kind: ResourceKind,
    arch: Arch,
    identifier: ControlMode | UpscalerName | str,
):
    if isinstance(identifier, Enum):
        identifier = identifier.value
    identifier = str(identifier).replace("\\", "/").lower()
    for model in model_list:
        name = model.replace("\\", "/").lower()
        if identifier in name:
            return model
    return None
