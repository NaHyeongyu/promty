import { useState } from "react";

export function useRepositoryConnector() {
  const [isRepositoryConnectorOpen, setIsRepositoryConnectorOpen] = useState(false);
  const [repositoryConnectorProjectId, setRepositoryConnectorProjectId] =
    useState<string | null>(null);

  const openRepositoryConnector = (projectId: string | null = null) => {
    setRepositoryConnectorProjectId(projectId);
    setIsRepositoryConnectorOpen(true);
  };

  const closeRepositoryConnector = () => {
    setIsRepositoryConnectorOpen(false);
    setRepositoryConnectorProjectId(null);
  };

  return {
    closeRepositoryConnector,
    isRepositoryConnectorOpen,
    openRepositoryConnector,
    repositoryConnectorProjectId,
  };
}
