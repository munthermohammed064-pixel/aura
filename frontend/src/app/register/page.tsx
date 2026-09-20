"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell } from "@/components/AuthShell";

import { api, setTokens } from "@/lib/api";
import { useT } from "@/lib/i18n";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useT();
  const [form, setForm] = useState({
    email: "", password: "", full_name: "",
    referral_code: params.get("ref") ?? "",
  });
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ack) return setError(t("ack_disclosure"));
    setError("");
    try {
      const tk = await api<{ access_token: string; refresh_token: string }>(
        "/auth/register", { method: "POST", body: JSON.stringify(form), auth: false });
      setTokens(tk.access_token, tk.refresh_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reg_failed"));
    }
  };

  return (
    <>
      <form onSubmit={submit} className="space-y-3">
        <input className="input" placeholder={t("full_name")}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <input className="input" type="email" placeholder={t("email")} required
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" type="password" placeholder={t("password_ph")} required minLength={8}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input className="input" placeholder={t("ref_code_ph")} value={form.referral_code}
          onChange={(e) => setForm({ ...form, referral_code: e.target.value })} />
        <label className="flex items-start gap-2 text-xs text-muted">
          <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          {t("reg_ack")}
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button className="btn w-full" type="submit">{t("create_account")}</button>
      </form>
      <p className="mt-6 text-center text-xs text-muted">
        {t("have_account")} <Link href="/login" className="text-accent">{t("login")}</Link>
      </p>
    </>
  );
}

export default function Register() {
  const { t } = useT();
  return (
    <AuthShell title={t("create_account")} sub={t("register_sub")}>
      <Suspense><RegisterForm /></Suspense>
    </AuthShell>
  );
}
