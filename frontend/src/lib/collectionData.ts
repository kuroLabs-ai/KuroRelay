import { bridge } from "../bridge/client";
import type { CollectionItem } from "../stores/appStore";

const collectionLoadVersions = new Map<string, number>();

export function getCollectionLoadVersion(workspaceId: string): number {
  return collectionLoadVersions.get(workspaceId) ?? 0;
}

export function invalidateCollectionLoads(workspaceId: string): void {
  collectionLoadVersions.set(workspaceId, getCollectionLoadVersion(workspaceId) + 1);
}

export async function loadCollectionsWithFolders(
  workspaceId: string,
): Promise<CollectionItem[]> {
  const result = await bridge.getCollections(workspaceId);
  if (result.status !== "ok") {
    throw new Error("Could not load collections");
  }

  return Promise.all(
    (result.collections ?? []).map(async (collection) => {
      const [foldersResult, requestsResult] = await Promise.all([
        bridge.getCollectionFolders(collection.id),
        bridge.getCollectionRequests(collection.id),
      ]);
      if (foldersResult.status !== "ok") {
        throw new Error(`Could not load folders for "${collection.name}"`);
      }
      if (requestsResult.status !== "ok") {
        throw new Error(`Could not load requests for "${collection.name}"`);
      }
      return {
        ...collection,
        folders: foldersResult.folders ?? [],
        requests: requestsResult.requests ?? [],
      };
    }),
  );
}
