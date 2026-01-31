# packages/bridge/tests/test_comfy.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from src.comfy import connect_to_comfy
from src.state import state, ConnectionStatus


@pytest.mark.asyncio
async def test_connect_to_comfy_without_auth():
    """Test connection without auth token."""
    with patch("src.comfy.aiohttp.ClientSession") as mock_session:
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=None)

        mock_get = MagicMock()
        mock_get.__aenter__ = AsyncMock(return_value=mock_response)
        mock_get.__aexit__ = AsyncMock(return_value=None)

        mock_session_instance = MagicMock()
        mock_session_instance.get = MagicMock(return_value=mock_get)
        mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session_instance.__aexit__ = AsyncMock(return_value=None)

        mock_session.return_value = mock_session_instance

        result = await connect_to_comfy("http://localhost:8188")

        assert result is True
        assert state.connection_status == ConnectionStatus.connected
        mock_session_instance.get.assert_called_once()
        call_kwargs = mock_session_instance.get.call_args
        assert "headers" not in call_kwargs.kwargs or call_kwargs.kwargs.get("headers") == {}


@pytest.mark.asyncio
async def test_connect_to_comfy_with_auth():
    """Test connection with auth token."""
    with patch("src.comfy.aiohttp.ClientSession") as mock_session:
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=None)

        mock_get = MagicMock()
        mock_get.__aenter__ = AsyncMock(return_value=mock_response)
        mock_get.__aexit__ = AsyncMock(return_value=None)

        mock_session_instance = MagicMock()
        mock_session_instance.get = MagicMock(return_value=mock_get)
        mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session_instance.__aexit__ = AsyncMock(return_value=None)

        mock_session.return_value = mock_session_instance

        result = await connect_to_comfy("http://localhost:8188", auth_token="test-token")

        assert result is True
        call_kwargs = mock_session_instance.get.call_args
        assert call_kwargs.kwargs.get("headers") == {"Authorization": "Bearer test-token"}
