"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, apiFetch, authHeaders } from "../lib/api";
import { getToken } from "../lib/auth";
import { renderTypedSignaturePng } from "../lib/render-typed-signature";
import {
  defaultLabelForType,
  isInkFieldType,
  isTextFieldType,
  SIGNATURE_FIELD_TYPES,
} from "../lib/signatures";
import { EsignPdfViewer, type LocalField } from "./EsignPdfViewer";
import { PortalSelect } from "./PortalSelect";
import { SignaturePad } from "./SignaturePad";

type TemplateField = {
  id: string;
  type: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  required: boolean;
  sortOrder: number;
  role: "client" | "admin";
  signedImagePath?: string | null;
  valueText?: string | null;
};

type LibraryDocument = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  requiresSignature: boolean;
  fields: TemplateField[];
  adminInkReady?: boolean;
};

type Props = {
  documentId: string;
  onClose: () => void;
  onSaved?: () => void;
};

type PlaceField = LocalField & {
  role: "client" | "admin";
  inkDataUrl?: string | null;
  keepSignedImagePath?: string | null;
  valueText?: string | null;
};

type InkMode = "draw" | "saved" | "type";

type ProfileSig = { id: string; isDefault: boolean };

const ROLE_COLORS = {
  client: {
    border: "rgba(29, 78, 216, 0.85)",
    fill: "rgba(29, 78, 216, 0.12)",
    text: "#1d4ed8",
  },
  admin: {
    border: "rgba(36, 118, 75, 0.85)",
    fill: "rgba(36, 118, 75, 0.12)",
    text: "#24764b",
  },
};

function newField(page: number, type: string, role: "client" | "admin"): PlaceField {
  return {
    id: `local_${Math.random().toString(36).slice(2, 10)}`,
    type,
    page,
    x: 0.12 + Math.random() * 0.08,
    y: 0.7 + Math.random() * 0.08,
    width: type === "initials" || type === "date" ? 0.16 : 0.28,
    height: 0.055,
    label: defaultLabelForType(type),
    required: true,
    sortOrder: 0,
    assigneeUserId: role,
    role,
    inkDataUrl: null,
    keepSignedImagePath: null,
    valueText: null,
  };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read ink"));
    reader.readAsDataURL(blob);
  });
}

async function fetchInkDataUrl(
  documentId: string,
  fieldId: string,
  token: string | null
): Promise<string | null> {
  try {
    const res = await fetch(
      `${API_URL}/admin/firm-library/${documentId}/fields/${fieldId}/ink`,
      { headers: authHeaders(token) }
    );
    if (!res.ok) return null;
    return blobToDataUrl(await res.blob());
  } catch {
    return null;
  }
}

