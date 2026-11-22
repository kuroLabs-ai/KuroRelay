import type { FolderItem } from "../stores/appStore";

export type FolderNode = FolderItem & { children: FolderNode[] };

export function buildFolderTree(
  folders: FolderItem[],
  collectionId: string,
): FolderNode[] {
  const nodes = folders.map((folder) => ({ ...folder, children: [] as FolderNode[] }));
  const byId = new Map(nodes.map((folder) => [folder.id, folder]));
  const roots: FolderNode[] = [];

  nodes.forEach((folder) => {
    const parentId = folder.parent_id ?? folder.parent_folder_id;
    const parent = parentId ? byId.get(parentId) : undefined;
    const parentCollectionId = parent?.collection_id ?? parent?.collectionId ?? collectionId;
    if (parent && parentCollectionId === collectionId && parent.id !== folder.id) {
      parent.children.push(folder);
    } else {
      roots.push(folder);
    }
  });

  return roots;
}

export function countFolders(folders: FolderNode[]): number {
  return folders.reduce((count, folder) => count + 1 + countFolders(folder.children), 0);
}
