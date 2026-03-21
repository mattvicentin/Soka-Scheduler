"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";

interface Account {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  faculty: { name: string } | null;
  program_associations: Array<{ program_name: string }>;
}

export default function DeanAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ data: Account[] }>("/api/accounts").then((r) => {
      const d = (r.data as { data?: Account[] })?.data ?? [];
      setAccounts(d);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">Accounts</h1>
      <p className="mt-1 text-soka-muted">
        Manage accounts, roles, and program associations. Admin accounts are excluded.
      </p>

      {loading ? (
        <p className="mt-6 text-soka-muted">Loading...</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-collapse border border-soka-border">
            <thead>
              <tr className="bg-soka-surface">
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Email
                </th>
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Role
                </th>
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Faculty
                </th>
                <th className="border border-soka-border px-4 py-2 text-center text-sm font-medium text-soka-body">
                  Active
                </th>
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Programs
                </th>
                <th className="border border-soka-border px-4 py-2 text-left text-sm font-medium text-soka-body">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-soka-surface">
                  <td className="border border-soka-border px-4 py-2 text-sm text-soka-body">
                    {a.email}
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-sm text-soka-muted capitalize">
                    {a.role}
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-sm text-soka-muted">
                    {a.faculty?.name ?? "—"}
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-center text-sm">
                    {a.is_active ? (
                      <span className="text-soka-success">Yes</span>
                    ) : (
                      <span className="text-soka-error">No</span>
                    )}
                  </td>
                  <td className="border border-soka-border px-4 py-2 text-sm text-soka-muted">
                    {a.program_associations.map((p) => p.program_name).join(", ") || "—"}
                  </td>
                  <td className="border border-soka-border px-4 py-2">
                    <Link
                      href={`/dean/accounts/${a.id}`}
                      className="text-soka-light-blue hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
