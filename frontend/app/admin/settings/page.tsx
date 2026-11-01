"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";

type UploadSettings = {
  id: string;
  allowedExtensions: string[];
  allowedMimeTypes: string[];
  maxUploadBytes: number;
};

type Category = {
  id: string;
  name: string;
  isSystem: boolean;
  active: boolean;
};

export default function AdminSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [extensions, setExtensions] = useState("pdf, doc, docx");
  const [mimes, setMimes] = useState("");
  const [maxMb, setMaxMb] = useState("25");
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("DM.HR Group");
  const [smtpHasPassword, setSmtpHasPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);

  async function loadCategories(token: string | null) {
    const result = await apiFetch<{ categories: Category[] }>("/admin/case-categories", {
      token,
    });
    if (result.success) setCategories(result.data.categories);
  }

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored) {
      router.replace("/login");
      return;
    }
    if (stored.role !== "admin") {
      router.replace(homeForUser(stored));
      return;
    }
    setUser(stored);

    async function load() {
      const result = await apiFetch<{ settings: UploadSettings }>("/admin/upload-settings", {
        token,
      });
      if (result.success) {
        setExtensions(result.data.settings.allowedExtensions.join(", "));
        setMimes(result.data.settings.allowedMimeTypes.join(", "));
        setMaxMb(String(Math.round(result.data.settings.maxUploadBytes / (1024 * 1024))));
      }
      await loadCategories(token);
      const smtp = await apiFetch<{
        settings: {
          host: string | null;
          port: number | null;
          secure: boolean;
          username: string | null;
          fromAddress: string | null;
          fromDisplayName: string | null;
          hasPassword: boolean;
        };
      }>("/admin/smtp-settings", { token });
      if (smtp.success) {
        const s = smtp.data.settings;
        setSmtpHost(s.host || "");
        setSmtpPort(String(s.port ?? 587));
        setSmtpSecure(s.secure);
        setSmtpUser(s.username || "");
        setSmtpFrom(s.fromAddress || "");
        setSmtpFromName(s.fromDisplayName || "DM.HR Group");
        setSmtpHasPassword(s.hasPassword);
      }
    }
    load();
  }, [router]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{ settings: UploadSettings }>("/admin/upload-settings", {
        method: "PATCH",
        token: getToken(),
        body: JSON.stringify({
          allowedExtensions: extensions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          allowedMimeTypes: mimes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          maxUploadBytes: Number(maxMb) * 1024 * 1024,
        }),
      });
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setNotice("Upload settings saved.");
    } catch {
      setError("Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    const result = await apiFetch<{ category: Category }>("/admin/case-categories", {
      method: "POST",
      token: getToken(),
      body: JSON.stringify({ name: newCategory }),
    });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setNewCategory("");
    setNotice("Category added.");
    await loadCategories(getToken());
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Settings">
      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>File uploads</h2>
        <p className="lead">Configure allowed types and max size. Word and PDF must remain available.</p>
        <form onSubmit={onSave}>
          <div className="field">
            <label htmlFor="ext">Allowed extensions</label>
            <input id="ext" value={extensions} onChange={(e) => setExtensions(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="mime">Allowed MIME types</label>
            <textarea
              id="mime"
              rows={3}
              value={mimes}
              onChange={(e) => setMimes(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="max">Max upload size (MB)</label>
            <input
              id="max"
              type="number"
              min={1}
              max={100}
              value={maxMb}
              onChange={(e) => setMaxMb(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save upload settings"}
          </button>
        </form>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Case categories</h2>
        <p className="lead">System defaults plus custom categories you add.</p>
        <ul className="org-list">
          {categories.map((c) => (
            <li key={c.id}>
              <div>
                <div className="org-name">{c.name}</div>
                <div className="org-meta">{c.isSystem ? "System" : "Custom"}</div>
              </div>
            </li>
          ))}
        </ul>
        <form onSubmit={addCategory} style={{ marginTop: 16 }}>
          <div className="field">
            <label>New category</label>
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-secondary" type="submit">
            Add category
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Email (SMTP)</h2>
        <p className="lead">
          Provider-agnostic SMTP. Suggested defaults: Outlook / case@dmhrgroup.com — change anytime.
          Leave blank to keep in-app notifications only.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSavingSmtp(true);
            setError("");
            setNotice("");
            try {
              const result = await apiFetch<{
                settings: { hasPassword: boolean };
              }>("/admin/smtp-settings", {
                method: "PATCH",
                token: getToken(),
                body: JSON.stringify({
                  host: smtpHost || null,
                  port: Number(smtpPort) || null,
                  secure: smtpSecure,
                  username: smtpUser || null,
                  fromAddress: smtpFrom || null,
                  fromDisplayName: smtpFromName || null,
                  ...(smtpPassword ? { password: smtpPassword } : {}),
                }),
              });
              if (!result.success) {
                setError(result.error.message);
                return;
              }
              setSmtpPassword("");
              setSmtpHasPassword(result.data.settings.hasPassword);
              setNotice("SMTP settings saved.");
            } catch {
              setError("Unable to save SMTP settings.");
            } finally {
              setSavingSmtp(false);
            }
          }}
        >
          <div className="field">
            <label>Host</label>
            <input
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.office365.com"
            />
          </div>
          <div className="field">
            <label>Port</label>
            <input
              type="number"
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
            />
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
              />{" "}
              TLS/SSL (secure)
            </label>
          </div>
          <div className="field">
            <label>Username</label>
            <input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
          </div>
          <div className="field">
            <label>Password / app password {smtpHasPassword ? "(saved — leave blank to keep)" : ""}</label>
            <input
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label>From address</label>
            <input
              type="email"
              value={smtpFrom}
              onChange={(e) => setSmtpFrom(e.target.value)}
              placeholder="case@dmhrgroup.com"
            />
          </div>
          <div className="field">
            <label>From display name</label>
            <input value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" type="submit" disabled={savingSmtp}>
              {savingSmtp ? "Saving…" : "Save SMTP settings"}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={async () => {
                setError("");
                setNotice("");
                const result = await apiFetch("/admin/smtp-settings/test", {
                  method: "POST",
                  token: getToken(),
                  body: JSON.stringify({}),
                });
                if (!result.success) setError(result.error.message);
                else setNotice(result.message || "Test email sent.");
              }}
            >
              Send test email
            </button>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
