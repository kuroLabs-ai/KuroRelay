import { describe, expect, it } from "vitest";
import {
  parseCollectionMetadata,
  serializeCollectionMetadata,
  type CollectionMetadata,
} from "./collectionMetadata";

describe("collectionMetadata", () => {
  it("parses empty or plain text description safely", () => {
    const res1 = parseCollectionMetadata(null);
    expect(res1.about).toBe("");
    expect(res1.auth.type).toBe("none");
    expect(res1.headers).toEqual([]);

    const res2 = parseCollectionMetadata("Just a plain text description of this collection");
    expect(res2.about).toBe("Just a plain text description of this collection");
    expect(res2.auth.type).toBe("none");
    expect(res2.headers).toEqual([]);
  });

  it("parses JSON metadata with auth and headers", () => {
    const raw = JSON.stringify({
      about: "Production APIs",
      auth: { type: "bearer", token: "secret-xyz" },
      headers: [{ key: "X-Version", value: "2.0", enabled: true }],
    });

    const res = parseCollectionMetadata(raw);
    expect(res.about).toBe("Production APIs");
    expect(res.auth.type).toBe("bearer");
    expect(res.auth.token).toBe("secret-xyz");
    expect(res.headers.length).toBe(1);
    expect(res.headers[0].key).toBe("X-Version");
  });

  it("serializes plain about when no auth or headers", () => {
    const meta: CollectionMetadata = {
      about: "My Notes",
      auth: { type: "none" },
      headers: [],
    };
    expect(serializeCollectionMetadata(meta)).toBe("My Notes");
  });

  it("serializes JSON metadata when auth or headers exist", () => {
    const meta: CollectionMetadata = {
      about: "Secured Collection",
      auth: { type: "api_key", key: "X-API-Key", value: "12345" },
      headers: [],
    };
    const serialized = serializeCollectionMetadata(meta);
    expect(serialized.startsWith("{")).toBe(true);

    const reparsed = parseCollectionMetadata(serialized);
    expect(reparsed.about).toBe("Secured Collection");
    expect(reparsed.auth.type).toBe("api_key");
    expect(reparsed.auth.key).toBe("X-API-Key");
  });
});
