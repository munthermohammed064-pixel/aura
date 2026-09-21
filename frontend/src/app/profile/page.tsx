"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { GlassCard } from "@/components/Glass";
import { api, API_URL } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Stars } from "@/components/Stars";

type Me = {
  email: string; full_name: string; serial: string; stars: number;
  email_verified: boolean;
  default_withdraw_address: string | null;
  withdraw_qr_image: string | null;
};
type Sess = { id: string; user_agent: string; ip: string; created_at: string };

export default function Profile() {
  const { t } = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [form, setForm] = useState({ full_name: "" });
  const [addr, setAddr] = useState("");
  const [addrQr, setAddrQr] = useState<File | null>(null);
  const [addrBusy, setAddrBusy] = useState(false);
  const [addrReq, setAddrReq] = useState<{ id: string; new_address: string; fee: number } | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [pw, setPw] = useState({ current: "", new: "" });
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [verifyToken, setVerifyToken] = useState("");
  const [devVerify, setDevVerify] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => {
    api<Me>("/auth/me").then((u) => {
      setMe(u);
      setForm({ full_name: u.full_name });
    }).catch(() => {});
    api<Sess[]>("/profile/sessions").then(setSessions).catch(() => {});
    api<{ id: string; new_address: string; fee: number } | null>("/profile/withdraw-address/request")
      .then(setAddrReq).catch(() => {});
  };
  useEffect(load, []);

  const save = async () => {
    await api("/profile", { method: "PUT", body: JSON.stringify(form) });
    setMsg(t("saved"));
  };

  const changePw = async () => {
    try {
      await api("/profile/password", { method: "POST", body: JSON.stringify(pw) });
      setMsg(t("pw_changed"));
    } catch (e) { setMsg(e instanceof Error ? e.message : t("failed")); }
  };

  const sendVerify = async () => {
    const r = await api<{ dev_token?: string }>("/auth/send-verification", { method: "POST" });
    if (r.dev_token) setDevVerify(r.dev_token);
    setMsg(t("verify_sent"));
  };

  const doVerify = async () => {
    try {
      await api("/auth/verify-email", { method: "POST", body: JSON.stringify({ token: verifyToken || devVerify }) });
      setMsg(t("email_verified_msg"));
      setDevVerify("");
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : t("invalid_token")); }
  };

  const saveAddr = async () => {
    setAddrBusy(true);
    try {
      let qr_image: string | undefined;
      if (addrQr) {
        const fd = new FormData();
        fd.append("file", addrQr);
        const up = await api<{ path: string }>("/uploads", { method: "POST", body: fd });
        qr_image = up.path;
      }
      await api("/profile/withdraw-address", {
        method: "POST", body: JSON.stringify({ address: addr, qr_image }),
      });
      setMsg(t("addr_locked"));
      setAddr(""); setAddrQr(null);
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : t("failed")); }
    setAddrBusy(false);
  };

  const requestAddrChange = async () => {
    setAddrBusy(true);
    try {
      let qr_image: string | undefined;
      if (addrQr) {
        const fd = new FormData();
        fd.append("file", addrQr);
        const up = await api<{ path: string }>("/uploads", { method: "POST", body: fd });
        qr_image = up.path;
      }
      await api("/profile/withdraw-address/request", {
        method: "POST", body: JSON.stringify({ address: addr, qr_image }),
      });
      setMsg(t("request_sent"));
      setAddr(""); setAddrQr(null); setChangeOpen(false);
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : t("failed")); }
    setAddrBusy(false);
  };

  const revoke = async (id: string) => {
    await api(`/profile/sessions/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  };

  return (
    <main>
      <Nav />
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-4">
        <div className="flex items-end justify-between">
          <h1 className="text-2xl font-semibold">{t("profile")}</h1>
          <span className="flex items-center gap-3">
            {me && <Stars value={me.stars ?? 4} />}
            {me?.serial && (
              <span className="surface px-3 py-1 font-mono text-xs text-accent">{me.serial}</span>
            )}
          </span>
        </div>
        {msg && <p className="text-xs text-accent">{msg}</p>}

        {me && me.stars < 4 && (
          <GlassCard className="gold-edge">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t("stars_warning_title")}</p>
                <p className="mt-1 text-xs text-muted">{t("stars_warning_body")}</p>
              </div>
              <Stars value={me.stars} size={20} />
            </div>
          </GlassCard>
        )}

        <GlassCard>
          <h2 className="mb-4 font-medium">{t("details")}</h2>
          <p className="mb-1 text-sm text-muted">{me?.email}</p>
          <p className="mb-3 text-xs">
            {me?.email_verified
              ? <span className="text-accent">{t("email_verified")}</span>
              : <span className="text-muted">{t("email_not_verified")}</span>}
          </p>
          <input className="input mb-3" placeholder={t("full_name")} value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <button className="btn" onClick={save}>{t("save")}</button>
        </GlassCard>

        <GlassCard>
          <h2 className="mb-3 font-medium">{t("whitelist_title")}</h2>
          <p className="mb-3 text-xs text-muted">{t("whitelist_desc")}</p>
          {me?.default_withdraw_address ? (
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-widest text-muted">{t("approved_address")}</p>
              <p className="mt-1 break-all rounded-xl bg-white/5 px-3 py-2 font-mono text-xs">{me.default_withdraw_address}</p>
              {me.withdraw_qr_image && (
                <img src={`${API_URL.replace("/api", "")}${me.withdraw_qr_image}`} alt="Wallet barcode"
                  className="mt-2 h-28 w-28 rounded-xl border border-border object-contain" />
              )}
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 118 0v4"/>
                </svg>
                {t("addr_locked_note")}
              </p>
              {addrReq ? (
                <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/5 px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-amber-300">{t("change_pending")}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-muted">{addrReq.new_address}</p>
                </div>
              ) : changeOpen ? (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <input className="input font-mono text-xs" placeholder={t("new_address_ph")}
                    value={addr} onChange={(e) => setAddr(e.target.value)} />
                  <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border px-4 py-4 text-xs text-muted transition hover:border-accent">
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                      onChange={(e) => setAddrQr(e.target.files?.[0] ?? null)} />
                    {addrQr ? `${t("selected_file")} ${addrQr.name}` : t("upload_barcode")}
                  </label>
                  <p className="text-[10px] text-muted">{t("addr_fee_note")}</p>
                  <div className="flex gap-2">
                    <button className="btn text-xs" onClick={requestAddrChange} disabled={!addr.trim() || addrBusy}>
                      {t("request_addr_change")} · $5
                    </button>
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => { setChangeOpen(false); setAddr(""); setAddrQr(null); }}>
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn-ghost mt-3 px-4 py-1.5 text-xs" onClick={() => setChangeOpen(true)}>
                  {t("request_addr_change")} · $5
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <input className="input font-mono text-xs" placeholder={t("new_address_ph")}
                value={addr} onChange={(e) => setAddr(e.target.value)} />
              <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border px-4 py-5 text-xs text-muted transition hover:border-accent">
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={(e) => setAddrQr(e.target.files?.[0] ?? null)} />
                {addrQr ? `${t("selected_file")} ${addrQr.name}` : t("upload_barcode")}
              </label>
              <button className="btn text-xs" onClick={saveAddr} disabled={!addr.trim() || addrBusy}>
                {t("lock_address")}
              </button>
            </div>
          )}
        </GlassCard>

        {!me?.email_verified && (
          <GlassCard>
            <h2 className="mb-3 font-medium">{t("verify_email_title")}</h2>
            <div className="flex gap-2">
              <input className="input font-mono text-center text-lg tracking-[0.5em]" placeholder={t("verify_token_ph")}
                maxLength={6} inputMode="numeric" autoComplete="one-time-code"
                value={verifyToken || devVerify}
                onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, ""))} />
              <button className="btn-ghost shrink-0 text-xs" onClick={sendVerify}>{t("send_token")}</button>
              <button className="btn shrink-0 text-xs" onClick={doVerify}>{t("verify")}</button>
            </div>
            {devVerify && <p className="mt-2 break-all font-mono text-[10px] text-muted">dev: {devVerify}</p>}
          </GlassCard>
        )}

        <GlassCard>
          <h2 className="mb-4 font-medium">{t("change_password")}</h2>
          <input className="input mb-3" type="password" placeholder={t("current_password")}
            onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <input className="input mb-3" type="password" placeholder={t("new_password")}
            onChange={(e) => setPw({ ...pw, new: e.target.value })} />
          <button className="btn" onClick={changePw}>{t("change")}</button>
        </GlassCard>

        <GlassCard>
          <h2 className="mb-4 font-medium">{t("active_sessions")}</h2>
          {sessions.length === 0 && <p className="text-xs text-muted">{t("no_sessions")}</p>}
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs">{s.user_agent || t("unknown_device")}</p>
                  <p className="text-[10px] text-muted">{s.ip} — {new Date(s.created_at).toLocaleDateString()}</p>
                </div>
                <button className="btn-ghost shrink-0 px-3 py-1 text-[10px]" onClick={() => revoke(s.id)}>
                  {t("revoke")}
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </main>
  );
}
