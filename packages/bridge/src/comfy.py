import aiohttp
from src.state import state, ConnectionStatus


async def connect_to_comfy(url: str) -> bool:
    """Attempt to connect to ComfyUI server."""
    state.comfy_url = url
    state.connection_status = ConnectionStatus.connecting

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{url}/system_stats", timeout=aiohttp.ClientTimeout(total=5)) as response:
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
    state.error_message = None
