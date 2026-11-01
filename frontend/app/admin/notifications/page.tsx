"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { NotificationsPanel } from "../../../components/NotificationsPanel";
import type { PublicUser } from "../../../lib/api";
import { getStoredUser, getToken, homeForUser } from "../../../lib/auth";
import { adminNav } from "../../../lib/nav";

export default function AdminNotificationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored || stored.role !== "admin") {
      router.replace(stored ? homeForUser(stored) : "/login");
      return;
    }
    setUser(stored);
  }, [router]);

  if (!user) return null;

  return (
    <AppShell user={user} nav={adminNav} title="Notifications">
      <NotificationsPanel />
    </AppShell>
  );
}
