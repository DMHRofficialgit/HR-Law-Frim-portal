"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { apiFetch, type PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { clientNav } from "../../../lib/nav";

type Employee = {
  id: string;
  name: string;
  jobTitle: string | null;
  department: string | null;
  startDate: string | null;
  notes: string | null;
  status: string;
};

const empty = { name: "", jobTitle: "", department: "", startDate: "", notes: "" };

export default function PortalEmployeesPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const result = await apiFetch<{ employees: Employee[] }>("/client/employees", {
      token: getToken(),
    });
    if (result.success) setEmployees(result.data.employees);
    else setError(result.error.message);
  }, []);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "client") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    load();
  }, [router, load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    const result = await apiFetch<{ employee: Employee }>("/client/employees", {
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
    setNotice("Employee added.");
    setForm(empty);
    await load();
  }

  async function onDelete(id: string, name: string) {
    if (!window.confirm(`Delete employee “${name}”?`)) return;
    const result = await apiFetch(`/client/employees/${id}`, {
      method: "DELETE",
      token: getToken(),
    });
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    await load();
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={clientNav} title="Employees">
      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Add employee</h2>
        <p className="lead">Records for your organisation (no employee self-login).</p>
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
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <button className="btn btn-primary" type="submit">
            Save employee
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Employee records</h2>
        <p className="lead">{employees.length} record(s)</p>
        <ul className="org-list">
          {employees.map((emp) => (
            <li key={emp.id}>
              <div>
                <div className="org-name">{emp.name}</div>
                <div className="org-meta">
                  {[emp.jobTitle, emp.department].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm danger"
                onClick={() => onDelete(emp.id, emp.name)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
