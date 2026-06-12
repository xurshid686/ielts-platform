"use client";

import { useState } from "react";
import { FileText, LinkIcon, Download, ExternalLink, Loader2 } from "lucide-react";
import { getMaterialFileUrl } from "@/app/actions/admin";
import { EmptyState } from "@/components/ui/empty-state";
import type { Material } from "@/types/database";

export function MaterialsView({ materials }: { materials: Material[] }) {
  if (materials.length === 0) {
    return (
      <EmptyState
        icon={<FileText />}
        title="No materials yet"
        desc="Your teacher will add study materials here soon — check back shortly."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {materials.map((m) => (
        <MaterialCard key={m.id} material={m} />
      ))}
    </div>
  );
}

function MaterialCard({ material }: { material: Material }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFile = material.kind === "file";

  async function openFile() {
    setBusy(true);
    setError(null);
    const res = await getMaterialFileUrl(material.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  const content = (
    <>
      <div className="flex items-start justify-between">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            isFile ? "bg-primary/10 text-primary" : "bg-accent/15 text-accent"
          }`}
        >
          {isFile ? <FileText className="h-5 w-5" /> : <LinkIcon className="h-5 w-5" />}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors group-hover:text-primary">
          {isFile ? (
            busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
          {isFile ? "Open" : "Visit"}
        </span>
      </div>
      <h3 className="mt-3 font-semibold leading-snug">{material.title}</h3>
      {material.description && (
        <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted">
          {material.description}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </>
  );

  const cardClass =
    "group flex h-full flex-col rounded-2xl border border-border bg-surface p-5 text-left shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated";

  if (isFile) {
    return (
      <button type="button" onClick={openFile} disabled={busy} className={cardClass}>
        {content}
      </button>
    );
  }

  return (
    <a
      href={material.url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className={cardClass}
    >
      {content}
    </a>
  );
}
