import { addressUrl, ORACLE, REPO_URL, USDC, VAULT } from "@/lib/config";
import { IconExternal } from "./icons";
import { Logo } from "./ui";

const CONTRACTS = [
  { label: "LeashVault", address: VAULT },
  { label: "MockUSDC", address: USDC },
  { label: "ReputationOracle", address: ORACLE },
];

const link = "inline-flex items-center gap-1 rounded transition hover:text-fg";

export function Footer() {
  return (
    <footer className="mt-4 border-t border-line pt-6 text-xs text-faint">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium text-muted">
            <Logo size={18} /> Leash
            <span className="font-normal text-faint">· Built for 3rd-Web-Hack</span>
          </p>
          <p>Every number on this page is read live from Base Sepolia.</p>
          <p className="inline-flex items-center gap-1.5 rounded-full border border-warn/25 bg-warn/[0.06] px-2.5 py-0.5 font-medium text-warn">
            Testnet only — mock USDC, no real funds
          </p>
        </div>

        <nav aria-label="Project links" className="flex flex-wrap gap-x-8 gap-y-4">
          <div className="space-y-1.5">
            <p className="font-medium uppercase tracking-wider">Source</p>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className={link}>
              GitHub <IconExternal width={11} height={11} />
            </a>
          </div>
          <div className="space-y-1.5">
            <p className="font-medium uppercase tracking-wider">Verified contracts</p>
            <ul className="space-y-1">
              {CONTRACTS.map((c) => (
                <li key={c.label}>
                  <a href={`${addressUrl(c.address)}#code`} target="_blank" rel="noreferrer" className={link}>
                    {c.label} <span className="font-mono">{c.address.slice(0, 6)}…{c.address.slice(-4)}</span>
                    <IconExternal width={11} height={11} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
    </footer>
  );
}
