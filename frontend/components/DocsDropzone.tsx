"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactElement,
} from "react";
import { FileUp, Upload } from "lucide-react";

type DocsDropzoneProps = {
  disabled?: boolean;
  busy?: boolean;
  accept: string;
  hint: string;
  onFiles: (files: File[]) => void;
};

export const DocsDropzone = ({
  disabled = false,
  busy = false,
  accept,
  hint,
  onFiles,
}: DocsDropzoneProps): ReactElement => {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const locked = disabled || busy;

  const takeFiles = useCallback(
    (list: FileList | File[] | null) => {
      if (!list || locked) return;
      const files = Array.from(list);
      if (files.length === 0) return;
      onFiles(files);
    },
    [locked, onFiles]
  );

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked) return;
    setDragOver(true);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked) return;
    setDragOver(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    takeFiles(e.dataTransfer.files);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    takeFiles(e.target.files);
    e.target.value = "";
  };

  return (
    <div
      className={`docs-dropzone${dragOver ? " is-dragover" : ""}${locked ? " is-disabled" : ""}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      role="region"
      aria-label="Upload files"
    >
      <div className="docs-dropzone-main">
        <span className="docs-dropzone-icon" aria-hidden>
          <FileUp size={18} strokeWidth={1.75} />
        </span>
        <div className="docs-dropzone-copy">
          <p className="docs-dropzone-title">
            {busy ? "Uploading…" : "Drop files to upload"}
          </p>
          <p className="docs-dropzone-hint">{hint}</p>
        </div>
      </div>
      <label
        htmlFor={inputId}
        className={`btn btn-ghost btn-sm docs-dropzone-select${locked ? " disabled" : ""}`}
      >
        <Upload size={14} strokeWidth={1.75} aria-hidden />
        Select files
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept={accept}
          disabled={locked}
          onChange={onChange}
        />
      </label>
    </div>
  );
};
