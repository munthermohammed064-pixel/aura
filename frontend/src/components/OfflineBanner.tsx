"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

// Thin truth-teller — appears only while the device is actually offline.
export function OfflineBanner() {
  const { t } = useT();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div role="alert"
      className="fixed inset-x-0 top-0 z-[90] bg-red-700/95 px-4 py-1.5 text-center text-[11px] font-medium text-white backdrop-blur">
      {t("offline")}
    </div>
  );
}
