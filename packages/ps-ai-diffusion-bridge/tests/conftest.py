import pytest
from src.core.state import state, ConnectionStatus, BackendType


@pytest.fixture(autouse=True)
def reset_state():
    """Reset global state before each test."""
    state.connection_status = ConnectionStatus.disconnected
    state.backend_type = BackendType.local
    state.comfy_url = "http://localhost:8188"
    state.error_message = None
    yield
