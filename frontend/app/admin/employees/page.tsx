"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";

type OrgOption = { id: string; name: string };
type Employee = {
  id: string;
  name: string;
  jobTitle: string | null;
  department: string | null;
  startDate: string | null;
  notes: string | null;
};

const empty = { name: "", jobTitle: "", department: "", startDate: "", notes: "" };

export default function AdminEmployeesPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  const loadEmployees = useCallback(async (id: string) => {
    if (!id) return;
    const result = await apiFetch<{ employees: Employee[] }>(
      `/admin/organisations/${id}/employees`,
      { token: getToken() }
    );
    if (result.success) setEmployees(result.data.employees);
    else setError(result.error.message);
  }, []);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    (async () => {
      const result = await apiFetch<{ organisations: OrgOption[] }>("/admin/organisations", {
        token,
      });
      if (result.success) {
        setOrgs(result.data.organisations);
        const first = result.data.organisations[0]?.id || "";
        setOrgId(first);
        if (first) await loadEmployees(first);
      }
    })();
  }, [router, loadEmployees]);

  useEffect(() => {
    if (orgId) loadEmployees(orgId);
  }, [orgId, loadEmployees]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    const result = await apiFetch(`/admin/organisations/${orgId}/employees`, {
      method: "POST",
      token: getToken(),
      body: JSON.stringify({
        name: form.name,
        jobTitle: form.jobTitle || undefined,
        department: form.department || undefined,
        startDate: form.startDate || null,
        notes: form.notes || undefined,
      }),
    });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setForm(empty);
    await loadEmployees(orgId);
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Employees">
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Organisation</h2>
        <div className="field" style={{ maxWidth: 420, marginBottom: 0 }}>
          <label>Select company</label>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Add employee</h2>
        <form onSubmit={onCreate}>
          <div className="form-grid">
            <div className="field">
              <label>Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Job title</label>
              <input
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Department</label>
              <input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Start date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={!orgId}>
            Save employee
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Records</h2>
        <p className="lead">{employees.length} employee(s)</p>
        <ul className="org-list">
          {employees.map((emp) => (
            <li key={emp.id}>
              <div>
                <div className="org-name">{emp.name}</div>
                <div className="org-meta">
                  {[emp.jobTitle, emp.department].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
