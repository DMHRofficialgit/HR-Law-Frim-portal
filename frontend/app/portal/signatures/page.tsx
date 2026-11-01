"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { EsignSheet } from "../../../components/EsignSheet";
import { ProfileSignaturePanel } from "../../../components/ProfileSignaturePanel";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { clientNav } from "../../../lib/nav";
import {
  esignQueueAction,
  signatureProgress,
  signatureStatusLabel,
  type SignatureRequestRow,
} from "../../../lib/signatures";

export default function ClientSignaturesPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [requests, setRequests] = useState<SignatureRequestRow[]>([]);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  async function load(token: string | null) {
    const result = await apiFetch<{ requests: SignatureRequestRow[] }>(
      "/client/signature-requests",
      { token }
    );
    if (result.success) setRequests(result.data.requests);
    else setError(result.error.message);
  }

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "client") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    load(token);
  }, [router]);

  if (!user) return null;

  return (
    <AppShell user={user} nav={clientNav} title="Signatures">
      {error ? <div className="error-banner">{error}</div> : null}
      <ProfileSignaturePanel />
      <section className="panel">
        <h2>Documents to sign</h2>
        <p className="lead">Open a request to sign in the side panel.</p>
        <ul className="org-list">
          {requests.map((r) => {
            const p = signatureProgress(r.fields || []);
            const qa = esignQueueAction({
              status: r.status,
              role: "client",
              userId: user.id,
              fields: r.fields || [],
            });
            const wait =
              p.waitingNames.length && qa.action === "sign"
                ? ` · waiting on ${p.waitingNames.join(", ")}`
                : p.waitingNames.length && r.status !== "reviewed" && r.status !== "signed_returned"
                  ? ` · waiting on ${p.waitingNames.join(", ")}`
                  : "";
            return (
            <li key={r.id}>
              <div>
                <div className="org-name">
                  {r.title}
                  {qa.action === "sign" ? (
                    <span className="esign-queue-badge needs-you">Needs you</span>
                  ) : null}
                </div>
                <div className="org-meta">
                  {signatureStatusLabel(r.status)} · {r.sourceFileName}
                  {p.total ? ` · ${p.done}/${p.total}${wait}` : ""}
                </div>
              </div>
              <button
                type="button"
                className={`btn btn-sm ${qa.action === "sign" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setOpenId(r.id)}
              >
                {qa.label}
              </button>
            </li>
            );
          })}
        </ul>
      </section>

      {openId ? (
        <EsignSheet
          role="client"
          requestId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => load(getToken())}
        />
      ) : null}
    </AppShell>
  );
}
