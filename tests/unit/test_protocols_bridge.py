"""Unit tests for Phase 7: Advanced Protocols (WebSocket, GraphQL, SSE)."""
import pytest
from unittest.mock import MagicMock, patch

from kurorelay.bridge.api import KuroRelayAPI
from kurorelay.engines.protocols.graphql_client import GraphQLClient
from kurorelay.engines.protocols.websocket_client import WebSocketManager
from kurorelay.engines.protocols.sse_client import SSEManager


def test_graphql_validation():
    client = GraphQLClient()
    # Valid query
    res = client.validate_query("query { user { id name } }")
    assert res["valid"] is True
    assert len(res["errors"]) == 0

    # Invalid query syntax
    res_invalid = client.validate_query("query { user { id name ")
    assert res_invalid["valid"] is False
    assert len(res_invalid["errors"]) > 0

    # Empty query
    res_empty = client.validate_query("   ")
    assert res_empty["valid"] is False


def test_graphql_execute_mocked():
    client = GraphQLClient()

    with patch("httpx.Client.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.is_success = True
        mock_resp.status_code = 200
        mock_resp.content = b'{"data": {"hero": {"name": "R2-D2"}}}'
        mock_resp.json.return_value = {"data": {"hero": {"name": "R2-D2"}}}
        mock_post.return_value = mock_resp

        result = client.execute(
            url="https://api.example.com/graphql",
            query="query { hero { name } }",
            variables={"episode": "EMPIRE"},
        )

        assert result["status"] == "completed"
        assert result["status_code"] == 200
        assert result["data"] == {"hero": {"name": "R2-D2"}}
        assert result["errors"] is None


def test_graphql_introspect_mocked():
    client = GraphQLClient()

    with patch("httpx.Client.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.is_success = True
        mock_resp.status_code = 200
        mock_resp.content = b'{}'
        mock_resp.json.return_value = {
            "data": {
                "__schema": {
                    "queryType": {"name": "Query"},
                    "mutationType": {"name": "Mutation"},
                    "types": [
                        {
                            "name": "Query",
                            "fields": [{"name": "users", "description": "List users"}],
                        },
                        {
                            "name": "Mutation",
                            "fields": [{"name": "createUser", "description": "Create a user"}],
                        },
                        {
                            "name": "User",
                            "fields": [{"name": "id"}, {"name": "email"}],
                        },
                    ],
                }
            }
        }
        mock_post.return_value = mock_resp

        result = client.introspect(url="https://api.example.com/graphql")
        assert result["status"] == "ok"
        assert result["query_type"] == "Query"
        assert result["mutation_type"] == "Mutation"
        assert len(result["queries"]) == 1
        assert result["queries"][0]["name"] == "users"
        assert len(result["mutations"]) == 1
        assert result["mutations"][0]["name"] == "createUser"
        assert len(result["types"]) == 1
        assert result["types"][0]["name"] == "User"


def test_websocket_manager_url_validation():
    mgr = WebSocketManager()
    with pytest.raises(Exception):
        mgr.connect("http://invalid-ws-url.com")


def test_sse_manager_url_validation():
    mgr = SSEManager()
    with pytest.raises(Exception):
        mgr.connect("ftp://invalid-sse-url.com")


def test_bridge_protocol_endpoints():
    api = KuroRelayAPI()

    # WebSocket invalid URL via bridge
    ws_res = api.websocket_connect({"url": "invalid://not-ws"})
    assert ws_res["status"] == "failed"

    # SSE invalid URL via bridge
    sse_res = api.sse_connect({"url": "invalid://not-http"})
    assert sse_res["status"] == "failed"

    # GraphQL invalid query via bridge
    gql_res = api.execute_graphql({
        "url": "https://api.example.com/graphql",
        "query": "query { unclosed ",
    })
    assert gql_res["status"] == "failed"
    assert "errors" in gql_res
