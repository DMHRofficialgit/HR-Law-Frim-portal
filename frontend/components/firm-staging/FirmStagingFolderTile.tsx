"use client";

import type { KeyboardEvent, ReactElement } from "react";
import type { FirmStagingFolder } from "../../lib/firm-staging";
import { FirmStagingFolderMark } from "./FirmStagingFolderMark";

type FirmStagingFolderTileProps = {
  folder: FirmStagingFolder;
  selected: boolean;
  onSelect: (folderId: string) => void;
};

export const FirmStagingFolderTile = ({
  folder,
  selected,
  onSelect,
}: FirmStagingFolderTileProps): ReactElement => {
  const shortLabel = folder.name.replace(/^My\s+/i, "");
  const countLabel =
    folder.fileCount === 1 ? "1 file" : `${folder.fileCount} files`;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(folder.id);
    }
  };

  return (
    <button
      type="button"
      className={`firm-staging-tile${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      aria-label={`${folder.name}, ${countLabel}`}
      onClick={() => onSelect(folder.id)}
      onKeyDown={onKeyDown}
    >
      <FirmStagingFolderMark label={shortLabel.slice(0, 10)} selected={selected} />
      <strong className="firm-staging-tile-name">{folder.name}</strong>
      <span className="firm-staging-tile-meta">{countLabel}</span>
    </button>
  );
};
