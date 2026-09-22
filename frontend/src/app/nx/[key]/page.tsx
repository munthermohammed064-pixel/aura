import { notFound } from "next/navigation";
import AdminConsole from "./AdminConsole";

export const dynamic = "force-dynamic";

// The panel key lives only in server env (ADMIN_PANEL_KEY) — it never enters
// the JS bundle. A wrong /nx/* key renders the real 404, indistinguishable
// from a missing page.
export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const expected = process.env.ADMIN_PANEL_KEY || "";
  if (!expected || key !== expected) notFound();
  return <AdminConsole />;
}
