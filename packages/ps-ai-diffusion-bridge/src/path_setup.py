"""Setup Python path to import ai_diffusion modules from packages/shared.

The shared directory contains original krita-ai-diffusion code which uses
relative imports. We need to import it as a package, but skip the Krita-specific
checks in __init__.py.
"""
import sys
from pathlib import Path
import importlib.util

# Add packages directory to path
packages_path = Path(__file__).parent.parent.parent
if str(packages_path) not in sys.path:
    sys.path.insert(0, str(packages_path))

# Pre-register 'shared' as a package in sys.modules to enable relative imports
# but without executing the original __init__.py which has Krita checks
import types
if 'shared' not in sys.modules:
    shared_module = types.ModuleType('shared')
    shared_module.__path__ = [str(packages_path / 'shared')]
    shared_module.__package__ = 'shared'
    shared_module.__file__ = str(packages_path / 'shared' / '__init__.py')
    sys.modules['shared'] = shared_module

# Inject Qt-less shims for shared modules used by the bridge.
from src.shared_shim import image as shim_image
from src.shared_shim import util as shim_util
from src.shared_shim import settings as shim_settings
sys.modules['shared.image'] = shim_image
sys.modules['shared.util'] = shim_util
sys.modules['shared.settings'] = shim_settings

# Optional shims for shared workflow imports.
from src.shared_shim import files as shim_files
from src.shared_shim import text as shim_text
from src.shared_shim import style as shim_style
from src.shared_shim import localization as shim_localization
from src.shared_shim import client as shim_client
sys.modules['shared.files'] = shim_files
sys.modules['shared.text'] = shim_text
sys.modules['shared.style'] = shim_style
sys.modules['shared.localization'] = shim_localization
sys.modules['shared.client'] = shim_client

# Also create ai_diffusion alias for any code that imports from ai_diffusion
if 'ai_diffusion' not in sys.modules:
    sys.modules['ai_diffusion'] = sys.modules['shared']
