import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { focusableModalElements } from "./modalFocus";
import {
  projectTagsFromInput,
  projectVisibilityFromValue,
} from "./overviewPanelUtils";
import type { ProjectDetailData } from "./types";

type ProjectVisibility = "private" | "public";
type OverviewEditorKind = "project" | "description";

const OVERVIEW_EDIT_DRAWER_ANIMATION_MS = 200;

type UseOverviewEditorsOptions = {
  data: ProjectDetailData;
  rawDescriptionValue: string;
  onSaveDescription?: (description: string) => Promise<void>;
  onSaveProjectMetadata?: (metadata: {
    projectUrl?: string;
    tags?: string[];
    visibility?: ProjectVisibility;
  }) => Promise<void>;
};

export function useOverviewEditors({
  data,
  rawDescriptionValue,
  onSaveDescription,
  onSaveProjectMetadata,
}: UseOverviewEditorsOptions) {
  const overviewEditDrawerRef = useRef<HTMLElement | null>(null);
  const overviewEditCloseTimerRef = useRef<number | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState(data.project.description);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
  const [isDescriptionSaving, setIsDescriptionSaving] = useState(false);
  const [isProjectMetadataEditing, setIsProjectMetadataEditing] = useState(false);
  const [isProjectMetadataSaving, setIsProjectMetadataSaving] = useState(false);
  const [projectMetadataError, setProjectMetadataError] = useState<string | null>(null);
  const [projectUrlDraft, setProjectUrlDraft] = useState(data.project.projectUrl ?? "");
  const [projectTagsDraft, setProjectTagsDraft] = useState(
    data.project.tags.join(", "),
  );
  const [projectVisibilityDraft, setProjectVisibilityDraft] =
    useState<ProjectVisibility>(projectVisibilityFromValue(data.project.visibility));
  const [closingOverviewEditor, setClosingOverviewEditor] =
    useState<OverviewEditorKind | null>(null);
  const isProjectMetadataDrawerVisible =
    isProjectMetadataEditing || closingOverviewEditor === "project";
  const isDescriptionDrawerVisible =
    isDescriptionEditing || closingOverviewEditor === "description";
  const isOverviewDrawerOpen =
    isProjectMetadataDrawerVisible || isDescriptionDrawerVisible;

  const clearOverviewEditCloseTimer = () => {
    if (overviewEditCloseTimerRef.current !== null) {
      window.clearTimeout(overviewEditCloseTimerRef.current);
      overviewEditCloseTimerRef.current = null;
    }
  };

  const resetProjectMetadataDraft = () => {
    setProjectUrlDraft(data.project.projectUrl ?? "");
    setProjectTagsDraft(data.project.tags.join(", "));
    setProjectVisibilityDraft(projectVisibilityFromValue(data.project.visibility));
    setProjectMetadataError(null);
  };

  const resetDescriptionDraft = () => {
    setDescriptionDraft(rawDescriptionValue);
    setDescriptionError(null);
  };

  const completeOverviewEditorClose = (editor: OverviewEditorKind) => {
    if (editor === "project") {
      resetProjectMetadataDraft();
      setIsProjectMetadataEditing(false);
    } else {
      resetDescriptionDraft();
      setIsDescriptionEditing(false);
    }
    setClosingOverviewEditor((currentEditor) =>
      currentEditor === editor ? null : currentEditor,
    );
    overviewEditCloseTimerRef.current = null;
  };

  const closeOverviewEditorWithAnimation = (editor: OverviewEditorKind) => {
    clearOverviewEditCloseTimer();
    setClosingOverviewEditor(editor);
    overviewEditCloseTimerRef.current = window.setTimeout(() => {
      completeOverviewEditorClose(editor);
    }, OVERVIEW_EDIT_DRAWER_ANIMATION_MS);
  };

  const openProjectMetadataEditor = () => {
    clearOverviewEditCloseTimer();
    setClosingOverviewEditor(null);
    resetProjectMetadataDraft();
    setIsDescriptionEditing(false);
    setIsProjectMetadataEditing(true);
  };

  const closeProjectMetadataEditor = () => {
    closeOverviewEditorWithAnimation("project");
  };

  const openDescriptionEditor = () => {
    clearOverviewEditCloseTimer();
    setClosingOverviewEditor(null);
    resetDescriptionDraft();
    setIsProjectMetadataEditing(false);
    setIsDescriptionEditing(true);
  };

  const closeDescriptionEditor = () => {
    closeOverviewEditorWithAnimation("description");
  };

  const saveDescription = async (nextDescription: string) => {
    if (!onSaveDescription || isDescriptionSaving) {
      return;
    }

    setDescriptionError(null);
    setIsDescriptionSaving(true);
    try {
      await onSaveDescription(nextDescription);
      closeDescriptionEditor();
    } catch (error) {
      setDescriptionError(
        error instanceof Error ? error.message : "Description could not be saved",
      );
    } finally {
      setIsDescriptionSaving(false);
    }
  };

  const saveProjectMetadata = async (tagInput = projectTagsDraft) => {
    if (!onSaveProjectMetadata || isProjectMetadataSaving) {
      return;
    }

    setProjectMetadataError(null);
    setIsProjectMetadataSaving(true);
    try {
      await onSaveProjectMetadata({
        projectUrl: projectUrlDraft,
        tags: projectTagsFromInput(tagInput),
        visibility: projectVisibilityDraft,
      });
      closeProjectMetadataEditor();
    } catch (error) {
      setProjectMetadataError(
        error instanceof Error ? error.message : "Project metadata could not be saved",
      );
    } finally {
      setIsProjectMetadataSaving(false);
    }
  };

  const handleOverviewDrawerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (isProjectMetadataSaving || isDescriptionSaving) {
        return;
      }
      if (isProjectMetadataEditing) {
        closeProjectMetadataEditor();
      } else {
        closeDescriptionEditor();
      }
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const drawerElement = overviewEditDrawerRef.current;
    if (!drawerElement) {
      return;
    }

    const focusableElements = focusableModalElements(drawerElement);
    if (focusableElements.length === 0) {
      event.preventDefault();
      drawerElement.focus({ preventScroll: true });
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
      return;
    }

    if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
    }
  };

  useEffect(() => {
    setDescriptionDraft(data.project.description);
    setDescriptionError(null);
  }, [data.project.description, data.project.id]);

  useEffect(() => {
    setProjectUrlDraft(data.project.projectUrl ?? "");
    setProjectTagsDraft(data.project.tags.join(", "));
    setProjectVisibilityDraft(projectVisibilityFromValue(data.project.visibility));
    setProjectMetadataError(null);
  }, [data.project.id, data.project.projectUrl, data.project.tags, data.project.visibility]);

  useEffect(() => {
    clearOverviewEditCloseTimer();
    setClosingOverviewEditor(null);
    setIsDescriptionEditing(false);
    setIsProjectMetadataEditing(false);
  }, [data.project.id]);

  useEffect(() => {
    if (!isOverviewDrawerOpen) {
      return;
    }

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";

    const focusTimer = window.setTimeout(() => {
      overviewEditDrawerRef.current?.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      previousActiveElement?.focus({ preventScroll: true });
    };
  }, [isOverviewDrawerOpen]);

  useEffect(
    () => () => {
      clearOverviewEditCloseTimer();
    },
    [],
  );

  return {
    closingOverviewEditor,
    closeDescriptionEditor,
    closeProjectMetadataEditor,
    descriptionDraft,
    descriptionError,
    handleOverviewDrawerKeyDown,
    isDescriptionDrawerVisible,
    isDescriptionSaving,
    isProjectMetadataDrawerVisible,
    isProjectMetadataSaving,
    openDescriptionEditor,
    openProjectMetadataEditor,
    overviewEditDrawerRef,
    projectMetadataError,
    projectUrlDraft,
    projectTagsDraft,
    projectVisibilityDraft,
    saveDescription,
    saveProjectMetadata,
    setDescriptionDraft,
    setProjectUrlDraft,
    setProjectTagsDraft,
    setProjectVisibilityDraft,
  };
}
