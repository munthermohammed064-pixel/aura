"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { api, setTokens } from "@/lib/api";
import { useT } from "@/lib/i18n";

export default function Login() {
  const router = useRouter();
  const { t } = useT();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const tk = await api<{ access_token: string; refresh_token: string }>(
        "/auth/login", { method: "POST", body: JSON.stringify({ identifier: form.email, password: form.password }), auth: false });
      setTokens(tk.access_token, tk.refresh_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login_failed"));
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t("welcome_back")} sub={t("sign_in_sub")}>
      <form onSubmit={submit} className="space-y-3">
        <input className="input" type="email" placeholder={t("email")} required autoComplete="email" inputMode="email"
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" type="password" placeholder={t("password")} required autoComplete="current-password"
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button className="btn w-full disabled:opacity-50" type="submit" disabled={busy}>{t("login")}</button>
      </form>
      <p className="mt-6 text-center text-xs text-muted">
        <Link href="/forgot" className="hover:text-white">{t("forgot_password")}</Link>
      </p>
      <p className="mt-2 text-center text-xs text-muted">
        {t("no_account")} <Link href="/register" className="text-accent">{t("sign_up")}</Link>
      </p>
    </AuthShell>
  );
}
