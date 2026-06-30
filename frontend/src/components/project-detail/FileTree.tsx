import { type CSSProperties } from "react";
import { File, Folder } from "lucide-react";
import type { FileTreeNode } from "./types";

type FileTreeProps = {
  label?: string;
  nodes: FileTreeNode[];
  onFileSelect?: (path: string) => void;
  selectedPath?: string | null;
};

function FileTreeNodeView({
  depth = 0,
  node,
  onFileSelect,
  selectedPath,
}: {
  depth?: number;
  node: FileTreeNode;
  onFileSelect?: (path: string) => void;
  selectedPath?: string | null;
}) {
  const Icon = node.type === "folder" ? Folder : File;
  const isSelectableFile = node.type === "file" && node.path && onFileSelect;
  const isSelected = node.type === "file" && node.path === selectedPath;
  const content = (
    <>
      <Icon aria-hidden="true" size={16} strokeWidth={1.5} />
      <span>{node.name}</span>
    </>
  );

  return (
    <li>
      {isSelectableFile ? (
        <button
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
            selectedPath={selectedPath}
          />
        ))}
      </ul>
    </div>
  );
}
