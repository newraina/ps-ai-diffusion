from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from .cloud_types import CloudUser


class ConnectionStatus(str, Enum):
    disconnected = "disconnected"
    connecting = "connecting"
    connected = "connected"
    error = "error"
    # Cloud-specific statuses
    auth_pending = "auth_pending"  # Waiting for user to complete sign-in


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
    # Cloud-specific state
    cloud_user: Optional[CloudUser] = None
    cloud_token: Optional[str] = None


# Global application state
state = AppState()
