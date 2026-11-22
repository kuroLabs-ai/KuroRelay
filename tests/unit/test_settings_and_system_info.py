"""Tests for Settings, System Info, Storage Stats, and Utility bridge endpoints."""
from unittest.mock import patch
from kurorelay.bridge.api import KuroRelayAPI


def test_get_settings_defaults(monkeypatch, database_session_scope):
    monkeypatch.setattr("kurorelay.bridge.api.get_session", database_session_scope)
    api = KuroRelayAPI()
    res = api.get_settings()
    assert res["status"] == "ok"
    settings = res["settings"]
    assert settings["default_timeout_ms"] == "30000"
    assert settings["follow_redirects"] == "true"
    assert settings["verify_tls"] == "true"
    assert settings["monaco_font_size"] == "13"
    assert settings["monaco_word_wrap"] == "on"
    assert settings["log_level"] == "INFO"


def test_update_setting_positional_and_dict(monkeypatch, database_session_scope):
    monkeypatch.setattr("kurorelay.bridge.api.get_session", database_session_scope)
    api = KuroRelayAPI()

    # Positional args
    res1 = api.update_setting("default_timeout_ms", "45000")
    assert res1["status"] == "ok"
    assert res1["key"] == "default_timeout_ms"
    assert res1["value"] == "45000"

    # Dict payload
    res2 = api.update_setting({"key": "monaco_font_size", "value": "15"})
    assert res2["status"] == "ok"
    assert res2["key"] == "monaco_font_size"
    assert res2["value"] == "15"

    # Verify retrieval
    ret = api.get_settings()
    assert ret["status"] == "ok"
    assert ret["settings"]["default_timeout_ms"] == "45000"
    assert ret["settings"]["monaco_font_size"] == "15"


def test_update_setting_unknown_key(monkeypatch, database_session_scope):
    monkeypatch.setattr("kurorelay.bridge.api.get_session", database_session_scope)
    api = KuroRelayAPI()
    res = api.update_setting("non_existent_key_123", "val")
    assert res["status"] == "failed"
    assert res["error"]["code"] == "UNKNOWN_KEY"


def test_update_settings_bulk(monkeypatch, database_session_scope):
    monkeypatch.setattr("kurorelay.bridge.api.get_session", database_session_scope)
    api = KuroRelayAPI()
    res = api.update_settings({
        "settings": {
            "default_timeout_ms": "60000",
            "monaco_word_wrap": "off",
            "proxy_mode": "custom",
            "proxy_url": "http://127.0.0.1:8080",
        }
    })
    assert res["status"] == "ok"
    assert res["updated"]["default_timeout_ms"] == "60000"
    assert res["updated"]["monaco_word_wrap"] == "off"

    settings = api.get_settings()["settings"]
    assert settings["default_timeout_ms"] == "60000"
    assert settings["monaco_word_wrap"] == "off"
    assert settings["proxy_url"] == "http://127.0.0.1:8080"


def test_get_system_info():
    api = KuroRelayAPI()
    res = api.get_system_info()
    assert res["status"] == "ok"
    info = res["info"]
    assert info["app_name"] == "KuroRelay"
    assert info["organization"] == "KuroLabs"
    assert "version" in info
    assert "platform" in info
    assert "python_version" in info
    assert "data_dir" in info
    assert "database_path" in info
    assert "logs_dir" in info
    assert "github_url" in info
    assert "discord_url" in info
    assert "docs_url" in info


def test_get_storage_stats(monkeypatch, database_session_scope):
    monkeypatch.setattr("kurorelay.bridge.api.get_session", database_session_scope)
    api = KuroRelayAPI()
    res = api.get_storage_stats()
    assert res["status"] == "ok"
    stats = res["stats"]
    assert "database_path" in stats
    assert "size_formatted" in stats
    assert stats["workspace_count"] == 0
    assert stats["collection_count"] == 0
    assert stats["request_count"] == 0
    assert stats["history_count"] == 0


def test_vacuum_database(monkeypatch, database_session_scope):
    monkeypatch.setattr("kurorelay.bridge.api.get_session", database_session_scope)
    api = KuroRelayAPI()
    res = api.vacuum_database()
    assert res["status"] == "ok"


def test_open_external_url():
    api = KuroRelayAPI()
    with patch("webbrowser.open") as mock_open:
        res = api.open_external_url("https://github.com/KuroLabs/KuroRelay")
        assert res["status"] == "ok"
        mock_open.assert_called_once_with("https://github.com/KuroLabs/KuroRelay")

    # Invalid scheme rejected
    res_bad = api.open_external_url("file:///etc/passwd")
    assert res_bad["status"] == "failed"
