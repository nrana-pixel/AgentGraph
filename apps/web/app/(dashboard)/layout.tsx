export const dynamic = "force-dynamic";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/SidebarClient";
import { Topbar } from "@/components/layout/TopbarClient";
import { CommandPalette } from "@/components/enhancements/CommandPaletteClient";
import { TweaksPanel } from "@/components/enhancements/TweaksPanel";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="app">
      <Sidebar/>
      <main className="main">
        <Topbar/>
        <div className="main-inner">
          <OnboardingGate>{children}</OnboardingGate>
        </div>
      </main>
      <CommandPalette/>
      <TweaksPanel/>
    </div>
  );
}
