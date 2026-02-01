from dataclasses import dataclass
from enum import Enum
from typing import Optional


class ConnectionStatus(str, Enum):
    disconnected = "disconnected"
    connecting = "connecting"
    connected = "connected"
    error = "error"


class BackendType(str, Enum):
    local = "local"
    cloud = "cloud"


@dataclass
class AppState:
    connection_status: ConnectionStatus = ConnectionStatus.disconnected
    backend_type: BackendType = BackendType.local
    comfy_url: str = "http://localhost:8188"
    auth_token: Optional[str] = None
    error_message: Optional[str] = None


# Global application state
state = AppState()
