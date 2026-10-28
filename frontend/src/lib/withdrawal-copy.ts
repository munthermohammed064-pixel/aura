// Shared by the admin history, deadline banner, and notification bell.
const text = (en: string, ar: string, es: string, fr: string, tr: string, ru: string, de: string) =>
  ({ en, ar, es, fr, tr, ru, de });

export const withdrawalCopy = {
  wd_history: text("Withdrawal history", "سجل السحوبات", "Historial de retiros", "Historique des retraits", "Çekim geçmişi", "История выводов", "Auszahlungsverlauf"),
  wd_all_users: text("All users", "جميع المستخدمين", "Todos los usuarios", "Tous les utilisateurs", "Tüm kullanıcılar", "Все пользователи", "Alle Benutzer"),
  wd_search: text("Search name, email or member ID…", "ابحث بالاسم أو البريد أو رقم العضو…", "Buscar nombre, correo o ID…", "Nom, e-mail ou identifiant…", "Ad, e-posta veya üye no ara…", "Имя, почта или номер участника…", "Name, E-Mail oder Mitgliedsnummer…"),
  wd_open: text("Awaiting payment", "بانتظار التحويل", "Pendientes de pago", "En attente de paiement", "Ödeme bekliyor", "Ожидают выплаты", "Warten auf Zahlung"),
  wd_urgent: text("Needs attention", "تحتاج إلى انتباه", "Requieren atención", "À traiter en priorité", "İlgilenilmesi gerekiyor", "Требуют внимания", "Handlungsbedarf"),
  wd_due_soon: text("Last 24 hours", "آخر 24 ساعة", "Últimas 24 horas", "Dernières 24 heures", "Son 24 saat", "Последние 24 часа", "Letzte 24 Stunden"),
  wd_overdue: text("Overdue", "متأخر عن الموعد", "Vencido", "En retard", "Gecikmiş", "Просрочено", "Überfällig"),
  wd_deadline: text("Transfer deadline", "آخر موعد للتحويل", "Fecha límite de pago", "Échéance du virement", "Transfer son tarihi", "Срок перевода", "Überweisungsfrist"),
  wd_requested: text("Requested at", "تاريخ تقديم الطلب", "Fecha de solicitud", "Date de demande", "Talep tarihi", "Дата заявки", "Angefordert am"),
  wd_processed: text("Last processed", "آخر معالجة", "Último procesamiento", "Dernier traitement", "Son işlem", "Последняя обработка", "Zuletzt bearbeitet"),
  wd_paid_at: text("Paid at", "تاريخ التحويل", "Fecha de pago", "Date de paiement", "Ödeme tarihi", "Дата выплаты", "Bezahlt am"),
  wd_paid_total: text("Total transferred (net)", "إجمالي المحوّل فعلياً (الصافي)", "Total pagado (neto)", "Total versé (net)", "Toplam ödenen (net)", "Всего выплачено (нетто)", "Überwiesen gesamt (netto)"),
  wd_records: text("{n} requests", "{n} طلبات", "{n} solicitudes", "{n} demandes", "{n} talep", "Заявок: {n}", "{n} Anträge"),
  wd_remaining: text("{h}h {m}m remaining", "متبقي {h} ساعة و{m} دقيقة", "Quedan {h}h {m}m", "Reste {h}h {m}min", "{h}sa {m}dk kaldı", "Осталось {h}ч {m}мин", "Noch {h}Std {m}Min"),
  wd_late: text("{h}h {m}m overdue", "متأخر {h} ساعة و{m} دقيقة", "Retraso: {h}h {m}m", "Retard : {h}h {m}min", "{h}sa {m}dk gecikmiş", "Просрочено на {h}ч {m}мин", "{h}Std {m}Min überfällig"),
  wd_policy: text("Transfer within 72 working hours. Saturday and Sunday do not count (UTC). Alerts start after 48 working hours.", "التحويل خلال 72 ساعة عمل. لا يُحسب السبت والأحد وفق UTC. يبدأ التنبيه بعد 48 ساعة عمل.", "Pago en 72 horas laborables, sin sábados ni domingos (UTC). Alertas tras 48 horas laborables.", "Virement sous 72 heures ouvrées, hors samedi et dimanche (UTC). Alerte après 48 heures ouvrées.", "72 iş saatinde transfer; Cumartesi ve Pazar hariç (UTC). Uyarılar 48 iş saati sonra.", "Перевод за 72 рабочих часа, без субботы и воскресенья (UTC). Оповещение через 48 рабочих часов.", "Überweisung binnen 72 Arbeitsstunden, ohne Samstag und Sonntag (UTC). Warnung nach 48 Arbeitsstunden."),
  wd_timezone: text("Times shown in {zone}", "الأوقات معروضة بتوقيت {zone}", "Horas en {zone}", "Heures affichées en {zone}", "Saat dilimi: {zone}", "Часовой пояс: {zone}", "Zeiten in {zone}"),
  wd_alert_title: text("Withdrawal deadlines", "تنبيهات مواعيد التحويل", "Plazos de retiro", "Échéances des retraits", "Çekim süreleri", "Сроки выплат", "Auszahlungsfristen"),
  wd_alert_summary: text("{soon} in the last 24 hours · {late} overdue · ${amount} net to transfer", "{soon} في آخر 24 ساعة · {late} متأخرة · صافي التحويل المطلوب ${amount}", "{soon} en últimas 24h · {late} vencidos · ${amount} netos por pagar", "{soon} en dernières 24h · {late} en retard · ${amount} nets à verser", "{soon} son 24 saatte · {late} gecikmiş · ${amount} net ödeme", "{soon} в последние 24ч · {late} просрочено · к выплате ${amount}", "{soon} in letzten 24Std · {late} überfällig · ${amount} netto zu zahlen"),
  wd_review: text("Review transfers", "مراجعة التحويلات", "Revisar pagos", "Examiner les virements", "Transferleri incele", "Проверить переводы", "Überweisungen prüfen"),
  n_admin_withdrawal_due_soon: text("Transfer due within 24 hours — {name} ({serial}), net ${amount}.", "متبقي 24 ساعة أو أقل للتحويل — {name} ({serial})، الصافي ${amount}.", "Pago en 24h o menos — {name} ({serial}), neto ${amount}.", "Virement sous 24h — {name} ({serial}), net ${amount}.", "24 saat içinde transfer — {name} ({serial}), net ${amount}.", "Перевод в течение 24ч — {name} ({serial}), нетто ${amount}.", "Überweisung binnen 24Std — {name} ({serial}), netto ${amount}."),
  n_admin_withdrawal_overdue: text("72-hour transfer deadline missed — {name} ({serial}), net ${amount}.", "تجاوزت مهلة التحويل 72 ساعة — {name} ({serial})، الصافي ${amount}.", "Plazo de 72h vencido — {name} ({serial}), neto ${amount}.", "Délai de 72h dépassé — {name} ({serial}), net ${amount}.", "72 saatlik süre aşıldı — {name} ({serial}), net ${amount}.", "Срок 72ч истёк — {name} ({serial}), нетто ${amount}.", "72-Stunden-Frist überschritten — {name} ({serial}), netto ${amount}."),
};
