"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

export default function Forgot() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await api("/auth/forgot", {
        method: "POST", body: JSON.stringify({ email }), auth: false,
      });
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("failed"));
    }
  };

  return (
    <AuthShell title={t("reset_password")} sub={t("forgot_sub")}>
      {done ? (
        <div className="space-y-3 text-sm text-muted">
          <p>{t("reset_sent")}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input className="input" type="email" placeholder={t("email")} value={email}
            onChange={(e) => setEmail(e.target.value)} required />
          {err && <p className="text-xs text-red-400">{err}</p>}
          <button className="btn w-full" type="submit">{t("send_reset_link")}</button>
          <Link href="/login" className="block text-center text-xs text-muted hover:text-white">
            {t("back_to_login")}
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
