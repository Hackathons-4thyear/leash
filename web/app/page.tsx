import { ActivityFeed } from "@/components/ActivityFeed";
import { AgentConsole } from "@/components/AgentConsole";
import { BlockedAlerts } from "@/components/BlockedAlerts";
import { ChainError } from "@/components/ChainError";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { KillSwitch } from "@/components/KillSwitch";
import { PendingApprovals } from "@/components/PendingApprovals";
import { PolicyPanel } from "@/components/PolicyPanel";
import { ProofStrip } from "@/components/ProofStrip";
import { Stats } from "@/components/Stats";

export default function Page() {
  return (
    <>
      <Header />
      <BlockedAlerts />
      <main className="relative z-10 mx-auto max-w-[1400px] space-y-5 px-4 pb-16 pt-8 sm:px-6">
        <Hero />
        <ProofStrip />
        <ChainError />
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

        <Footer />
      </main>
    </>
  );
}
