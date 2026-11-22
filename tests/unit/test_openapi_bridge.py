import json
import pytest
from kurorelay.bridge.api import KuroRelayAPI
from kurorelay.database.base import get_session
from kurorelay.database.repositories.workspaces import WorkspaceRepository
from kurorelay.database.repositories.collections import CollectionRepository
from kurorelay.database.repositories.requests import RequestRepository

SAMPLE_SPEC = """
openapi: "3.0.0"
info:
  title: "Petstore API"
  version: "1.0.0"
  description: "A sample pet store server"
servers:
  - url: "https://petstore.example.com/v1"
paths:
  /pets:
    get:
      summary: "List all pets"
      tags:
        - "pets"
      parameters:
        - name: "limit"
          in: "query"
          required: false
          schema:
            type: "integer"
      responses:
        "200":
          description: "A paged array of pets"
    post:
      summary: "Create a pet"
      tags:
        - "pets"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: "object"
              properties:
                name:
                  type: "string"
      responses:
        "201":
          description: "Null response"
"""


def test_parse_openapi_spec_success():
    api = KuroRelayAPI()
    result = api.parse_openapi_spec({"spec_content": SAMPLE_SPEC})
    assert result["status"] == "ok"
    assert result["spec"]["title"] == "Petstore API"
    assert len(result["spec"]["endpoints"]) == 2
    assert "pets" in result["spec"]["tags"]


def test_parse_openapi_spec_empty_validation():
    api = KuroRelayAPI()
    result = api.parse_openapi_spec({"spec_content": ""})
    assert result["status"] == "failed"
    assert "cannot be empty" in result["error"]["message"].lower() or "provided" in result["error"]["message"].lower()


def test_import_openapi_collection():
    api = KuroRelayAPI()
    result = api.import_openapi_collection({
        "workspace_id": "default",
        "spec_content": SAMPLE_SPEC,
        "collection_name": "My Petstore",
    })

    assert result["status"] == "ok"
    col_id = result["collection_id"]
    assert result["collection_name"] == "My Petstore"
    assert result["created_requests_count"] == 2

    with get_session() as session:
        col = CollectionRepository(session).get_by_id(col_id)
        assert col is not None
        assert col.name == "My Petstore"

        folders = CollectionRepository(session).list_folders(col_id)
        assert len(folders) == 1
        assert folders[0].name == "pets"

        requests = RequestRepository(session).list_for_collection(col_id)
        assert len(requests) == 2
        methods = {r.method for r in requests}
        assert methods == {"GET", "POST"}