export function FirmLibraryPrepareSheet({ documentId, onClose, onSaved }: Props) {
  const token = getToken();
  const [doc, setDoc] = useState<LibraryDocument | null>(null);
  const [fields, setFields] = useState<PlaceField[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [placePage, setPlacePage] = useState(1);
  const [pdfPages, setPdfPages] = useState(1);
  const [activeRole, setActiveRole] = useState<"client" | "admin">("client");
  const [fieldType, setFieldType] = useState<string>("signature");
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [inkMode, setInkMode] = useState<InkMode>("draw");
  const [padBlob, setPadBlob] = useState<Blob | null>(null);
  const [typeInkText, setTypeInkText] = useState("");
  const [profileSigs, setProfileSigs] = useState<ProfileSig[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    const result = await apiFetch<{ document: LibraryDocument }>(
      `/admin/firm-library/${documentId}`,
      { token }
    );
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setDoc(result.data.document);
    const mapped: PlaceField[] = [];
    for (const f of result.data.document.fields) {
      let inkDataUrl: string | null = null;
      if (f.role === "admin" && f.signedImagePath) {
        inkDataUrl = await fetchInkDataUrl(documentId, f.id, token);
      }
      mapped.push({
        id: f.id,
        type: f.type,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        label: f.label,
        required: f.required,
        sortOrder: f.sortOrder,
        assigneeUserId: f.role,
        role: f.role,
        inkDataUrl,
        keepSignedImagePath: f.signedImagePath || null,
        valueText: f.valueText || null,
      });
    }
    setFields(mapped);

    const sigs = await apiFetch<{ signatures: ProfileSig[] }>("/me/signature", { token });
    if (sigs.success) {
      setProfileSigs(sigs.data.signatures);
      const def = sigs.data.signatures.find((s) => s.isDefault) || sigs.data.signatures[0];
      setSelectedProfileId(def?.id || null);
    }
  }, [documentId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const active = fields.find((f) => f.id === activeId) || null;
  const pdfUrl = `${API_URL}/admin/firm-library/${documentId}/file`;
  const fieldColors = useMemo(() => {
    const map: Record<string, { border: string; fill: string; text: string }> = {};
    for (const f of fields) map[f.id] = ROLE_COLORS[f.role];
    return map;
  }, [fields]);

  const fieldPreviews = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of fields) {
      if (f.inkDataUrl) map[f.id] = f.inkDataUrl;
    }
    return map;
  }, [fields]);

  function setFieldsFromViewer(next: LocalField[]) {
    setFields((prev) =>
      next.map((n) => {
        const old = prev.find((p) => p.id === n.id);
        const role = (old?.role ||
          (n.assigneeUserId === "admin" ? "admin" : "client")) as "client" | "admin";
        return {
          ...n,
          role,
          assigneeUserId: role,
          inkDataUrl: role === "admin" ? old?.inkDataUrl || null : null,
          keepSignedImagePath: role === "admin" ? old?.keepSignedImagePath || null : null,
          valueText: role === "admin" ? old?.valueText || null : null,
        };
      })
    );
  }

  async function applyPadToActive() {
    if (!active || active.role !== "admin" || !padBlob) return;
    const dataUrl = await blobToDataUrl(padBlob);
    setFields((prev) =>
      prev.map((f) =>
        f.id === active.id
          ? { ...f, inkDataUrl: dataUrl, keepSignedImagePath: null }
          : f
      )
    );
    setNotice("Admin ink applied to selected box — Save layout to keep forever.");
  }

  async function applySavedToActive() {
    if (!active || active.role !== "admin" || !selectedProfileId) return;
    const res = await fetch(`${API_URL}/me/signature/${selectedProfileId}/image`, {
      headers: authHeaders(token),
    });
    if (!res.ok) {
      setError("Could not load saved signature.");
      return;
    }
    const dataUrl = await blobToDataUrl(await res.blob());
    setFields((prev) =>
      prev.map((f) =>
        f.id === active.id
          ? { ...f, inkDataUrl: dataUrl, keepSignedImagePath: null }
          : f
      )
    );
    setNotice("Saved signature applied — Save layout to keep forever.");
  }

  async function applyTypedToActive() {
    if (!active || active.role !== "admin") return;
    const text = typeInkText.trim();
    if (!text) {
      setError("Type a name or initials first.");
      return;
    }
    if (isTextFieldType(active.type) && !isInkFieldType(active.type)) {
      setFields((prev) =>
        prev.map((f) =>
          f.id === active.id ? { ...f, valueText: text, inkDataUrl: null } : f
        )
      );
      setNotice("Admin value set — Save layout to keep forever.");
      return;
    }
    const blob = await renderTypedSignaturePng(text);
    const dataUrl = await blobToDataUrl(blob);
    setFields((prev) =>
      prev.map((f) =>
        f.id === active.id
          ? {
              ...f,
              inkDataUrl: dataUrl,
              keepSignedImagePath: null,
              valueText: isTextFieldType(f.type) ? text : f.valueText,
            }
          : f
      )
    );
    setNotice("Typed ink applied — Save layout to keep forever.");
  }

  async function save() {
    if (!doc?.requiresSignature) {
      setError("Turn on Requires signature for this template first.");
      return;
    }
    if (fields.length === 0) {
      setError("Add at least one box.");
      return;
    }
    for (const f of fields) {
      if (f.role !== "admin") continue;
      if (isInkFieldType(f.type) && !f.inkDataUrl && !f.keepSignedImagePath) {
        setError(`Sign Admin box “${f.label}” before saving (Draw / Saved / Type).`);
        return;
      }
      if (
        isTextFieldType(f.type) &&
        !isInkFieldType(f.type) &&
        !(f.valueText && f.valueText.trim()) &&
        !f.inkDataUrl &&
        !f.keepSignedImagePath
      ) {
        setError(`Set a value on Admin box “${f.label}” before saving.`);
        return;
      }
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{ document: LibraryDocument }>(
        `/admin/firm-library/${documentId}/fields`,
        {
          method: "PUT",
          token,
          body: JSON.stringify({
            fields: fields.map((f, i) => ({
              type: f.type,
              page: f.page,
              x: f.x,
              y: f.y,
              width: f.width,
              height: f.height,
              label: f.label,
              required: f.required !== false,
              sortOrder: i,
              role: f.role,
              inkDataUrl: f.role === "admin" ? f.inkDataUrl || null : null,
              valueText: f.role === "admin" ? f.valueText || null : null,
              keepSignedImagePath:
                f.role === "admin" && !f.inkDataUrl ? f.keepSignedImagePath || null : null,
            })),
          }),
        }
      );
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setNotice("Layout + Admin ink saved — every new client pack will reuse this.");
      setDoc(result.data.document);
      await load();
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="esign-sheet-backdrop" onClick={onClose}>
      <aside className="esign-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="esign-sheet-head">
          <div>
            <h2>{doc?.title || "Template layout"}</h2>
            <p className="lead esign-stage-hint">
              Place boxes once. Admin boxes: sign now and save forever. Client boxes wait for each
              company&apos;s primary login when you issue the pack.
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}
        {notice ? <div className="success-banner">{notice}</div> : null}

        <div className="esign-sheet-body">
          <div className="esign-sheet-main">
            <div className="esign-zoom">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
              >
                −
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
              >
                +
              </button>
              <span className="esign-page-chip">
                Page {placePage}/{pdfPages}
              </span>
            </div>
            {doc ? (
              <EsignPdfViewer
                pdfUrl={pdfUrl}
                authToken={token}
                fields={fields}
                mode="place"
                activeFieldId={activeId}
                fieldColors={fieldColors}
                fieldPreviews={fieldPreviews}
                onFieldsChange={setFieldsFromViewer}
                onFieldActivate={(id) => {
                  setActiveId(id);
                  const f = fields.find((x) => x.id === id);
                  if (f) {
                    setPlacePage(f.page);
                    setActiveRole(f.role);
                    if (f.valueText) setTypeInkText(f.valueText);
                  }
                }}
                onPlacePageChange={setPlacePage}
                onPageCount={setPdfPages}
                zoom={zoom}
              />
            ) : (
              <p className="lead">Loading PDF…</p>
            )}
          </div>

          <div className="esign-sheet-side">
            <section className="esign-side-block">
              <h3>Signer role</h3>
              <div className="ink-mode-toggle" role="group" aria-label="Signer role">
                <button
                  type="button"
                  className={`ink-mode-btn${activeRole === "client" ? " active" : ""}`}
                  onClick={() => setActiveRole("client")}
                >
                  Client
                </button>
                <button
                  type="button"
                  className={`ink-mode-btn${activeRole === "admin" ? " active" : ""}`}
                  onClick={() => setActiveRole("admin")}
                >
                  Admin
                </button>
              </div>
              <p className="org-meta" style={{ marginTop: 8 }}>
                Blue = client · Green = Admin (sign on template forever)
              </p>
            </section>

            <section className="esign-side-block">
              <h3>Add field</h3>
              <div className="field">
                <label htmlFor="tplType">Type</label>
                <PortalSelect
                  id="tplType"
                  aria-label="Field type"
                  value={fieldType}
                  options={SIGNATURE_FIELD_TYPES.map((t) => ({
                    value: t,
                    label: t,
                  }))}
                  onChange={setFieldType}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const f = newField(placePage, fieldType, activeRole);
                  setFields((prev) => [...prev, f]);
                  setActiveId(f.id);
                }}
              >
                + Add on page {placePage}
              </button>
            </section>

            {active ? (
              <section className="esign-side-block">
                <h3>Selected</h3>
                <div className="field">
                  <label>Label</label>
                  <input
                    value={active.label}
                    onChange={(e) =>
                      setFields((prev) =>
                        prev.map((f) =>
                          f.id === active.id ? { ...f, label: e.target.value } : f
                        )
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label>Role</label>
                  <PortalSelect
                    aria-label="Role"
                    value={active.role}
                    options={[
                      { value: "client", label: "Client" },
                      { value: "admin", label: "Admin" },
                    ]}
                    onChange={(next) => {
                      const role = next as "client" | "admin";
                      setFields((prev) =>
                        prev.map((f) =>
                          f.id === active.id
                            ? {
                                ...f,
                                role,
                                assigneeUserId: role,
                                inkDataUrl: role === "admin" ? f.inkDataUrl : null,
                                keepSignedImagePath:
                                  role === "admin" ? f.keepSignedImagePath : null,
                                valueText: role === "admin" ? f.valueText : null,
                              }
                            : f
                        )
                      );
                      setActiveRole(role);
                    }}
                  />
                </div>

                {active.role === "admin" ? (
                  <>
                    <p className="org-meta" style={{ marginBottom: 8 }}>
                      {active.inkDataUrl || active.keepSignedImagePath || active.valueText
                        ? "Ink saved on this box"
                        : "Sign this Admin box now (saved forever on Save layout)"}
                    </p>
                    <div className="ink-mode-toggle" role="group" aria-label="Ink mode">
                      <button
                        type="button"
                        className={`ink-mode-btn${inkMode === "draw" ? " active" : ""}`}
                        onClick={() => setInkMode("draw")}
                      >
                        Draw
                      </button>
                      <button
                        type="button"
                        className={`ink-mode-btn${inkMode === "saved" ? " active" : ""}`}
                        onClick={() => setInkMode("saved")}
                      >
                        Saved
                      </button>
                      <button
                        type="button"
                        className={`ink-mode-btn${inkMode === "type" ? " active" : ""}`}
                        onClick={() => setInkMode("type")}
                      >
                        Type
                      </button>
                    </div>
                    {inkMode === "draw" ? (
                      <div style={{ marginTop: 8 }}>
                        <SignaturePad onChange={setPadBlob} />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ marginTop: 8 }}
                          disabled={!padBlob}
                          onClick={applyPadToActive}
                        >
                          Apply drawing
                        </button>
                      </div>
                    ) : null}
                    {inkMode === "saved" ? (
                      <div style={{ marginTop: 8 }}>
                        {profileSigs.length === 0 ? (
                          <p className="org-meta">No saved signatures yet — use Draw or Type.</p>
                        ) : (
                          <>
                            <div className="field">
                              <label>Profile signature</label>
                              <PortalSelect
                                aria-label="Profile signature"
                                value={selectedProfileId || ""}
                                options={profileSigs.map((s) => ({
                                  value: s.id,
                                  label: s.isDefault ? "Default" : s.id.slice(0, 8),
                                }))}
                                onChange={(v) => setSelectedProfileId(v || null)}
                              />
                            </div>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={applySavedToActive}
                            >
                              Apply saved
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                    {inkMode === "type" ? (
                      <div style={{ marginTop: 8 }}>
                        <div className="field">
                          <label>Text</label>
                          <input
                            value={typeInkText}
                            onChange={(e) => setTypeInkText(e.target.value)}
                            placeholder="Name or initials"
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={applyTypedToActive}
                        >
                          Apply typed
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="org-meta">
                    Client boxes stay empty until each new client signs in the portal.
                  </p>
                )}

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    setFields((prev) => prev.filter((f) => f.id !== active.id));
                    setActiveId(null);
                  }}
                >
                  Remove field
                </button>
              </section>
            ) : null}

            <section className="esign-side-block">
              <p className="org-meta">{fields.length} field(s) on template</p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={save}
              >
                {saving ? "Saving…" : "Save layout"}
              </button>
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}
