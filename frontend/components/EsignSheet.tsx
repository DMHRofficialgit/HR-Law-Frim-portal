"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, apiDownload, apiFetch, apiUpload } from "../lib/api";
import { getStoredUser, getToken } from "../lib/auth";
import { renderTypedSignaturePng } from "../lib/render-typed-signature";
import {
  canAdminEditFields,
  canFillFields,
  colorForAssignee,
  defaultLabelForType,
  esignStageLabel,
  fieldIsComplete,
  isInkFieldType,
  isTextFieldType,
  signatureProgress,
  SIGNATURE_FIELD_TYPES,
  type SignatureRequestRow,
} from "../lib/signatures";
import { EsignPdfViewer, type LocalField } from "./EsignPdfViewer";
import { PortalMultiSelect } from "./PortalMultiSelect";
import { PortalSelect } from "./PortalSelect";
import { SignaturePad } from "./SignaturePad";

type EsignSheetProps = {
  role: "admin" | "client";
  requestId: string;
  onClose: () => void;
  onChanged?: () => void;
};

type InkMode = "draw" | "saved" | "type";

type AssigneeOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

function newLocalField(
  page = 1,
  type: string = "signature",
  assigneeUserId: string | null = null
): LocalField {
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
    assigneeUserId,
  };
}

function mapFieldsFromRequest(request: SignatureRequestRow): LocalField[] {
  return request.fields.map((f) => ({
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
    assigneeUserId: f.assigneeUserId || null,
    valueText: f.valueText || null,
  }));
}

function fieldsPayload(fields: LocalField[]) {
  return fields.map((f, i) => ({
    type: f.type,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    label: f.label,
    required: f.required,
    sortOrder: i,
    assigneeUserId: f.assigneeUserId || null,
  }));
}

