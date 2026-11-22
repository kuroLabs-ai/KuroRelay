import pytest
from kurorelay.core.exceptions import ValidationError
from kurorelay.engines.openapi.parser import OpenAPIParser


def test_empty_content_raises_validation():
    parser = OpenAPIParser()
    with pytest.raises(ValidationError):
        parser.parse("")


def test_invalid_spec_raises_validation():
    parser = OpenAPIParser()
    with pytest.raises(ValidationError):
        parser.parse('{"foo": "bar"}')


def test_parse_minimal_openapi_3_json():
    spec_json = """
    {
        "openapi": "3.0.1",
        "info": {
            "title": "Test Users API",
            "version": "1.2.0",
            "description": "A test API for users"
        },
        "servers": [
            { "url": "https://api.test.com/v1" }
        ],
        "paths": {
            "/users": {
                "get": {
                    "summary": "Get all users",
                    "tags": ["Users"],
                    "parameters": [
                        { "name": "limit", "in": "query", "schema": { "type": "integer" } }
                    ],
                    "responses": {
                        "200": { "description": "Successful list" }
                    }
                },
                "post": {
                    "summary": "Create user",
                    "tags": ["Users"],
                    "requestBody": {
                        "required": true,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "username": { "type": "string" },
                                        "age": { "type": "integer" }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "201": { "description": "Created" }
                    }
                }
            }
        }
    }
    """
    parser = OpenAPIParser()
    parsed = parser.parse(spec_json)

    assert parsed["title"] == "Test Users API"
    assert parsed["version"] == "1.2.0"
    assert parsed["format"] == "openapi_3"
    assert parsed["servers"] == ["https://api.test.com/v1"]
    assert "Users" in parsed["tags"]
    assert len(parsed["endpoints"]) == 2

    get_ep = next(e for e in parsed["endpoints"] if e["method"] == "GET")
    assert get_ep["path"] == "/users"
    assert len(get_ep["parameters"]) == 1
    assert get_ep["parameters"][0]["name"] == "limit"

    post_ep = next(e for e in parsed["endpoints"] if e["method"] == "POST")
    assert post_ep["request_body"] is not None
    assert post_ep["request_body"]["sample_payload"] == {"username": "string", "age": 1}


def test_parse_swagger_2_yaml():
    spec_yaml = """
swagger: "2.0"
info:
  title: Swagger Petstore
  version: "1.0.0"
host: petstore.swagger.io
basePath: /v2
schemes:
  - https
paths:
  /pets:
    get:
      summary: List pets
      tags:
        - Pets
      responses:
        "200":
          description: OK
"""
    parser = OpenAPIParser()
    parsed = parser.parse(spec_yaml)

    assert parsed["title"] == "Swagger Petstore"
    assert parsed["format"] == "swagger_2"
    assert parsed["servers"] == ["https://petstore.swagger.io/v2"]
    assert len(parsed["endpoints"]) == 1
    assert parsed["endpoints"][0]["method"] == "GET"
    assert parsed["endpoints"][0]["path"] == "/pets"


def test_schema_ref_resolution():
    spec_json = """
    {
        "openapi": "3.0.0",
        "info": { "title": "Ref API", "version": "1.0.0" },
        "paths": {
            "/profile": {
                "get": {
                    "responses": {
                        "200": {
                            "description": "OK",
                            "content": {
                                "application/json": {
                                    "schema": { "$ref": "#/components/schemas/Profile" }
                                }
                            }
                        }
                    }
                }
            }
        },
        "components": {
            "schemas": {
                "Profile": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "integer" },
                        "email": { "type": "string", "format": "email" }
                    }
                }
            }
        }
    }
    """
    parser = OpenAPIParser()
    parsed = parser.parse(spec_json)
    ep = parsed["endpoints"][0]
    sample = ep["responses"][0]["sample"]
    assert sample == {"id": 1, "email": "user@example.com"}
