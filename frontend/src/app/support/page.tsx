"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { GlassCard } from "@/components/Glass";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

type Ticket = { id: string; subject: string; status: string; created_at: string };
type Reply = { id: string; body: string; is_admin: boolean; created_at: string };

export default function Support() {
  const { t } = useT();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [form, setForm] = useState({ subject: "", body: "" });
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => { api<Ticket[]>("/tickets").then(setTickets).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const openTicket = async (t: Ticket) => {
    setSelected(t);
    const d = await api<{ ticket: Ticket; replies: Reply[] }>(`/tickets/${t.id}`).catch(() => null);
    if (d) setReplies(d.replies);
  };

  const submit = async () => {
    try {
      await api("/tickets", { method: "POST", body: JSON.stringify(form) });
      setMsg(t("ticket_created"));
      setForm({ subject: "", body: "" });
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : t("failed")); }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    await api(`/tickets/${selected.id}/reply`, { method: "POST", body: JSON.stringify({ body: reply }) })
      .catch(() => {});
    setReply("");
    openTicket(selected);
    load();
  };

  return (
    <main>
      <Nav />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader title={t("support")} />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <GlassCard>
              <h2 className="mb-4 font-medium">{t("new_ticket")}</h2>
              <input className="input mb-3" placeholder={t("subject")} value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              <textarea className="input mb-3 min-h-28" placeholder={t("describe_issue")} value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })} />
              {msg && <p className="mb-2 text-xs text-accent">{msg}</p>}
              <button className="btn w-full" onClick={submit}>{t("submit")}</button>
            </GlassCard>
            <GlassCard>
              <h2 className="mb-4 font-medium">{t("your_tickets")}</h2>
              {tickets.length === 0 && <p className="text-xs text-muted">{t("no_tickets")}</p>}
              <div className="space-y-2">
                {tickets.map((tk) => (
                  <button key={tk.id} onClick={() => openTicket(tk)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-start transition ${selected?.id === tk.id ? "border-accent" : "border-border hover:border-white/15"}`}>
                    <span className="truncate text-sm">{tk.subject}</span>
                    <span className="ml-3 shrink-0 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] capitalize text-muted">
                      {t(tk.status)}
                    </span>
                  </button>
                ))}
              </div>
            </GlassCard>
          </div>

          <GlassCard className="flex min-h-96 flex-col">
            <h2 className="mb-4 font-medium">
              {selected ? selected.subject : t("conversation")}
            </h2>
            {!selected ? (
              <p className="py-16 text-center text-sm text-muted">{t("select_ticket")}</p>
            ) : (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto pb-4">
                  {replies.map((r) => (
                    <div key={r.id} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${r.is_admin ? "bg-white/10" : "ml-auto bg-accent/15 border border-accent/25"}`}>
                      {r.is_admin && <p className="mb-0.5 text-[9px] uppercase tracking-widest text-accent">{t("support")}</p>}
                      <p className="leading-relaxed">{r.body}</p>
                      <p className="mt-1 text-[9px] text-muted">
                        {new Date(r.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 border-t border-border pt-4">
                  <input className="input" placeholder={t("write_reply")} value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendReply()} />
                  <button className="btn shrink-0 px-4" onClick={sendReply}>{t("send")}</button>
                </div>
              </>
            )}
          </GlassCard>
        </div>
      </div>
    </main>
  );
}
