"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
  type ReactElement,
} from "react";
import { Ban, CircleCheck, Eye, Pencil, RotateCcw, Send } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { apiFetch } from "../lib/api";
import { getStoredUser, getToken } from "../lib/auth";
import { ListSkeleton } from "./Skeleton";
import { TooltipAnchor } from "./TooltipAnchor";

export type EmailTemplateRow = {
  id: string;
  key: string;
  name: string;
  audience: string;
  groupName: string;
  subject: string;
  body: string;
  active: boolean;
  updatedAt: string;
};

type PanelMode = "list" | "view" | "edit";

type EmailTemplatesPanelProps = {
  active: boolean;
};

export const EmailTemplatesPanel = ({ active }: EmailTemplatesPanelProps): ReactElement => {
  const toast = useToast();
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [tokensHint, setTokensHint] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PanelMode>("list");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await apiFetch<{
      templates: EmailTemplateRow[];
      tokensHint: string[];
    }>("/admin/email-templates", { token: getToken() });
    if (result.success) {
      setTemplates(result.data.templates);
      setTokensHint(result.data.tokensHint || []);
    } else {
      toast.error(result.error.message);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const focused = templates.find((t) => t.key === focusKey) || null;

  function openView(t: EmailTemplateRow) {
    setFocusKey(t.key);
    setMode("view");
  }

  function openEdit(t: EmailTemplateRow) {
    setFocusKey(t.key);
    setEditSubject(t.subject);
    setEditBody(t.body);
    setEditActive(t.active);
    setMode("edit");
  }

  function backToList() {
    setMode("list");
    setFocusKey(null);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!focusKey) return;
    setSaving(true);
    const result = await apiFetch<{ template: EmailTemplateRow }>(
      `/admin/email-templates/${focusKey}`,
      {
        method: "PATCH",
        token: getToken(),
        body: JSON.stringify({
          subject: editSubject,
          body: editBody,
          active: editActive,
        }),
      }
    );
    setSaving(false);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Template saved.");
    await load();
    setMode("view");
  }

  async function onReset() {
    if (!focusKey) return;
    setResetting(true);
    const result = await apiFetch<{ template: EmailTemplateRow }>(
      `/admin/email-templates/${focusKey}/reset`,
      { method: "POST", token: getToken() }
    );
    setResetting(false);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Reset to default copy.");
    setEditSubject(result.data.template.subject);
    setEditBody(result.data.template.body);
    setEditActive(result.data.template.active);
    await load();
  }

  async function onToggleActive(next: boolean) {
    if (!focusKey) return;
    setToggling(true);
    const result = await apiFetch<{ template: EmailTemplateRow }>(
      `/admin/email-templates/${focusKey}`,
      {
        method: "PATCH",
        token: getToken(),
        body: JSON.stringify({ active: next }),
      }
    );
    setToggling(false);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    setEditActive(next);
    toast.success(next ? "Template activated." : "Template deactivated — built-in default will be used.");
    await load();
  }

  async function onSendTest(useDraft: boolean) {
    if (!focusKey) return;
    setTesting(true);
    const me = getStoredUser()?.email;
    const result = await apiFetch<{ to: string; subject: string }>(
      `/admin/email-templates/${focusKey}/test`,
      {
        method: "POST",
        token: getToken(),
        body: JSON.stringify({
          to: me || undefined,
          ...(useDraft && mode === "edit"
            ? { subject: editSubject, body: editBody }
            : {}),
        }),
      }
    );
    setTesting(false);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success(result.message || `Test sent to ${result.data.to}`);
  }

  function insertToken(token: string) {
    const tag = `{{${token}}}`;
    setEditBody((b) => (b.endsWith("\n") || b.length === 0 ? `${b}${tag}` : `${b} ${tag}`));
  }

  return (
    <>
      <div className="settings-panel-head">
        <div>
          <h2>Email templates</h2>
          <p className="lead">
            System templates for every portal email. View, edit, deactivate, or send a test —
            system keys cannot be deleted (deactivate uses built-in default instead).
          </p>
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : mode === "edit" && focused ? (
        <form className="form-compact settings-template-editor" onSubmit={onSave}>
          <div className="settings-template-editor-head">
            <div>
              <h3 className="settings-subhead">Edit · {focused.name}</h3>
              <p className="lead settings-hint">
                {focused.audience} · <code>{focused.key}</code> · {focused.groupName}
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("view")}>
              Cancel
            </button>
          </div>

          <div className="field field-full">
            <label htmlFor="tpl-subject">Subject</label>
            <input
              id="tpl-subject"
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              required
            />
          </div>

          <div className="field field-full">
            <div className="settings-token-row">
              <label htmlFor="tpl-body">Body</label>
              <label className="settings-token-insert">
                <span className="sr-only">Insert token</span>
                <select
                  aria-label="Insert token"
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) insertToken(v);
                    e.target.value = "";
                  }}
                >
                  <option value="">Insert token…</option>
                  {tokensHint.map((t) => (
                    <option key={t} value={t}>
                      {`{{${t}}}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              id="tpl-body"
              rows={14}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              required
            />
          </div>

          <label className="smtp-secure-check">
            <input
              type="checkbox"
              checked={editActive}
              onChange={(e) => setEditActive(e.target.checked)}
            />
            Active (when off, built-in default copy is used)
          </label>

          <div className="smtp-actions">
            <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save template"}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={resetting}
              onClick={onReset}
            >
              {resetting ? "Resetting…" : "Reset to default"}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={testing}
              onClick={() => onSendTest(true)}
            >
              {testing ? "Sending…" : "Send test"}
            </button>
          </div>
        </form>
      ) : mode === "view" && focused ? (
        <div className="settings-template-editor">
          <div className="settings-template-editor-head">
            <div>
              <h3 className="settings-subhead">{focused.name}</h3>
              <p className="lead settings-hint">
                {focused.audience} · <code>{focused.key}</code> · {focused.groupName}
                {!focused.active ? " · inactive" : ""}
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={backToList}>
              Back to list
            </button>
          </div>

          <div className="settings-template-preview">
            <div className="settings-template-preview-label">Subject</div>
            <p className="settings-template-preview-subject">{focused.subject}</p>
            <div className="settings-template-preview-label">Body</div>
            <pre className="settings-template-preview-body">{focused.body}</pre>
          </div>

          <div className="smtp-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => openEdit(focused)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={testing}
              onClick={() => onSendTest(false)}
            >
              {testing ? "Sending…" : "Send test"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={resetting}
              onClick={async () => {
                setFocusKey(focused.key);
                setEditSubject(focused.subject);
                setEditBody(focused.body);
                setEditActive(focused.active);
                await onReset();
              }}
            >
              {resetting ? "Resetting…" : "Reset to default"}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${focused.active ? "btn-secondary" : "btn-primary"}`}
              disabled={toggling}
              onClick={() => onToggleActive(!focused.active)}
            >
              {toggling
                ? "Updating…"
                : focused.active
                  ? "Deactivate"
                  : "Activate"}
            </button>
          </div>
          <p className="lead settings-hint">
            System templates cannot be deleted. Deactivate to fall back to built-in wording.
            Send test uses sample tokens and your login email (SMTP required).
          </p>
        </div>
      ) : (
        <div className="settings-template-grid">
          {templates.map((item) => (
            <article
              key={item.key}
              className={`settings-template-card${!item.active ? " is-inactive" : ""}`}
            >
              <div className="settings-template-card-top">
                <h3>{item.name}</h3>
                <span className="settings-template-group">{item.groupName}</span>
              </div>
              <p className="settings-template-meta">
                {item.audience} · <code>{item.key}</code>
                {!item.active ? " · inactive" : ""}
              </p>
              <p className="settings-template-subject">{item.subject}</p>
              <div className="settings-template-card-actions">
                <TooltipAnchor label="View">
                  <button
                    type="button"
                    className="notify-icon-btn notify-icon-btn-primary"
                    aria-label="View"
                    onClick={() => openView(item)}
                  >
                    <Eye size={15} strokeWidth={2} />
                  </button>
                </TooltipAnchor>
                <TooltipAnchor label="Edit">
                  <button
                    type="button"
                    className="notify-icon-btn"
                    aria-label="Edit"
                    onClick={() => openEdit(item)}
                  >
                    <Pencil size={15} strokeWidth={2} />
                  </button>
                </TooltipAnchor>
                <TooltipAnchor label={item.active ? "Deactivate" : "Activate"}>
                  <button
                    type="button"
                    className="notify-icon-btn"
                    aria-label={item.active ? "Deactivate" : "Activate"}
                    onClick={async () => {
                      setFocusKey(item.key);
                      setToggling(true);
                      const result = await apiFetch<{ template: EmailTemplateRow }>(
                        `/admin/email-templates/${item.key}`,
                        {
                          method: "PATCH",
                          token: getToken(),
                          body: JSON.stringify({ active: !item.active }),
                        }
                      );
                      setToggling(false);
                      if (!result.success) {
                        toast.error(result.error.message);
                        return;
                      }
                      toast.success(
                        item.active ? "Template deactivated." : "Template activated."
                      );
                      await load();
                    }}
                  >
                    {item.active ? (
                      <Ban size={15} strokeWidth={2} />
                    ) : (
                      <CircleCheck size={15} strokeWidth={2} />
                    )}
                  </button>
                </TooltipAnchor>
                <TooltipAnchor label="Reset to default">
                  <button
                    type="button"
                    className="notify-icon-btn"
                    aria-label="Reset to default"
                    onClick={async () => {
                      const result = await apiFetch<{ template: EmailTemplateRow }>(
                        `/admin/email-templates/${item.key}/reset`,
                        { method: "POST", token: getToken() }
                      );
                      if (!result.success) {
                        toast.error(result.error.message);
                        return;
                      }
                      toast.success("Reset to default copy.");
                      await load();
                    }}
                  >
                    <RotateCcw size={15} strokeWidth={2} />
                  </button>
                </TooltipAnchor>
                <TooltipAnchor label="Send test">
                  <button
                    type="button"
                    className="notify-icon-btn"
                    aria-label="Send test"
                    onClick={async () => {
                      setFocusKey(item.key);
                      setTesting(true);
                      const me = getStoredUser()?.email;
                      const result = await apiFetch(
                        `/admin/email-templates/${item.key}/test`,
                        {
                          method: "POST",
                          token: getToken(),
                          body: JSON.stringify({ to: me || undefined }),
                        }
                      );
                      setTesting(false);
                      if (!result.success) {
                        toast.error(result.error.message);
                        return;
                      }
                      toast.success(result.message || "Test email sent.");
                    }}
                  >
                    <Send size={15} strokeWidth={2} />
                  </button>
                </TooltipAnchor>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
};