export function EsignSheet({ role, requestId, onClose, onChanged }: EsignSheetProps) {
  const me = getStoredUser();
  const myId = me?.id || "";

  const [request, setRequest] = useState<SignatureRequestRow | null>(null);
  const [fields, setFields] = useState<LocalField[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [ccUserIds, setCcUserIds] = useState<string[]>([]);
  const [activeRecipientId, setActiveRecipientId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [placePage, setPlacePage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [typedName, setTypedName] = useState(me?.name || "");
  const [inkMode, setInkMode] = useState<InkMode>("draw");
  const [typeInkText, setTypeInkText] = useState("");
  const [hasSaved, setHasSaved] = useState(false);
  const [savedSignatures, setSavedSignatures] = useState<
    { id: string; isDefault: boolean }[]
  >([]);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(null);
  const [padBlob, setPadBlob] = useState<Blob | null>(null);
  const [fieldBlobs, setFieldBlobs] = useState<Record<string, Blob>>({});
  const [fieldTexts, setFieldTexts] = useState<Record<string, string>>({});
  const [fieldPreviews, setFieldPreviews] = useState<Record<string, string>>({});
  const [revisionNote, setRevisionNote] = useState("");

  const token = getToken();
  const showSignedPdf =
    request?.status === "signed_returned" || request?.status === "reviewed";
  const fileUrl = useMemo(() => {
    const base = role === "admin" ? "/admin" : "/client";
    const q = showSignedPdf ? "?signed=1" : "";
    return `${API_URL}${base}/signature-requests/${requestId}/file${q}`;
  }, [role, requestId, showSignedPdf]);

  const revokePreviews = useCallback((map: Record<string, string>) => {
    Object.values(map).forEach((url) => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
  }, []);

  const setFieldInk = useCallback((fieldId: string, blob: Blob) => {
    setFieldBlobs((prev) => ({ ...prev, [fieldId]: blob }));
    setFieldPreviews((prev) => {
      const next = { ...prev };
      if (next[fieldId]?.startsWith("blob:")) URL.revokeObjectURL(next[fieldId]);
      next[fieldId] = URL.createObjectURL(blob);
      return next;
    });
  }, []);

  const clearAllInk = useCallback(() => {
    setFieldBlobs({});
    setFieldTexts({});
    setFieldPreviews((prev) => {
      revokePreviews(prev);
      return {};
    });
    setPadBlob(null);
  }, [revokePreviews]);

  const clearActiveBox = useCallback(() => {
    if (!activeFieldId) return;
    setFieldBlobs((prev) => {
      const next = { ...prev };
      delete next[activeFieldId];
      return next;
    });
    setFieldTexts((prev) => {
      const next = { ...prev };
      delete next[activeFieldId];
      return next;
    });
    setFieldPreviews((prev) => {
      const next = { ...prev };
      if (next[activeFieldId]?.startsWith("blob:")) URL.revokeObjectURL(next[activeFieldId]);
      delete next[activeFieldId];
      return next;
    });
  }, [activeFieldId]);

  const loadSignedFieldPreviews = useCallback(
    async (
      reqId: string,
      fieldList: { id: string; signedImagePath: string | null; valueText?: string | null }[]
    ) => {
      const base = role === "admin" ? "/admin" : "/client";
      const auth = getToken();
      const next: Record<string, string> = {};
      const texts: Record<string, string> = {};
      await Promise.all(
        fieldList.map(async (f) => {
          if (f.valueText) texts[f.id] = f.valueText;
          if (!f.signedImagePath) return;
          try {
            const res = await fetch(
              `${API_URL}${base}/signature-requests/${reqId}/fields/${f.id}/image`,
              { headers: auth ? { Authorization: `Bearer ${auth}` } : {} }
            );
            if (!res.ok) return;
            const blob = await res.blob();
            next[f.id] = URL.createObjectURL(blob);
          } catch {
            /* skip */
          }
        })
      );
      setFieldTexts((prev) => ({ ...texts, ...prev }));
      setFieldPreviews((prev) => {
        revokePreviews(prev);
        return next;
      });
    },
    [role, revokePreviews]
  );

  const loadProfileSignatures = useCallback(async () => {
    const sig = await apiFetch<{
      hasSignature: boolean;
      signatures?: { id: string; isDefault: boolean }[];
    }>("/me/signature", { token: getToken() });
    if (sig.success) {
      const list = sig.data.signatures || [];
      setSavedSignatures(list);
      setHasSaved(sig.data.hasSignature || list.length > 0);
      const def = list.find((s) => s.isDefault) || list[0];
      setSelectedSignatureId((prev) => prev || def?.id || null);
    }
  }, []);

  const load = useCallback(async () => {
    setError("");
    const base = role === "admin" ? "/admin" : "/client";
    const result = await apiFetch<{ request: SignatureRequestRow }>(
      `${base}/signature-requests/${requestId}`,
      { token: getToken() }
    );
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    const req = result.data.request;
    setRequest(req);
    const mapped = mapFieldsFromRequest(req);
    setFields(mapped);
    setCcUserIds((req.ccRecipients || []).map((c) => c.userId));

    if (role === "admin") {
      const a = await apiFetch<{ users: AssigneeOption[] }>(
        `/admin/signature-requests/${requestId}/assignees`,
        { token: getToken() }
      );
      if (a.success) {
        setAssignees(a.data.users);
        setActiveRecipientId((prev) => {
          if (prev && a.data.users.some((u) => u.id === prev)) return prev;
          const fromField = mapped.find((f) => f.assigneeUserId)?.assigneeUserId;
          return (
            fromField ||
            a.data.users.find((u) => u.role === "client")?.id ||
            a.data.users[0]?.id ||
            null
          );
        });
      }
    }

    if (req.status === "signed_returned" || req.status === "reviewed" || canFillFields(req.status)) {
      await loadSignedFieldPreviews(requestId, req.fields);
    }

    if (canFillFields(req.status)) {
      const mine = mapped.filter((f) => f.assigneeUserId === myId);
      setActiveFieldId((prev) => {
        if (prev && mine.some((f) => f.id === prev)) return prev;
        return mine[0]?.id || null;
      });
      await loadProfileSignatures();
    }
  }, [role, requestId, loadSignedFieldPreviews, loadProfileSignatures, myId]);

  useEffect(() => {
    load();
    return () => {
      setFieldPreviews((prev) => {
        revokePreviews(prev);
        return {};
      });
    };
  }, [load, revokePreviews]);

  const adminEdit = Boolean(role === "admin" && request && canAdminEditFields(request.status));
  const fillMode = Boolean(request && canFillFields(request.status));
  const isReadyForSend = request?.status === "ready_for_send";
  const myFields = useMemo(
    () => fields.filter((f) => f.assigneeUserId === myId),
    [fields, myId]
  );
  const myPendingFields = useMemo(
    () =>
      myFields.filter((f) => {
        const server = request?.fields.find((x) => x.id === f.id);
        return !server || !fieldIsComplete(server);
      }),
    [myFields, request]
  );
  const canFillMine = fillMode && myPendingFields.length > 0;
  const interactiveIds = useMemo(
    () => (canFillMine ? myPendingFields.map((f) => f.id) : []),
    [canFillMine, myPendingFields]
  );

  const activeField = fields.find((f) => f.id === activeFieldId) || null;
  const activeIsInk = activeField ? isInkFieldType(activeField.type) : true;
  const activeIsText = activeField ? isTextFieldType(activeField.type) : false;

  const fieldColors = useMemo(() => {
    const map: Record<string, { border: string; fill: string; text: string }> = {};
    for (const f of fields) {
      map[f.id] = colorForAssignee(f.assigneeUserId);
    }
    return map;
  }, [fields]);

  const recipientIdsOnDoc = useMemo(() => {
    const ids = new Set<string>();
    for (const f of fields) {
      if (f.assigneeUserId) ids.add(f.assigneeUserId);
    }
    return ids;
  }, [fields]);

  useEffect(() => {
    if (!canFillMine || inkMode !== "draw" || !padBlob || !activeFieldId || !activeIsInk) return;
    setFieldInk(activeFieldId, padBlob);
    setNotice("Drawing applied to the selected box.");
  }, [padBlob, activeFieldId, canFillMine, inkMode, setFieldInk, activeIsInk]);

  const myRequired = useMemo(
    () => myPendingFields.filter((f) => f.required !== false),
    [myPendingFields]
  );

  const allMyRequiredFilled = useMemo(() => {
    if (myRequired.length === 0) return myPendingFields.length === 0;
    return myRequired.every((f) => {
      if (isInkFieldType(f.type)) return Boolean(fieldBlobs[f.id]);
      return Boolean((fieldTexts[f.id] || "").trim() || fieldBlobs[f.id]);
    });
  }, [myRequired, myPendingFields.length, fieldBlobs, fieldTexts]);

  const submitBlockReason = useMemo(() => {
    if (!canFillMine) return "No fields assigned to you (or already completed).";
    if (typedName.trim().length < 2) return "Enter your full name to submit.";
    if (!allMyRequiredFilled) return "Fill all of your required fields before submitting.";
    return "";
  }, [canFillMine, typedName, allMyRequiredFilled]);

  const progress = useMemo(() => signatureProgress(request?.fields || []), [request]);

  function addFieldOfType(type: string) {
    if (!activeRecipientId) {
      setError("Pick a recipient first, then add a field.");
      return;
    }
    const field = newLocalField(placePage, type, activeRecipientId);
    setFields((prev) => [...prev, field]);
    setActiveFieldId(field.id);
    setNotice(`${defaultLabelForType(type)} placed for selected recipient · page ${placePage}.`);
    setError("");
  }

  async function persistFields() {
    const result = await apiFetch<{ request: SignatureRequestRow }>(
      `/admin/signature-requests/${requestId}/fields`,
      {
        method: "PUT",
        token: getToken(),
        body: JSON.stringify({ fields: fieldsPayload(fields) }),
      }
    );
    if (!result.success) return result;
    const ccResult = await apiFetch<{ request: SignatureRequestRow }>(
      `/admin/signature-requests/${requestId}/cc`,
      {
        method: "PUT",
        token: getToken(),
        body: JSON.stringify({ userIds: ccUserIds }),
      }
    );
    return ccResult.success ? ccResult : result;
  }

  async function saveFields() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await persistFields();
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setRequest(result.data.request);
      setFields(mapFieldsFromRequest(result.data.request));
      setCcUserIds((result.data.request.ccRecipients || []).map((c) => c.userId));
      setNotice("Fields saved.");
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function markReady() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saveResult = await persistFields();
      if (!saveResult.success) {
        setError(saveResult.error.message);
        return;
      }
      const result = await apiFetch<{ request: SignatureRequestRow }>(
        `/admin/signature-requests/${requestId}/ready`,
        { method: "POST", token: getToken() }
      );
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setRequest(result.data.request);
      setFields(mapFieldsFromRequest(result.data.request));
      setNotice(
        "Marked ready. If you’re an assignee, Finish my part now — then Send for everyone else."
      );
      onChanged?.();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function reopenEdit() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{ request: SignatureRequestRow }>(
        `/admin/signature-requests/${requestId}/reopen`,
        { method: "POST", token: getToken() }
      );
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      clearAllInk();
      setRequest(result.data.request);
      setFields(mapFieldsFromRequest(result.data.request));
      setNotice("Back to draft — you can move fields again.");
      onChanged?.();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ request: SignatureRequestRow }>(
        `/admin/signature-requests/${requestId}/send`,
        { method: "POST", token: getToken() }
      );
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setRequest(result.data.request);
      setNotice("Sent. Assignees can now Finish my part (including you, if assigned).");
      onChanged?.();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function review() {
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{
        request: SignatureRequestRow;
        published?: { documentId: string; title: string; folderId: string } | null;
      }>(`/admin/signature-requests/${requestId}/review`, {
        method: "POST",
        token: getToken(),
      });
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setRequest(result.data.request);
      const publishedTitle = result.data.published?.title;
      setNotice(
        publishedTitle
          ? `Marked complete — published as “${publishedTitle}”.`
          : "Marked complete — signed PDF in Documents."
      );
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function revision() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{ request: SignatureRequestRow }>(
        `/admin/signature-requests/${requestId}/revision`,
        {
          method: "POST",
          token: getToken(),
          body: JSON.stringify({ note: revisionNote }),
        }
      );
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      clearAllInk();
      setRequest(result.data.request);
      setFields(mapFieldsFromRequest(result.data.request));
      setNotice("Revision requested — assignees can sign again.");
      onChanged?.();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function applySavedToBox(signatureId: string, allMyBoxes = false) {
    if (!signatureId) {
      setError("Choose a saved signature first.");
      return;
    }
    if (!allMyBoxes && !activeFieldId) {
      setError("Select one of your boxes on the PDF first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/me/signature/${signatureId}/image`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        setError("Could not load saved signature.");
        return;
      }
      const blob = await res.blob();
      if (allMyBoxes) {
        for (const f of myPendingFields.filter((x) => isInkFieldType(x.type))) {
          setFieldInk(f.id, blob);
        }
        setNotice("Saved signature applied to your ink boxes.");
      } else if (activeFieldId) {
        setFieldInk(activeFieldId, blob);
        setNotice("Saved signature applied to the selected box.");
      }
      setSelectedSignatureId(signatureId);
    } finally {
      setBusy(false);
    }
  }

  async function applyTypedToActiveBox() {
    const text = (typeInkText || typedName).trim();
    if (text.length < 1) {
      setError("Enter text for the typed signature.");
      return;
    }
    if (!activeFieldId || !activeIsInk) {
      setError("Select one of your signature/initials boxes first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const blob = await renderTypedSignaturePng(text);
      setFieldInk(activeFieldId, blob);
      setNotice("Typed signature applied.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not render typed signature");
    } finally {
      setBusy(false);
    }
  }

  async function savePadToProfileOptional() {
    if (!padBlob) {
      setError("Draw a signature first to save it.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", padBlob, "signature.png");
      const result = await apiUpload<{
        hasSignature: boolean;
        signatures?: { id: string; isDefault: boolean }[];
      }>("/me/signature", fd, getToken());
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      const list = result.data.signatures || [];
      setSavedSignatures(list);
      setHasSaved(true);
      const def = list.find((s) => s.isDefault) || list[list.length - 1];
      if (def) setSelectedSignatureId(def.id);
      setNotice("Saved to your profile.");
    } finally {
      setBusy(false);
    }
  }

  function switchInkMode(mode: InkMode) {
    setInkMode(mode);
    setError("");
    setNotice("");
    if (mode === "type" && !typeInkText.trim() && typedName.trim()) {
      setTypeInkText(typedName.trim());
    }
  }

  async function onSubmitMyPart(e: FormEvent) {
    e.preventDefault();
    if (!request) return;
    if (submitBlockReason) {
      setError(submitBlockReason);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("typedName", typedName);
      fd.append("agreed", "true");

      const texts: Record<string, string> = {};
      for (const f of myPendingFields) {
        if (isInkFieldType(f.type)) {
          const blob = fieldBlobs[f.id];
          if (blob) fd.append(`field_${f.id}`, blob, "signature.png");
        } else {
          const t = (fieldTexts[f.id] || "").trim();
          if (t) {
            texts[f.id] = t;
            fd.append(`text_${f.id}`, t);
          }
          const blob = fieldBlobs[f.id];
          if (blob) fd.append(`field_${f.id}`, blob, "field.png");
        }
      }
      if (Object.keys(texts).length) {
        fd.append("fieldTexts", JSON.stringify(texts));
      }

      const path =
        role === "admin"
          ? `/admin/signature-requests/${requestId}/sign`
          : `/client/signature-requests/${requestId}/sign`;

      const result = await apiUpload<{ request: SignatureRequestRow }>(path, fd, getToken());
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setRequest(result.data.request);
      setFields(mapFieldsFromRequest(result.data.request));
      await loadSignedFieldPreviews(requestId, result.data.request.fields);
      const done = result.data.request.status === "signed_returned";
      setNotice(
        done
          ? "Document fully signed."
          : "Your part submitted — waiting on other assignees."
      );
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function download(kind: string) {
    const base = role === "admin" ? "/admin" : "/client";
    try {
      const { blob, fileName } = await apiDownload(
        `${base}/signature-requests/${requestId}/download/${kind}`,
        getToken()
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  if (!request) {
    return (
      <div className="esign-sheet-backdrop" onClick={onClose}>
        <aside className="esign-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="esign-sheet-head">
            <h2>E-sign</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
          <p className="lead">Loading…</p>
        </aside>
      </div>
    );
  }

  const viewerMode = adminEdit ? "place" : canFillMine ? "sign" : "view";
  const stageHint = (() => {
    if (adminEdit) {
      return "Place fields for each recipient. Mark Ready when layout is final — then you can Finish my part if assigned.";
    }
    if (isReadyForSend && canFillMine) {
      return "You’re an assignee — Finish my part now. Send when others (e.g. clients) should be notified.";
    }
    if (isReadyForSend) {
      return "Fields locked. Send to notify remaining assignees, or Edit fields again to change the layout.";
    }
    if (canFillMine) return "You’re a signer — fill your boxes, then Finish my part.";
    if (fillMode && myFields.length === 0) {
      return "You’re not an assignee on this request.";
    }
    if (fillMode) return `Waiting on: ${progress.waitingNames.join(", ") || "others"}.`;
    if (request.status === "signed_returned") return "All signed — review or request revision.";
    if (request.status === "reviewed") return "Complete — signed copy is in Documents.";
    return "";
  })();

  return (
    <div className="esign-sheet-backdrop" onClick={onClose}>
      <aside className="esign-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="esign-sheet-head">
          <div>
            <div className="esign-stage-row">
              <span className={`esign-stage-chip status-${request.status}`}>
                {esignStageLabel(request.status)}
              </span>
              {progress.total > 0 ? (
                <span className="esign-stage-meta">
                  {progress.done}/{progress.total}
                  {progress.waitingNames.length && fillMode
                    ? ` · waiting on ${progress.waitingNames.join(", ")}`
                    : ""}
                </span>
              ) : null}
            </div>
            <h2>{request.title}</h2>
            <p className="lead esign-stage-hint">{stageHint}</p>
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
              <span className="esign-page-chip">Page {placePage}/{pdfPageCount}</span>
            </div>
            <EsignPdfViewer
              pdfUrl={fileUrl}
              authToken={token}
              fields={showSignedPdf ? [] : fields}
              mode={viewerMode}
              activeFieldId={activeFieldId}
              fieldPreviews={showSignedPdf ? {} : fieldPreviews}
              interactiveFieldIds={canFillMine ? interactiveIds : null}
              fieldColors={showSignedPdf ? {} : fieldColors}
              onFieldsChange={adminEdit ? setFields : undefined}
              onFieldActivate={(id) => {
                setActiveFieldId(id);
                const f = fields.find((x) => x.id === id);
                if (f) {
                  setPlacePage(f.page);
                  if (adminEdit && f.assigneeUserId) {
                    setActiveRecipientId(f.assigneeUserId);
                  }
                }
              }}
              onPlacePageChange={adminEdit ? setPlacePage : undefined}
              onPageCount={setPdfPageCount}
              zoom={zoom}
            />
          </div>

          <div className="esign-sheet-side">
            {adminEdit ? (
              <>
                <section className="esign-rail-block">
                  <h3>Recipients</h3>
                  <p className="org-meta">
                    Select who you’re placing for, then add a field type below.
                  </p>
                  <ul className="esign-recipient-list">
                    {assignees.map((u) => {
                      const tint = colorForAssignee(u.id);
                      const onDoc = recipientIdsOnDoc.has(u.id);
                      const count = fields.filter((f) => f.assigneeUserId === u.id).length;
                      return (
                        <li key={u.id}>
                          <button
                            type="button"
                            className={`esign-recipient${
                              activeRecipientId === u.id ? " active" : ""
                            }`}
                            style={{
                              borderColor:
                                activeRecipientId === u.id ? tint.border : undefined,
                              background:
                                activeRecipientId === u.id ? tint.fill : undefined,
                            }}
                            onClick={() => setActiveRecipientId(u.id)}
                          >
                            <span
                              className="esign-recipient-dot"
                              style={{ background: tint.border }}
                              aria-hidden
                            />
                            <span className="esign-recipient-copy">
                              <strong>{u.name}</strong>
                              <span>
                                {u.role} · {u.email}
                                {onDoc ? ` · ${count} field${count === 1 ? "" : "s"}` : ""}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section className="esign-rail-block">
                  <h3>Add field</h3>
                  <div className="esign-palette" role="group" aria-label="Field types">
                    {SIGNATURE_FIELD_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="esign-palette-btn"
                        disabled={!activeRecipientId}
                        onClick={() => addFieldOfType(t)}
                      >
                        {defaultLabelForType(t)}
                      </button>
                    ))}
                  </div>
                  <p className="org-meta">Adds to page {placePage} for the selected recipient.</p>
                </section>

                <section className="esign-rail-block">
                  <h3>Selected field</h3>
                  {activeField ? (
                    <div className="esign-inspector">
                      <p className="esign-inspector-title">
                        {activeField.label} · p{activeField.page}
                      </p>
                      <label className="field">
                        <span>Type</span>
                        <PortalSelect
                          aria-label="Field type"
                          value={activeField.type}
                          options={SIGNATURE_FIELD_TYPES.map((t) => ({
                            value: t,
                            label: t,
                          }))}
                          onChange={(type) => {
                            setFields((prev) =>
                              prev.map((row) =>
                                row.id === activeField.id
                                  ? {
                                      ...row,
                                      type,
                                      label:
                                        row.label === defaultLabelForType(row.type)
                                          ? defaultLabelForType(type)
                                          : row.label,
                                    }
                                  : row
                              )
                            );
                          }}
                        />
                      </label>
                      <label className="field">
                        <span>Assign to (email)</span>
                        <PortalSelect
                          aria-label="Assign to"
                          value={activeField.assigneeUserId || ""}
                          searchable
                          placeholder="Assign to…"
                          options={[
                            { value: "", label: "Assign to…" },
                            ...assignees.map((u) => ({
                              value: u.id,
                              label: `${u.name} (${u.role}) — ${u.email}`,
                            })),
                          ]}
                          onChange={(next) => {
                            const assigneeUserId = next || null;
                            setFields((prev) =>
                              prev.map((row) =>
                                row.id === activeField.id ? { ...row, assigneeUserId } : row
                              )
                            );
                            if (assigneeUserId) setActiveRecipientId(assigneeUserId);
                          }}
                        />
                      </label>
                      <label className="field">
                        <span>Page</span>
                        <PortalSelect
                          aria-label="Page"
                          value={String(Math.min(activeField.page, pdfPageCount))}
                          options={Array.from({ length: pdfPageCount }, (_, i) => ({
                            value: String(i + 1),
                            label: String(i + 1),
                          }))}
                          onChange={(v) => {
                            const page = Math.min(
                              pdfPageCount,
                              Math.max(1, Number(v) || 1)
                            );
                            setFields((prev) =>
                              prev.map((row) =>
                                row.id === activeField.id ? { ...row, page } : row
                              )
                            );
                            setPlacePage(page);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm danger"
                        onClick={() => {
                          setFields((prev) => prev.filter((f) => f.id !== activeField.id));
                          setActiveFieldId(null);
                        }}
                      >
                        Remove field
                      </button>
                    </div>
                  ) : (
                    <p className="org-meta">Click a box on the PDF to edit it.</p>
                  )}
                </section>

                <section className="esign-rail-block">
                  <label className="esign-cc-label" htmlFor="esign-cc-multi">
                    CC (notify only)
                  </label>
                  <PortalMultiSelect
                    id="esign-cc-multi"
                    className="esign-cc-multi"
                    aria-label="CC recipients"
                    placeholder="Add CC recipients…"
                    value={ccUserIds}
                    options={assignees.map((u) => ({
                      value: u.id,
                      label: `${u.name} (${u.role}) — ${u.email}`,
                    }))}
                    onChange={setCcUserIds}
                  />
                  <p className="org-meta">CC is notified only and cannot fill boxes.</p>
                </section>

                <div className="esign-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={saveFields}
                  >
                    Save fields
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={markReady}
                  >
                    Mark Ready
                  </button>
                  {request.status === "ready_for_send" ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={send}
                    >
                      Send to assignees
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}

            {role === "admin" && isReadyForSend ? (
              <section className="esign-rail-block">
                <h3>Next steps</h3>
                <p className="org-meta">
                  {canFillMine
                    ? "Finish your boxes below, then Send for other assignees."
                    : myFields.length
                      ? "Your part is done. Send so remaining assignees are notified."
                      : "Send to notify assignees (clients see it only after Send)."}
                </p>
                <div className="esign-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={send}
                  >
                    Send to assignees
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={reopenEdit}
                  >
                    Edit fields again
                  </button>
                </div>
              </section>
            ) : null}

            {role === "admin" && request.status === "signed_returned" ? (
              <section className="esign-rail-block">
                <h3>Review</h3>
                <p className="org-meta">
                  Completed by {request.typedName || "assignees"}
                  {request.signedAt ? ` · ${new Date(request.signedAt).toLocaleString()}` : ""}
                </p>
                <div className="field">
                  <label>Revision note (optional)</label>
                  <input value={revisionNote} onChange={(e) => setRevisionNote(e.target.value)} />
                </div>
                <div className="esign-actions">
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={review}>
                    Mark complete
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={revision}
                  >
                    Request revision
                  </button>
                </div>
              </section>
            ) : null}

            {role === "admin" && request.status === "reviewed" ? (
              <p className="lead">Complete — signed copy is in Documents.</p>
            ) : null}

            {role === "admin" && fillMode && !canFillMine && !adminEdit ? (
              <section className="esign-rail-block">
                <h3>Progress</h3>
                <p className="lead">
                  Waiting on: {progress.waitingNames.join(", ") || "assignees"}.
                  {myFields.length === 0
                    ? " You are not an assignee."
                    : " Your fields are done."}
                </p>
              </section>
            ) : null}

            {canFillMine ? (
              <form onSubmit={onSubmitMyPart} className="esign-fill-form">
                <h3>Your fields</h3>
                <p className="org-meta">
                  {myPendingFields.length} to fill · others’ boxes are locked.
                </p>

                <div className="field">
                  <label>Your full name (for the record)</label>
                  <input
                    value={typedName}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTypedName(v);
                      if (inkMode === "type" && !typeInkText) setTypeInkText(v);
                    }}
                    required
                    autoComplete="name"
                  />
                </div>

                {activeIsText && activeFieldId ? (
                  <div className="field">
                    <label>
                      {activeField?.type === "date"
                        ? "Date"
                        : activeField?.type === "name"
                          ? "Name"
                          : "Text"}
                    </label>
                    <input
                      value={fieldTexts[activeFieldId] || ""}
                      onChange={(e) =>
                        setFieldTexts((prev) => ({
                          ...prev,
                          [activeFieldId]: e.target.value,
                        }))
                      }
                      placeholder={
                        activeField?.type === "date"
                          ? "Blank = today’s date on submit"
                          : activeField?.type === "name"
                            ? typedName || "Full name"
                            : "Enter text"
                      }
                    />
                  </div>
                ) : null}

                {activeIsInk ? (
                  <>
                    <div className="ink-mode-toggle" role="group" aria-label="Signature style">
                      <button
                        type="button"
                        className={`ink-mode-btn${inkMode === "draw" ? " active" : ""}`}
                        onClick={() => switchInkMode("draw")}
                      >
                        Draw
                      </button>
                      <button
                        type="button"
                        className={`ink-mode-btn${inkMode === "saved" ? " active" : ""}`}
                        onClick={() => switchInkMode("saved")}
                        disabled={!hasSaved}
                      >
                        Saved
                      </button>
                      <button
                        type="button"
                        className={`ink-mode-btn${inkMode === "type" ? " active" : ""}`}
                        onClick={() => switchInkMode("type")}
                      >
                        Type
                      </button>
                    </div>

                    {inkMode === "draw" ? (
                      <div className="field">
                        <label>Draw for selected box</label>
                        <SignaturePad onChange={setPadBlob} />
                        <div className="esign-actions" style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={clearActiveBox}
                            disabled={!activeFieldId || !fieldBlobs[activeFieldId || ""]}
                          >
                            Clear box
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={savePadToProfileOptional}
                            disabled={busy || !padBlob}
                          >
                            Save to profile
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {inkMode === "saved" ? (
                      <div className="field">
                        <label>Saved signature</label>
                        {hasSaved ? (
                          <>
                            <PortalSelect
                              aria-label="Saved signature"
                              value={selectedSignatureId || ""}
                              options={savedSignatures.map((s, i) => ({
                                value: s.id,
                                label: `Signature ${i + 1}${s.isDefault ? " (default)" : ""}`,
                              }))}
                              onChange={(next) => {
                                const id = next || null;
                                setSelectedSignatureId(id);
                                if (id) applySavedToBox(id, false);
                              }}
                            />
                            <div className="esign-actions" style={{ marginTop: 8 }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={busy || !selectedSignatureId}
                                onClick={() =>
                                  selectedSignatureId &&
                                  applySavedToBox(selectedSignatureId, false)
                                }
                              >
                                Apply to selected
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy || !selectedSignatureId}
                                onClick={() =>
                                  selectedSignatureId &&
                                  applySavedToBox(selectedSignatureId, true)
                                }
                              >
                                Apply to my ink boxes
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="org-meta">No saved signatures yet.</p>
                        )}
                      </div>
                    ) : null}

                    {inkMode === "type" ? (
                      <div className="field">
                        <label>Typed ink</label>
                        <input
                          value={typeInkText}
                          onChange={(e) => setTypeInkText(e.target.value)}
                          placeholder={typedName || "e.g. J. Smith"}
                        />
                        <div className="esign-actions" style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={busy}
                            onClick={applyTypedToActiveBox}
                          >
                            Apply typed to box
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {submitBlockReason ? (
                  <p className="org-meta" style={{ color: "var(--danger, #a11)" }}>
                    {submitBlockReason}
                  </p>
                ) : null}

                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={busy || Boolean(submitBlockReason)}
                >
                  {busy ? "Submitting…" : "Finish my part"}
                </button>
              </form>
            ) : null}

            <div className="esign-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => download("source")}
              >
                Download source
              </button>
              {request.status === "signed_returned" || request.status === "reviewed" ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => download("signed")}
                >
                  Download signed copy
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => download("audit")}
              >
                Audit
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
