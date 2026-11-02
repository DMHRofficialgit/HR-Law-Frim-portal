"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { API_URL, apiFetch, apiUpload } from "../lib/api";
import { getToken } from "../lib/auth";
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
  const [signatures, setSignatures] = useState<SignatureMeta[]>([]);
  const [max, setMax] = useState(5);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  async function confirmDelete() {
    if (!confirmId) return;
    setError("");
    setNotice("");
    const result = await apiFetch<ListPayload>(`/me/signature/${confirmId}`, {
      method: "DELETE",
      token: getToken(),
    });
    setConfirmId(null);
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
                  onClick={() => setConfirmId(s.id)}
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

      {confirmId ? (
        <div className="esign-sheet-backdrop" style={{ zIndex: 80 }} role="dialog" aria-modal="true">
          <div className="panel confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Remove this signature?</h3>
            <p className="lead">This cannot be undone.</p>
            <div className="esign-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmId(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmDelete}>
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSaveDraw}>
        <div className="field">
          <label>Draw signature</label>
          <SignaturePad onChange={setBlob} />
        </div>
        <div className="esign-actions" style={{ marginBottom: 12 }}>
          <button className="btn btn-primary" type="submit" disabled={saving || !blob || atMax}>
            {saving ? "Saving…" : "Save drawing"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={saving || atMax}
            onClick={() => fileRef.current?.click()}
          >
            Upload PNG
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,.png"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              e.target.value = "";
              onUploadFile(file);
            }}
          />
        </div>
        {atMax ? (
          <p className="org-meta">Maximum of {max} signatures reached. Remove one to add another.</p>
        ) : null}
      </form>
    </section>
  );
}
