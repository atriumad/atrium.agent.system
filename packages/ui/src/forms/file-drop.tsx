"use client";

import { UploadCloud, X } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";
import { cx } from "../lib/cx";

export type FileDropProps = {
  label: string;
  /** Shown under the label: what is accepted and how big. */
  hint?: string;
  accept?: string;
  multiple?: boolean;
  /** Bytes. Files over this are refused and listed in the error. */
  maxSize?: number;
  onFiles?: (files: File[]) => void;
  className?: string;
};

const mb = (n: number) => `${(n / 1_048_576).toFixed(1)} MB`;

/** Drop files, or choose them. The real input stays in the page, so a keyboard and a screen reader use it directly. */
export function FileDrop({
  label,
  hint,
  accept,
  multiple,
  maxSize,
  onFiles,
  className,
}: FileDropProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  function take(list: FileList | File[]) {
    const all = Array.from(list);
    const tooBig = maxSize ? all.filter((f) => f.size > maxSize) : [];
    if (tooBig.length)
      setError(`${tooBig.map((f) => f.name).join(", ")} is over ${mb(maxSize as number)}.`);
    else setError(null);
    const ok = all.filter((f) => !tooBig.includes(f));
    const next = multiple ? [...files, ...ok] : ok.slice(0, 1);
    setFiles(next);
    onFiles?.(next);
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files);
  }

  function remove(file: File) {
    const next = files.filter((f) => f !== file);
    setFiles(next);
    onFiles?.(next);
  }

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="label-caps text-fg-muted">
        {label}
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        data-over={over || undefined}
        className="flex flex-col items-center gap-2 rounded-md border border-dashed border-charcoal-400 px-6 py-8 text-center data-over:border-charcoal-800 data-over:bg-lime-100 dark:data-over:bg-charcoal-700"
      >
        <UploadCloud size={24} strokeWidth={1.5} aria-hidden="true" />
        <p className="m-0 text-sm">
          Drop {multiple ? "files" : "a file"} here, or{" "}
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="cursor-pointer underline underline-offset-4 hover:text-clay-600"
          >
            choose {multiple ? "files" : "one"}
          </button>
        </p>
        {hint ? <p className="m-0 text-xs text-fg-muted">{hint}</p> : null}
        <input
          ref={input}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(e) => e.target.files && take(e.target.files)}
        />
      </div>
      {error ? (
        <p role="alert" className="m-0 text-xs text-clay-600 dark:text-clay-300">
          {error}
        </p>
      ) : null}
      {files.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {files.map((f) => (
            <li
              key={`${f.name}-${f.size}`}
              className="flex items-center justify-between gap-3 rounded-sm bg-surface-sunken px-3 py-2 text-sm"
            >
              <span className="truncate">
                {f.name} <span className="text-fg-muted tabular-nums">{mb(f.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => remove(f)}
                aria-label={`Remove ${f.name}`}
                className="cursor-pointer"
              >
                <X size={14} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
