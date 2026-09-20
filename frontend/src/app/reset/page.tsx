"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { t } = useT();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await api("/auth/reset", {
        method: "POST", body: JSON.stringify({ token, new_password: pw }), auth: false,
      });
      setMsg(t("pw_updated"));
      setTimeout(() => router.push("/login"), 1500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("failed"));
    }
  };

  return (
    <>
      <form onSubmit={submit} className="space-y-3">
        <input className="input font-mono text-xs" placeholder={t("reset_token_ph")} value={token}
          onChange={(e) => setToken(e.target.value)} required />
        <input className="input" type="password" placeholder={t("new_password_ph")}
          value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required />
        {err && <p className="text-xs text-red-400">{err}</p>}
        {msg && <p className="text-xs text-accent">{msg}</p>}
        <button className="btn w-full" type="submit">{t("update_password")}</button>
      </form>
      <Link href="/login" className="mt-6 block text-center text-xs text-muted hover:text-white">
        {t("back_to_login")}
      </Link>
    </>
  );
}

export default function Reset() {
  const { t } = useT();
  return (
    <AuthShell title={t("new_pw_title")} sub={t("new_pw_sub")}>
      <Suspense fallback={<p className="text-sm text-muted">{t("loading")}</p>}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
