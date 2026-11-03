"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { PanelSkeleton } from "../../../components/Skeleton";
import { useToast } from "../../../context/ToastContext";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser, saveSession } from "../../../lib/auth";
import { clientNav } from "../../../lib/nav";
import {
  CLIENT_SETTINGS_TABS,
  NOTIFY_PREF_ROWS,
  parseClientSettingsTab,
  type ClientSettingsTab,
  type NotificationPrefs,
} from "../../../lib/settings";

type OrgSummary = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  type: string | null;
};

const DEFAULT_PREFS: NotificationPrefs = {
  emailCases: true,
  emailDocuments: true,
  emailSignatures: true,
  emailOnboarding: true,
};

function ClientSettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [profileName, setProfileName] = useState("");
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(true);

  const tab = useMemo(
    () => parseClientSettingsTab(searchParams.get("tab")),
    [searchParams]
  );

  const setTab = useCallback(
    (next: ClientSettingsTab) => {
      const qs = new URLSearchParams(searchParams.toString());
      qs.set("tab", next);
      router.replace(`/portal/settings?${qs.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored) {
      router.replace("/login");
      return;
    }
    if (stored.role !== "client") {
      router.replace(homeForUser(stored));
      return;
    }
    setUser(stored);
    setProfileName(stored.name);

    async function load() {
      const orgRes = await apiFetch<{ organisation: OrgSummary }>("/client/organisation", {
        token,
      });
      if (orgRes.success) setOrg(orgRes.data.organisation);

      setLoadingPrefs(true);
      const prefRes = await apiFetch<{ preferences: NotificationPrefs }>(
        "/me/notification-preferences",
        { token }
      );
      if (prefRes.success) setPrefs(prefRes.data.preferences);
      setLoadingPrefs(false);
    }
    load();
  }, [router]);

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

  async function onSavePrefs(e: FormEvent) {
    e.preventDefault();
    setSavingPrefs(true);
    setError("");
    try {
      const result = await apiFetch<{ preferences: NotificationPrefs }>(
        "/me/notification-preferences",
        {
          method: "PATCH",
          token: getToken(),
          body: JSON.stringify(prefs),
        }
      );
      if (!result.success) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      setPrefs(result.data.preferences);
      toast.success("Notification preferences saved.");
    } catch {
      setError("Unable to save preferences.");
      toast.error("Unable to save preferences.");
    } finally {
      setSavingPrefs(false);
    }
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={clientNav} title="Settings">
      {error ? <div className="error-banner">{error}</div> : null}

      <header className="settings-page-head">
        <h1 className="settings-page-title">Settings</h1>
        <p className="lead settings-page-lead">
          Your organisation profile, account security, and email notification preferences.
        </p>
      </header>

      <nav className="settings-tabs" aria-label="Settings sections" role="tablist">
        {CLIENT_SETTINGS_TABS.map((t) => {
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
        {tab === "account" ? (
          <>
            <div className="settings-panel-head">
              <div>
                <h2>Account</h2>
                <p className="lead">Organisation summary and your login profile.</p>
              </div>
            </div>

            <div className="settings-account-block">
              <h3 className="settings-subhead">Organisation</h3>
              <div className="form-grid form-compact">
                <div className="field">
                  <label htmlFor="org-name">Company name</label>
                  <input id="org-name" value={org?.name || "—"} readOnly disabled />
                </div>
                <div className="field">
                  <label htmlFor="org-contact">Registered contact</label>
                  <input
                    id="org-contact"
                    value={org?.contactName || "—"}
                    readOnly
                    disabled
                  />
                </div>
                <div className="field">
                  <label htmlFor="org-email">Contact email</label>
                  <input id="org-email" value={org?.email || "—"} readOnly disabled />
                </div>
                <div className="field">
                  <label htmlFor="org-type">Organisation type</label>
                  <input id="org-type" value={org?.type || "—"} readOnly disabled />
                </div>
              </div>
              <p className="lead settings-hint">
                Organisation details are managed by DM.HR. Contact your adviser to update them.
              </p>
            </div>

            <form className="form-compact settings-account-block" onSubmit={onSaveProfile}>
              <h3 className="settings-subhead">Your profile</h3>
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
                  <label htmlFor="profile-email">Login email</label>
                  <input id="profile-email" value={user.email} readOnly disabled />
                </div>
              </div>
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

        {tab === "notifications" ? (
          <>
            <div className="settings-panel-head">
              <div>
                <h2>Notification preferences</h2>
                <p className="lead">
                  Choose which alerts also send email. In-app notifications in the bell stay on so
                  you never miss portal activity.
                </p>
              </div>
            </div>

            {loadingPrefs ? (
              <PanelSkeleton />
            ) : (
              <form className="form-compact" onSubmit={onSavePrefs}>
                <ul className="settings-pref-list">
                  {NOTIFY_PREF_ROWS.map((row) => (
                    <li key={row.key}>
                      <div>
                        <div className="settings-pref-label">{row.label}</div>
                        <p className="settings-pref-hint">{row.hint}</p>
                      </div>
                      <label className="settings-pref-toggle">
                        <input
                          type="checkbox"
                          checked={prefs[row.key]}
                          onChange={(e) =>
                            setPrefs((p) => ({ ...p, [row.key]: e.target.checked }))
                          }
                        />
                        <span>Email</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button className="btn btn-primary btn-sm" type="submit" disabled={savingPrefs}>
                  {savingPrefs ? "Saving…" : "Save preferences"}
                </button>
              </form>
            )}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function ClientSettingsPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-shell">
          <PanelSkeleton />
        </main>
      }
    >
      <ClientSettingsPageInner />
    </Suspense>
  );
}
