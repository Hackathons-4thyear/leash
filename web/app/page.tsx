import { ActivityFeed } from "@/components/ActivityFeed";
import { AgentConsole } from "@/components/AgentConsole";
import { BlockedAlerts } from "@/components/BlockedAlerts";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { KillSwitch } from "@/components/KillSwitch";
import { PendingApprovals } from "@/components/PendingApprovals";
import { PolicyPanel } from "@/components/PolicyPanel";
import { Stats } from "@/components/Stats";

export default function Page() {
  return (
    <>
      <Header />
      <BlockedAlerts />
      <main className="relative z-10 mx-auto max-w-[1400px] space-y-5 px-4 pb-16 pt-8 sm:px-6">
        <Hero />
        <Stats />

        <div className="grid gap-5 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-5">
            <AgentConsole />
          </div>
          <div className="min-w-0 lg:col-span-7">
            <ActivityFeed />
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-12">
          <div className="min-w-0 space-y-5 lg:col-span-7">
            <KillSwitch />
            <PendingApprovals />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <PolicyPanel />
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 pt-4 text-xs text-faint">
          <span>Leash · every number on this page is read live from Base Sepolia.</span>
          <span className="font-mono">testnet · mUSDC</span>
        </footer>
      </main>
    </>
  );
}
