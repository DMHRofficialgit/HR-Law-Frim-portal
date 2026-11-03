"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { EmailTemplatesPanel } from "../../../components/EmailTemplatesPanel";
import { PanelSkeleton } from "../../../components/Skeleton";
import { useToast } from "../../../context/ToastContext";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser, saveSession } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";
import {
  ADMIN_SETTINGS_TABS,
  parseAdminSettingsTab,
  type AdminSettingsTab,
} from "../../../lib/settings";

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

function AdminSettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [extensions, setExtensions] = useState("pdf");
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
  const [smtpTestTo, setSmtpTestTo] = useState("");
  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState<"form" | "saved" | null>(null);

  const tab = useMemo(
    () => parseAdminSettingsTab(searchParams.get("tab")),
    [searchParams]
  );

  const setTab = useCallback(
    (next: AdminSettingsTab) => {
      const qs = new URLSearchParams(searchParams.toString());
      qs.set("tab", next);
      router.replace(`/admin/settings?${qs.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

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
    setProfileName(stored.name);

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
      if (stored) setSmtpTestTo(stored.email || "");
    }
    load();
  }, [router]);

  async function onSaveUpload(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
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
        toast.error(result.error.message);
        return;
      }
      toast.success("Upload settings saved.");
    } catch {
      setError("Unable to save settings.");
      toast.error("Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    setError("");
    const result = await apiFetch<{ category: Category }>("/admin/case-categories", {
      method: "POST",
      token: getToken(),
      body: JSON.stringify({ name: newCategory }),
    });
    if (!result.success) {
      setError(result.error.message);
      toast.error(result.error.message);
      return;
    }
    setNewCategory("");
    toast.success("Category added.");
    await loadCategories(getToken());
  }

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setError("");
    try {
      const result = await apiFetch<{ user: PublicUser }>("/auth/me", {
        method: "PATCH",
        token: getToken(),
        body: JSON.stringify({ name: profileName }),
      });
      if (!result.success) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      const token = getToken();
      if (token) saveSession(token, result.data.user);
      setUser(result.data.user);
      setProfileName(result.data.user.name);
      toast.success("Profile updated.");
    } catch {
      setError("Unable to update profile.");
      toast.error("Unable to update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      toast.error("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setSavingPassword(true);
    try {
      const result = await apiFetch<{ token: string; user: PublicUser }>(
        "/auth/change-password",
        {
          method: "POST",
          token: getToken(),
          body: JSON.stringify({ currentPassword, newPassword }),
        }
      );
      if (!result.success) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      saveSession(result.data.token, result.data.user);
      setUser(result.data.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated. You stay signed in.");
    } catch {
      setError("Unable to update password.");
      toast.error("Unable to update password.");
    } finally {
      setSavingPassword(false);
    }
  }

  if (!user) return null;

  const smtpConfigured = Boolean(smtpHost && smtpFrom && smtpHasPassword);

  return (
    <AppShell user={user} nav={adminNav} title="Settings">
      {error ? <div className="error-banner">{error}</div> : null}

      <header className="settings-page-head">
        <h1 className="settings-page-title">Settings</h1>
        <p className="lead settings-page-lead">
          Workspace mail wording, SMTP, storage rules, case categories, and your account.
        </p>
      </header>

      <nav className="settings-tabs" aria-label="Settings sections" role="tablist">
        {ADMIN_SETTINGS_TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`settings-tab${active ? " is-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="settings-tab-panel panel" role="tabpanel">
        {tab === "templates" ? <EmailTemplatesPanel active={tab === "templates"} /> : null}

        {tab === "smtp" ? (
          <>
            <div className="settings-panel-head">
              <div>
                <h2>Email / SMTP</h2>
                <p className="lead">
                  Outbound mail for invites, welcome, e-sign, cases, and document notifies. Password
                  is stored encrypted and never shown again after save — leave blank to keep the
                  current one.
                </p>
              </div>
              <span
                className={`settings-status-pill${smtpConfigured ? " is-ok" : ""}`}
              >
                {smtpConfigured ? "Configured" : "Not configured"}
              </span>
            </div>
            <form
              className="form-compact smtp-settings-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setSavingSmtp(true);
                setError("");
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
                    toast.error(result.error.message);
                    return;
                  }
                  setSmtpPassword("");
                  setSmtpHasPassword(result.data.settings.hasPassword);
                  toast.success("SMTP settings saved.");
                } catch {
                  setError("Unable to save SMTP settings.");
                  toast.error("Unable to save SMTP settings.");
                } finally {
                  setSavingSmtp(false);
                }
              }}
            >
              <div className="field field-full">
                <label htmlFor="smtp-host">SMTP host</label>
                <input
                  id="smtp-host"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.hostinger.com"
                  autoComplete="off"
                />
              </div>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor="smtp-port">Port</label>
                  <input
                    id="smtp-port"
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    placeholder="465"
                  />
                </div>
                <div className="field">
                  <span className="field-label">Encryption</span>
                  <label className="smtp-secure-check">
                    <input
                      type="checkbox"
                      checked={smtpSecure}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setSmtpSecure(on);
                        if (on && smtpPort === "587") setSmtpPort("465");
                        if (!on && smtpPort === "465") setSmtpPort("587");
                      }}
                    />
                    TLS/SSL (implicit, e.g. port 465)
                  </label>
                </div>
                <div className="field">
                  <label htmlFor="smtp-user">Username</label>
                  <input
                    id="smtp-user"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="info@yourdomain.com"
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label htmlFor="smtp-pass">
                    Password {smtpHasPassword ? "(saved — leave blank to keep)" : ""}
                  </label>
                  <input
                    id="smtp-pass"
                    type="password"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder="Leave blank to keep saved password"
                    autoComplete="new-password"
                  />
                </div>
                <div className="field">
                  <label htmlFor="smtp-from">From email</label>
                  <input
                    id="smtp-from"
                    type="email"
                    value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    placeholder="info@yourdomain.com"
                  />
                </div>
                <div className="field">
                  <label htmlFor="smtp-from-name">From name</label>
                  <input
                    id="smtp-from-name"
                    value={smtpFromName}
                    onChange={(e) => setSmtpFromName(e.target.value)}
                    placeholder="DM.HR Group"
                  />
                </div>
              </div>

              <div className="field field-full" style={{ marginTop: 8 }}>
                <label htmlFor="smtp-test-to">Send test email to</label>
                <input
                  id="smtp-test-to"
                  type="email"
                  value={smtpTestTo}
                  onChange={(e) => setSmtpTestTo(e.target.value)}
                  placeholder="you@gmail.com"
                />
                <p className="lead" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
                  Connection is verified, then a short product test email is sent to this address.
                </p>
              </div>

              <div className="smtp-actions">
                <button className="btn btn-primary btn-sm" type="submit" disabled={savingSmtp}>
                  {savingSmtp ? "Saving…" : "Save settings"}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={testingSmtp !== null}
                  onClick={async () => {
                    setError("");
                    setTestingSmtp("form");
                    try {
                      const result = await apiFetch("/admin/smtp-settings/test", {
                        method: "POST",
                        token: getToken(),
                        body: JSON.stringify({
                          source: "form",
                          to: smtpTestTo || undefined,
                          host: smtpHost,
                          port: Number(smtpPort) || undefined,
                          secure: smtpSecure,
                          username: smtpUser,
                          password: smtpPassword || undefined,
                          fromAddress: smtpFrom,
                          fromDisplayName: smtpFromName,
                        }),
                      });
                      if (!result.success) {
                        setError(result.error.message);
                        toast.error(result.error.message);
                      } else {
                        toast.success(result.message || "Test email sent.");
                      }
                    } catch {
                      setError("Unable to send test email.");
                      toast.error("Unable to send test email.");
                    } finally {
                      setTestingSmtp(null);
                    }
                  }}
                >
                  {testingSmtp === "form" ? "Testing…" : "Test & send email (form)"}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={testingSmtp !== null}
                  onClick={async () => {
                    setError("");
                    setTestingSmtp("saved");
                    try {
                      const result = await apiFetch("/admin/smtp-settings/test", {
                        method: "POST",
                        token: getToken(),
                        body: JSON.stringify({
                          source: "saved",
                          to: smtpTestTo || undefined,
                        }),
                      });
                      if (!result.success) {
                        setError(result.error.message);
                        toast.error(result.error.message);
                      } else {
                        toast.success(result.message || "Test email sent.");
                      }
                    } catch {
                      setError("Unable to send test email.");
                      toast.error("Unable to send test email.");
                    } finally {
                      setTestingSmtp(null);
                    }
                  }}
                >
                  {testingSmtp === "saved" ? "Testing…" : "Test saved & send email"}
                </button>
              </div>
            </form>
          </>
        ) : null}

        {tab === "storage" ? (
          <>
            <div className="settings-panel-head">
              <div>
                <h2>Storage</h2>
                <p className="lead">
                  Uploads are <strong>PDF only</strong> (same as e-sign). Adjust max size if needed;
                  keep extensions as <code>pdf</code> so clients are not offered unsigned Word
                  files.
                </p>
              </div>
            </div>
            <form className="form-compact" onSubmit={onSaveUpload}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="ext">Allowed extensions</label>
                  <input
                    id="ext"
                    value={extensions}
                    onChange={(e) => setExtensions(e.target.value)}
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
              </div>
              <div className="field field-full">
                <label htmlFor="mime">Allowed MIME types</label>
                <textarea
                  id="mime"
                  rows={3}
                  value={mimes}
                  onChange={(e) => setMimes(e.target.value)}
                />
              </div>
              <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save upload settings"}
              </button>
            </form>
          </>
        ) : null}

        {tab === "categories" ? (
          <>
            <div className="settings-panel-head">
              <div>
                <h2>Case categories</h2>
                <p className="lead">System defaults plus custom categories you add.</p>
              </div>
            </div>
            <ul className="settings-category-list">
              {categories.map((c) => (
                <li key={c.id}>
                  <span className="settings-category-name">{c.name}</span>
                  <span className="settings-category-tag">
                    {c.isSystem ? "System" : "Custom"}
                  </span>
                </li>
              ))}
            </ul>
            <form className="form-compact settings-category-add" onSubmit={addCategory}>
              <div className="field field-full">
                <label htmlFor="new-cat">New category</label>
                <input
                  id="new-cat"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  required
                />
              </div>
              <button className="btn btn-secondary btn-sm" type="submit">
                Add category
              </button>
            </form>
          </>
        ) : null}

        {tab === "account" ? (
          <>
            <div className="settings-panel-head">
              <div>
                <h2>Account</h2>
                <p className="lead">Your signed-in admin profile and password.</p>
              </div>
            </div>

            <form className="form-compact settings-account-block" onSubmit={onSaveProfile}>
              <h3 className="settings-subhead">Profile</h3>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="profile-name">Full name</label>
                  <input
                    id="profile-name"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    required
                    maxLength={120}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profile-email">Email</label>
                  <input id="profile-email" value={user.email} readOnly disabled />
                </div>
                <div className="field">
                  <label htmlFor="profile-role">Role</label>
                  <input id="profile-role" value="Admin" readOnly disabled />
                </div>
              </div>
              <p className="lead settings-hint">Email is your login identity and cannot be changed here.</p>
              <button className="btn btn-primary btn-sm" type="submit" disabled={savingProfile}>
                {savingProfile ? "Saving…" : "Save profile"}
              </button>
            </form>

            <form className="form-compact settings-account-block" onSubmit={onChangePassword}>
              <h3 className="settings-subhead">Security</h3>
              <div className="field field-full">
                <label htmlFor="pw-current">Current password</label>
                <input
                  id="pw-current"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="pw-new">New password</label>
                  <input
                    id="pw-new"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="Min 8 characters"
                  />
                </div>
                <div className="field">
                  <label htmlFor="pw-confirm">Confirm new password</label>
                  <input
                    id="pw-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
              </div>
              <button className="btn btn-primary btn-sm" type="submit" disabled={savingPassword}>
                {savingPassword ? "Updating…" : "Update password"}
              </button>
              <p className="lead settings-hint">You stay signed in after updating your password.</p>
            </form>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<main className="auth-shell"><PanelSkeleton /></main>}>
      <AdminSettingsPageInner />
    </Suspense>
  );
}
