import { describe, it, expect } from "vitest";
import { getByPath, extractValueFromResponse, type ExtractionRule } from "./variableChaining";

describe("variableChaining", () => {
  it("extracts nested objects and array elements using getByPath", () => {
    const data = {
      user: {
        id: 42,
        profile: {
          name: "Kuro",
          tokens: ["tok_123", "tok_456"],
        },
      },
    };

    expect(getByPath(data, "user.id")).toBe(42);
    expect(getByPath(data, "user.profile.name")).toBe("Kuro");
    expect(getByPath(data, "user.profile.tokens[0]")).toBe("tok_123");
    expect(getByPath(data, "user.profile.tokens[1]")).toBe("tok_456");
    expect(getByPath(data, "user.nonexistent")).toBeUndefined();
  });

  it("extracts json body property according to rule", () => {
    const mockResponse = {
      response: {
        status_code: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          data: {
            auth: {
              access_token: "jwt_token_sample",
              expires_in: 3600,
            },
          },
        },
      },
    };

    const rule: ExtractionRule = {
      id: "1",
      enabled: true,
      source: "body_json",
      path: "auth.access_token",
      variableName: "TOKEN",
      targetScope: "environment",
    };

    const val = extractValueFromResponse(rule, mockResponse);
    expect(val).toBe("jwt_token_sample");
  });

  it("extracts headers case-insensitively", () => {
    const mockResponse = {
      response: {
        status_code: 200,
        headers: { "X-Request-Id": "req-abc-999", "Set-Cookie": "sess=123" },
      },
    };

    const rule: ExtractionRule = {
      id: "2",
      enabled: true,
      source: "header",
      path: "x-request-id",
      variableName: "REQ_ID",
      targetScope: "global",
    };

    expect(extractValueFromResponse(rule, mockResponse)).toBe("req-abc-999");
  });

  it("extracts status code", () => {
    const mockResponse = {
      response: {
        status_code: 201,
      },
    };

    const rule: ExtractionRule = {
      id: "3",
      enabled: true,
      source: "status",
      path: "",
      variableName: "LAST_STATUS",
      targetScope: "environment",
    };

    expect(extractValueFromResponse(rule, mockResponse)).toBe("201");
  });

  it("returns null if rule is disabled or path not found", () => {
    const mockResponse = { response: { status_code: 200, body: { data: {} } } };
    const disabledRule: ExtractionRule = {
      id: "4",
      enabled: false,
      source: "status",
      path: "",
      variableName: "S",
      targetScope: "environment",
    };
    expect(extractValueFromResponse(disabledRule, mockResponse)).toBeNull();
  });
});
