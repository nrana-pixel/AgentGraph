import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/SidebarClient";
import { Topbar } from "@/components/layout/TopbarClient";
import { CommandPalette } from "@/components/enhancements/CommandPaletteClient";
import { TweaksPanel } from "@/components/enhancements/TweaksPanel";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="app">
      <Sidebar/>
      <main className="main">
        <Topbar/>
        <div className="main-inner">{children}</div>
      </main>
      <CommandPalette/>
      <TweaksPanel/>
    </div>
  );
}
