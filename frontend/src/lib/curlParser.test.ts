import { describe, it, expect } from "vitest";
import { parseCurlCommand, isCurlCommand } from "./curlParser";

describe("curlParser", () => {
  it("detects curl command", () => {
    expect(isCurlCommand("curl https://api.com")).toBe(true);
    expect(isCurlCommand("curl.exe -X POST https://api.com")).toBe(true);
    expect(isCurlCommand("GET https://api.com")).toBe(false);
  });

  it("parses simple GET curl", () => {
    const cmd = "curl https://api.example.com/users?page=1&limit=10";
    const parsed = parseCurlCommand(cmd);
    expect(parsed).not.toBeNull();
    expect(parsed?.method).toBe("GET");
    expect(parsed?.url).toBe("https://api.example.com/users");
    expect(parsed?.params).toEqual([
      { key: "page", value: "1", enabled: true },
      { key: "limit", value: "10", enabled: true },
    ]);
  });

  it("parses POST with JSON body and headers", () => {
    const cmd = `curl -X POST https://api.example.com/login \\
      -H "Content-Type: application/json" \\
      -H "Authorization: Bearer secret123" \\
      -d '{"email": "user@test.com", "password": "abc"}'`;

    const parsed = parseCurlCommand(cmd);
    expect(parsed).not.toBeNull();
    expect(parsed?.method).toBe("POST");
    expect(parsed?.url).toBe("https://api.example.com/login");
    expect(parsed?.auth.type).toBe("bearer");
    expect(parsed?.auth.token).toBe("secret123");
    expect(parsed?.headers).toEqual([
      { key: "Content-Type", value: "application/json", enabled: true },
    ]);
    expect(parsed?.body.type).toBe("json");
    expect(JSON.parse(parsed?.body.content || "{}")).toEqual({
      email: "user@test.com",
      password: "abc",
    });
  });

  it("parses basic auth and insecure flag", () => {
    const cmd = `curl -k -u "admin:secretpass" https://internal.dev/api`;
    const parsed = parseCurlCommand(cmd);
    expect(parsed).not.toBeNull();
    expect(parsed?.auth.type).toBe("basic");
    expect(parsed?.auth.username).toBe("admin");
    expect(parsed?.auth.password).toBe("secretpass");
    expect(parsed?.options.verify_ssl).toBe(false);
  });
});
