import { IconBot, IconCheck, IconClock, IconShield, IconX } from "./icons";

export function Hero() {
  return (
    <section className="grid items-center gap-6 lg:grid-cols-[1fr_auto]">
      <div>
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-safe/20 bg-safe/[0.06] px-3 py-1 text-xs font-medium text-safe">
          <IconShield width={13} height={13} /> Onchain firewall wallet for AI agents
        </p>
        <h1 className="max-w-3xl text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-3xl lg:text-[2.1rem]">
          AI agents can spend money.{" "}
          <span className="bg-gradient-to-r from-safe to-[#9dffc9] bg-clip-text text-transparent">
            Leash makes sure they can only spend it the way you allowed.
          </span>
        </h1>
      </div>

      <ol className="flex flex-wrap items-stretch gap-2 text-xs sm:flex-nowrap">
        <Step n={1} icon={<IconBot width={15} height={15} />} title="Agent requests payment" sub="vault.pay(to, amount, memo)" />
        <Arrow />
        <Step n={2} icon={<IconShield width={15} height={15} />} title="Vault checks policy" sub="caps · reputation · kill switch" />
        <Arrow />
        <li className="card flex min-w-[10rem] flex-1 flex-col justify-center gap-1.5 px-3.5 py-3 sm:flex-none">
          <span className="flex items-center gap-1.5 text-safe">
            <IconCheck width={13} height={13} /> Executed
          </span>
          <span className="flex items-center gap-1.5 text-danger">
            <IconX width={13} height={13} /> Blocked
          </span>
          <span className="flex items-center gap-1.5 text-warn">
            <IconClock width={13} height={13} /> Needs approval
          </span>
        </li>
      </ol>
    </section>
  );
}

function Step({ n, icon, title, sub }: { n: number; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <li className="card flex min-w-[10rem] flex-1 flex-col justify-center gap-1 px-3.5 py-3">
      <span className="flex items-center gap-2 font-medium text-fg">
        <span className="text-safe">{icon}</span>
        {title}
      </span>
      <span className="font-mono text-[11px] text-faint">
        <span className="text-muted">{n}.</span> {sub}
      </span>
    </li>
  );
}

function Arrow() {
  return (
    <li aria-hidden className="hidden items-center text-faint sm:flex">
      <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
        <path d="M0 5h20m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 2" />
      </svg>
    </li>
  );
}
