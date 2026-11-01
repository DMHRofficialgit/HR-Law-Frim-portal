"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../../components/AppShell";
import { API_URL, apiFetch, type PublicUser } from "../../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../../lib/auth";
import { clientNav } from "../../../../lib/nav";

type Category = { id: string; name: string };
type Employee = { id: string; name: string };

export default function NewCasePage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "client") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
    (async () => {
      const [cats, emps] = await Promise.all([
        apiFetch<{ categories: Category[] }>("/client/case-categories", { token }),
        apiFetch<{ employees: Employee[] }>("/client/employees", { token }),
      ]);
      if (cats.success) {
        setCategories(cats.data.categories);
        setCategoryId(cats.data.categories[0]?.id || "");
      }
      if (emps.success) {
        setEmployees(emps.data.employees);
        setEmployeeId(emps.data.employees[0]?.id || "");
      }
    })();
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("description", description);
      form.append("categoryId", categoryId);
      form.append("employeeId", employeeId);
      if (files) {
        Array.from(files).forEach((f) => form.append("files", f));
      }
      const res = await fetch(`${API_URL}/client/cases`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.error?.message || "Unable to submit case");
        return;
      }
      router.replace(`/portal/cases/${body.data.case.id}`);
    } catch {
      setError("Unable to submit case");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <AppShell user={user} nav={clientNav} title="Submit a case">
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel">
        <h2>New employment case</h2>
        <p className="lead">
          Title, category, description, related employee, and optional attachments.
        </p>
        {employees.length === 0 ? (
          <div className="error-banner">
            Add an employee first under Employees before submitting a case.
          </div>
        ) : null}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Related employee</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Attachments (optional)</label>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx"
              onChange={(e) => setFiles(e.target.files)}
            />
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={saving || !employeeId || !categoryId}
          >
            {saving ? "Submitting…" : "Submit case"}
          </button>
        </form>
      </section>
    </AppShell>
  );
}
