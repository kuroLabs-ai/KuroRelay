import type { CollectionItem } from "../stores/appStore";
import { bridge } from "../bridge/client";

export async function exportCollectionJson(collection: CollectionItem): Promise<boolean> {
  const exportData = {
    _format: "kurorelay-collection",
    version: 1,
    exported_at: new Date().toISOString(),
    collection: {
      name: collection.name,
      description: collection.description || "",
      folders: (collection.folders || []).map((f) => ({
        id: f.id,
        name: f.name,
        parent_id: f.parent_id ?? f.parent_folder_id ?? null,
      })),
      requests: (collection.requests || []).map((r) => ({
        name: r.name,
        method: r.method,
        url: r.url,
        folder_id: r.folder_id,
        configuration: r.configuration,
      })),
    },
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const safeName = (collection.name || "collection").replace(/[^a-z0-9_-]/gi, "_");
  const filename = `${safeName}.kuro.json`;

  try {
    const res = await bridge.saveFile(jsonStr, filename, [
      "JSON Files (*.json;*.kuro.json)",
      "All Files (*.*)",
    ]);
    if (res && res.status === "ok") return true;
    if (res && res.status === "cancelled") return false;
  } catch {}

  // Web fallback
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export async function importCollectionFromJson(
  jsonText: string,
  workspaceId: string
): Promise<{ count: number; name: string }> {
  const data = JSON.parse(jsonText);

  // 1. KuroRelay format
  if (data._format === "kurorelay-collection" && data.collection) {
    const colName = data.collection.name || "Imported Collection";
    const res = await bridge.createCollection({
      workspace_id: workspaceId,
      name: colName,
      description: data.collection.description,
    });
    const colId = (res as any)?.collection?.id;
    if (!colId) throw new Error("Failed to create collection");

    // Recreate parent folders before their nested children.
    const folderIdMap: Record<string, string> = {};
    let pendingFolders = [...(data.collection.folders || [])];
    while (pendingFolders.length > 0) {
      let createdFolder = false;
      const remainingFolders = [];
      for (const folder of pendingFolders) {
        const oldParentId = folder.parent_id || folder.parent_folder_id;
        if (oldParentId && !folderIdMap[oldParentId]) {
          remainingFolders.push(folder);
          continue;
        }
        const fRes = await bridge.createCollectionFolder({
          collection_id: colId,
          name: folder.name,
          parent_id: oldParentId ? folderIdMap[oldParentId] : undefined,
        });
        if (fRes.status !== "ok" || !fRes.folder?.id) {
          throw new Error(`Failed to create folder "${folder.name || "Folder"}"`);
        }
        if (folder.id) folderIdMap[folder.id] = fRes.folder.id;
        createdFolder = true;
      }
      if (!createdFolder) {
        throw new Error("Collection folder hierarchy contains an invalid parent reference");
      }
      pendingFolders = remainingFolders;
    }

    let reqCount = 0;
    for (const r of data.collection.requests || []) {
      const targetFolderId = r.folder_id ? folderIdMap[r.folder_id] : undefined;
      await bridge.saveRequest({
        workspace_id: workspaceId,
        collection_id: colId,
        folder_id: targetFolderId,
        name: r.name || "Request",
        method: r.method || "GET",
        url: r.url || "",
        configuration: r.configuration || {},
      });
      reqCount++;
    }
    return { count: reqCount, name: colName };
  }

  // 2. Postman Collection v2.0 / v2.1 format
  if (data.info && Array.isArray(data.item)) {
    const colName = data.info.name || "Imported Postman Collection";
    const res = await bridge.createCollection({
      workspace_id: workspaceId,
      name: colName,
      description: typeof data.info.description === "string" ? data.info.description : undefined,
    });
    const colId = (res as any)?.collection?.id;
    if (!colId) throw new Error("Failed to create collection");

    let reqCount = 0;

    const processItems = async (items: any[], folderId?: string) => {
      for (const item of items) {
        if (!item) continue;
        // If it's a folder (has nested items and no direct request)
        if (Array.isArray(item.item) && !item.request) {
          const fRes = await bridge.createCollectionFolder({
            collection_id: colId,
            name: item.name || "Folder",
            parent_id: folderId,
          });
          const newFolderId = (fRes as any)?.folder?.id;
          await processItems(item.item, newFolderId);
        } else if (item.request) {
          // It's a request
          const reqObj = item.request;
          const method = typeof reqObj === "string" ? "GET" : reqObj.method || "GET";
          let urlStr = "";
          if (typeof reqObj === "string") {
            urlStr = reqObj;
          } else if (typeof reqObj.url === "string") {
            urlStr = reqObj.url;
          } else if (reqObj.url?.raw) {
            urlStr = reqObj.url.raw;
          }

          // Headers
          const headers: Array<{ key: string; value: string; enabled: boolean }> = [];
          if (Array.isArray(reqObj.header)) {
            for (const h of reqObj.header) {
              if (h.key) {
                headers.push({
                  key: h.key,
                  value: h.value ?? "",
                  enabled: h.disabled !== true,
                });
              }
            }
          }

          // Body
          let bodyObj: any = { type: "none" };
          if (reqObj.body) {
            const mode = reqObj.body.mode;
            if (mode === "raw") {
              bodyObj = { type: "raw", content: reqObj.body.raw || "" };
            } else if (mode === "urlencoded") {
              const pairs = (reqObj.body.urlencoded || []).map((p: any) => ({
                key: p.key || "",
                value: p.value || "",
                enabled: p.disabled !== true,
              }));
              bodyObj = { type: "form", content: JSON.stringify(pairs) };
            }
          }

          await bridge.saveRequest({
            workspace_id: workspaceId,
            collection_id: colId,
            folder_id: folderId,
            name: item.name || method,
            method,
            url: urlStr,
            configuration: {
              headers,
              body: bodyObj,
            },
          });
          reqCount++;
        }
      }
    };

    await processItems(data.item);
    return { count: reqCount, name: colName };
  }

  // 3. OpenAPI 3.0 / Swagger 2.0 format
  if ((data.openapi || data.swagger) && data.paths && typeof data.paths === "object") {
    const colName = data.info?.title || "Imported API Specification";
    const res = await bridge.createCollection({
      workspace_id: workspaceId,
      name: colName,
      description: typeof data.info?.description === "string" ? data.info.description : undefined,
    });
    const colId = (res as any)?.collection?.id;
    if (!colId) throw new Error("Failed to create collection");

    let baseUrl = "";
    if (data.servers && Array.isArray(data.servers) && data.servers[0]?.url) {
      baseUrl = data.servers[0].url;
    } else if (data.host) {
      const scheme = data.schemes?.[0] || "https";
      baseUrl = `${scheme}://${data.host}${data.basePath || ""}`;
    }

    const folderMap: Record<string, string> = {};
    let reqCount = 0;
    const methods = ["get", "post", "put", "delete", "patch", "head", "options"] as const;

    for (const [pathKey, pathItem] of Object.entries(data.paths)) {
      if (!pathItem || typeof pathItem !== "object") continue;

      for (const method of methods) {
        const op = (pathItem as any)[method];
        if (!op || typeof op !== "object") continue;

        let folderId: string | undefined = undefined;
        const tag = Array.isArray(op.tags) && op.tags[0] ? String(op.tags[0]) : undefined;
        if (tag) {
          if (!folderMap[tag]) {
            const fRes = await bridge.createCollectionFolder({
              collection_id: colId,
              name: tag,
            });
            if (fRes.status === "ok" && fRes.folder?.id) {
              folderMap[tag] = fRes.folder.id;
            }
          }
          folderId = folderMap[tag];
        }

        const fullUrl = baseUrl
          ? `${baseUrl.replace(/\/$/, "")}${pathKey.startsWith("/") ? pathKey : `/${pathKey}`}`
          : pathKey;

        const reqName = op.summary || op.operationId || `${method.toUpperCase()} ${pathKey}`;

        await bridge.saveRequest({
          workspace_id: workspaceId,
          collection_id: colId,
          folder_id: folderId,
          name: reqName,
          method: method.toUpperCase(),
          url: fullUrl,
          configuration: {
            headers: [],
            body: { type: "none" },
          },
        });
        reqCount++;
      }
    }

    return { count: reqCount, name: colName };
  }

  throw new Error("Unrecognized collection format. Expected KuroRelay, Postman (v2), or OpenAPI 3/Swagger.");
}
