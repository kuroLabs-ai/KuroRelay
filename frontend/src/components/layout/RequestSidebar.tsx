import { useEffect } from "react";
import {
  getCollectionLoadVersion,
  loadCollectionsWithFolders,
} from "../../lib/collectionData";
import { useAppStore } from "../../stores/appStore";
import { useToast } from "../ui/Toast";
import { CollectionsSidebar } from "./CollectionsSidebar";

export const RequestSidebar: React.FC = () => {
  const {
    activeWorkspaceId,
    collections,
    collectionsLoadedWorkspaceId,
    setCollectionsForWorkspace,
  } = useAppStore();
  const { toast } = useToast();

  useEffect(() => {
    const hasCompleteData =
      collectionsLoadedWorkspaceId === activeWorkspaceId &&
      collections.every(
        (collection) => Array.isArray(collection.folders) && Array.isArray(collection.requests),
      );
    if (!activeWorkspaceId || hasCompleteData) return;
    let isCurrent = true;
    const workspaceId = activeWorkspaceId;
    const loadCollections = async (): Promise<void> => {
      const version = getCollectionLoadVersion(workspaceId);
      try {
        const loadedCollections = await loadCollectionsWithFolders(workspaceId);
        if (!isCurrent) return;
        if (version !== getCollectionLoadVersion(workspaceId)) {
          if (useAppStore.getState().collectionsLoadedWorkspaceId !== workspaceId) {
            void loadCollections();
          }
          return;
        }
        setCollectionsForWorkspace(workspaceId, loadedCollections);
      } catch (error) {
        if (!isCurrent) return;
        const message = error instanceof Error ? error.message : "Could not load saved requests";
        toast(message, "error");
      }
    };
    void loadCollections();

    return () => {
      isCurrent = false;
    };
  }, [activeWorkspaceId, collections, collectionsLoadedWorkspaceId, setCollectionsForWorkspace, toast]);

  return <CollectionsSidebar selectedOnly openCreatedRequests />;
};
