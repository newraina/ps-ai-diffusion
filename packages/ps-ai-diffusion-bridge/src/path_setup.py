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

# Also create ai_diffusion alias for any code that imports from ai_diffusion
if 'ai_diffusion' not in sys.modules:
    sys.modules['ai_diffusion'] = sys.modules['shared']
