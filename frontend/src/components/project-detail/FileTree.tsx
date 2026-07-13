import { type CSSProperties } from "react";
import { ExternalLink, File, Folder } from "lucide-react";
import type { FileTreeNode } from "./types";

type FileTreeProps = {
  label?: string;
  nodes: FileTreeNode[];
  onFileSelect?: (path: string) => void;
  opensExternal?: boolean;
  selectedPath?: string | null;
};

function FileTreeNodeView({
  depth = 0,
  node,
  onFileSelect,
  opensExternal,
  selectedPath,
}: {
  depth?: number;
  node: FileTreeNode;
  onFileSelect?: (path: string) => void;
  opensExternal?: boolean;
  selectedPath?: string | null;
}) {
  const Icon = node.type === "folder" ? Folder : File;
  const isSelectableFile = node.type === "file" && node.path && onFileSelect;
  const isSelected = node.type === "file" && node.path === selectedPath;
  const content = (
    <>
      <Icon aria-hidden="true" size={16} strokeWidth={1.5} />
      <span>{node.name}</span>
      {node.type === "file" && opensExternal ? (
        <ExternalLink
          aria-hidden="true"
          className="bh-file-tree-external-icon"
          size={13}
          strokeWidth={1.5}
        />
      ) : null}
    </>
  );

  return (
    <li>
      {isSelectableFile ? (
        <button
          aria-label={opensExternal ? `${node.name}, open on GitHub` : undefined}
          className="bh-file-tree-row"
          data-selected={isSelected}
          onClick={() => onFileSelect(node.path ?? "")}
          style={{ "--tree-depth": depth } as CSSProperties}
          type="button"
        >
          {content}
        </button>
      ) : (
        <div
          className="bh-file-tree-row"
          style={{ "--tree-depth": depth } as CSSProperties}
        >
          {content}
        </div>
      )}

      {node.children?.length ? (
        <ul>
          {node.children.map((child) => (
            <FileTreeNodeView
              depth={depth + 1}
              key={child.path ?? `${node.name}-${child.name}`}
              node={child}
              onFileSelect={onFileSelect}
              opensExternal={opensExternal}
              selectedPath={selectedPath}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FileTree({
  label = "Project files",
  nodes,
  onFileSelect,
  opensExternal,
  selectedPath,
}: FileTreeProps) {
  return (
    <div className="bh-file-tree" role="tree" aria-label={label}>
      <ul>
        {nodes.map((node) => (
          <FileTreeNodeView
            key={node.path ?? node.name}
            node={node}
            onFileSelect={onFileSelect}
            opensExternal={opensExternal}
            selectedPath={selectedPath}
          />
        ))}
      </ul>
    </div>
  );
}
