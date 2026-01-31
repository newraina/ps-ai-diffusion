import sys
from pathlib import Path

# Add shared modules to path
shared_path = Path(__file__).parent.parent.parent / "shared"
sys.path.insert(0, str(shared_path.parent))

from shared.image import Extent
from shared.api import WorkflowInput, WorkflowKind, ImageInput, ExtentInput
from shared.api import CheckpointInput, SamplingInput, ConditioningInput
from shared.resources import Arch


def create_txt2img_workflow(
    prompt: str,
    negative_prompt: str = "",
    width: int = 512,
    height: int = 512,
    steps: int = 20,
    cfg_scale: float = 7.0,
    seed: int = -1,
    checkpoint: str = "",
) -> WorkflowInput:
    """Create a text-to-image workflow input."""
    extent = Extent(width, height)

    return WorkflowInput(
        kind=WorkflowKind.generate,
        images=ImageInput(
            extent=ExtentInput(extent, extent, extent, extent)
        ),
        models=CheckpointInput(
            checkpoint=checkpoint,
            version=Arch.sd15,
        ),
        sampling=SamplingInput(
            sampler="euler",
            scheduler="normal",
            cfg_scale=cfg_scale,
            total_steps=steps,
            seed=seed if seed >= 0 else 0,
        ),
        conditioning=ConditioningInput(
            positive=prompt,
            negative=negative_prompt,
        ),
    )
