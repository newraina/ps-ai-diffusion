import aiohttp
from src.state import state, ConnectionStatus
from typing import Optional


async def connect_to_comfy(url: str, auth_token: Optional[str] = None) -> bool:
    """Attempt to connect to ComfyUI server."""
    state.comfy_url = url
    state.auth_token = auth_token
    state.connection_status = ConnectionStatus.connecting

    headers = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{url}/system_stats",
                timeout=aiohttp.ClientTimeout(total=5),
                headers=headers,
            ) as response:
                if response.status == 200:
                    state.connection_status = ConnectionStatus.connected
                    state.error_message = None
                    return True
                else:
                    state.connection_status = ConnectionStatus.error
                    state.error_message = f"Unexpected status: {response.status}"
                    return False
    except aiohttp.ClientError as e:
        state.connection_status = ConnectionStatus.error
        state.error_message = str(e)
        return False
    except Exception as e:
        state.connection_status = ConnectionStatus.error
        state.error_message = str(e)
        return False


async def disconnect():
    """Disconnect from ComfyUI server."""
    state.connection_status = ConnectionStatus.disconnected
    state.auth_token = None
    state.error_message = None
