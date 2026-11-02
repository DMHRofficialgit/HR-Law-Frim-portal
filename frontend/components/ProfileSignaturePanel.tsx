"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useConfirm } from "../context/ConfirmContext";
import { API_URL, apiFetch, apiUpload } from "../lib/api";
import { getToken } from "../lib/auth";
import { DocsDropzone } from "./DocsDropzone";
import { SignaturePad } from "./SignaturePad";
import { TooltipAnchor } from "./TooltipAnchor";

type SignatureMeta = {
  id: string;
  isDefault: boolean;
  createdAt: string;
};

type ListPayload = {
  signatures: SignatureMeta[];
  max: number;
  hasSignature: boolean;
};

export function ProfileSignaturePanel() {
  const { confirm } = useConfirm();
  const [signatures, setSignatures] = useState<SignatureMeta[]>([]);
  const [max, setMax] = useState(5);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const previewsRef = useRef(previews);
  previewsRef.current = previews;

  async function loadImage(id: string): Promise<string | null> {
    const token = getToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}/me/signature/${id}/image`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const imageBlob = await res.blob();
    return URL.createObjectURL(imageBlob);
  }

  async function load() {
    const result = await apiFetch<ListPayload>("/me/signature", { token: getToken() });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setSignatures(result.data.signatures);
    setMax(result.data.max);
    const next: Record<string, string> = {};
    await Promise.all(
      result.data.signatures.map(async (s) => {
        const url = await loadImage(s.id);
        if (url) next[s.id] = url;
      })
    );
    setPreviews((prev) => {
      Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
      return next;
    });
  }

  useEffect(() => {
    load();
    return () => {
      Object.values(previewsRef.current).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  async function saveBlob(fileBlob: Blob, fileName = "signature.png") {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const fd = new FormData();
      fd.append("file", fileBlob, fileName);
      const result = await apiUpload<ListPayload>("/me/signature", fd, getToken());
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setNotice("Signature saved to your profile.");
      setSignatures(result.data.signatures);
      setMax(result.data.max);
      await load();
      setBlob(null);
    } catch {
      setError("Unable to save signature.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveDraw(e: FormEvent) {
    e.preventDefault();
    if (!blob) {
      setError("Draw a signature first.");
      return;
    }
    await saveBlob(blob);
  }

  async function onUploadFile(file: File | null) {
    if (!file) return;
    const isPng =
      file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
    if (!isPng) {
      setError("Upload a PNG file only.");
      return;
    }
    await saveBlob(file, file.name);
  }

  async function removeSignature(id: string) {
    const ok = await confirm({
      title: "Remove this signature?",
      description: "This cannot be undone.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    setError("");
    setNotice("");
    const result = await apiFetch<ListPayload>(`/me/signature/${id}`, {
      method: "DELETE",
      token: getToken(),
    });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setNotice("Signature removed.");
    setSignatures(result.data.signatures);
    setMax(result.data.max);
    await load();
  }

  async function makeDefault(id: string) {
    setError("");
    const result = await apiFetch<ListPayload>(`/me/signature/${id}/default`, {
      method: "POST",
      token: getToken(),
    });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setSignatures(result.data.signatures);
    setNotice("Default signature updated.");
  }

  const atMax = signatures.length >= max;

  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <h2>Your signature</h2>
      <p className="lead">
        Draw or upload PNG signatures for e-sign (up to {max}). You can still draw a new one when
        signing a document.
      </p>
      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      {signatures.length === 0 ? (
        <p className="org-meta">No saved signatures yet.</p>
      ) : (
        <ul className="signature-tile-grid">
          {signatures.map((s) => (
            <li key={s.id} className={`signature-tile${s.isDefault ? " is-default" : ""}`}>
              <TooltipAnchor label="Remove">
                <button
                  type="button"
                  className="signature-tile-x"
                  aria-label="Remove signature"
                  onClick={() => removeSignature(s.id)}
                >
                  ×
                </button>
              </TooltipAnchor>
              {previews[s.id] ? (
                <img src={previews[s.id]} alt="Saved signature" className="signature-preview" />
              ) : (
                <div className="signature-preview signature-preview-empty">…</div>
              )}
              <div className="signature-tile-actions">
                {s.isDefault ? (
                  <span className="org-meta">Default</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => makeDefault(s.id)}
                  >
                    Set default
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSaveDraw}>
        <div className="field">
          <label>Draw signature</label>
          <SignaturePad onChange={setBlob} />
        </div>
        <div className="esign-actions" style={{ marginBottom: 12 }}>
          <button className="btn btn-primary" type="submit" disabled={saving || !blob || atMax}>
            {saving ? "Saving…" : "Save drawing"}
          </button>
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Or upload a PNG</label>
          <DocsDropzone
            compact
            multiple={false}
            disabled={atMax}
            busy={saving}
            accept="image/png,.png"
            hint="PNG only · drag and drop or select"
            title="Drop a signature PNG here"
            selectLabel="Select PNG"
            onFiles={(picked) => onUploadFile(picked[0] || null)}
          />
        </div>
        {atMax ? (
          <p className="org-meta">Maximum of {max} signatures reached. Remove one to add another.</p>
        ) : null}
      </form>
    </section>
  );
}
