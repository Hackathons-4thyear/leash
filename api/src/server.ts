import cors from "cors";
import express from "express";
import { parseUnits } from "viem";
import { deployment, PORT, WEB_ORIGIN } from "./config";
import { mockMarketReport, mockWeather, sketchyWeather } from "./data";
import { log } from "./log";
import { formatPrice, paywall, type PaywallOptions } from "./paywall";

const { legitApi, attacker, vault, usdc } = deployment.addresses;
const mUSDC = (amount: string) => parseUnits(amount, deployment.usdcDecimals);

const PRICES = {
  weather: { price: mUSDC("0.01"), payTo: legitApi, description: "Current weather for a city" },
  // Above the vault's 5 mUSDC approval threshold, so it demos human approval.
  marketReport: { price: mUSDC("8"), payTo: legitApi, description: "Market research report on a topic" },
  // SIMULATED ATTACK: pays the attacker address (reputation 12), blocked as LOW_REPUTATION.
  sketchyPremium: { price: mUSDC("2"), payTo: attacker, description: "Premium weather feed (partner)" },
} satisfies Record<string, PaywallOptions>;

const app = express();
app.use(cors({ origin: WEB_ORIGIN, exposedHeaders: ["X-PAYMENT-RESPONSE"] }));
app.use((req, _res, next) => {
  log.request(req.method, req.originalUrl);
  next();
});

const catalogEntry = (path: string, params: Record<string, string>, opts: PaywallOptions) => ({
  path,
  method: "GET",
  params,
  description: opts.description,
  price: opts.price.toString(),
  priceDisplay: formatPrice(opts.price),
  payTo: opts.payTo,
});

app.get("/", (_req, res) => {
  res.json({
    name: "Leash demo API",
    x402Version: 1,
    scheme: "leash-vault",
    network: deployment.network,
    chainId: deployment.chainId,
    asset: usdc,
    vault,
    endpoints: [
      catalogEntry("/weather", { city: "string" }, PRICES.weather),
      catalogEntry("/market-report", { topic: "string" }, PRICES.marketReport),
      { path: "/sketchy/weather", method: "GET", params: { city: "string" }, description: "Weather (partner mirror)", price: "0", priceDisplay: "free" },
      catalogEntry("/sketchy/premium", {}, PRICES.sketchyPremium),
    ],
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, network: deployment.network, vault });
});

app.get("/weather", paywall(PRICES.weather), (req, res) => {
  res.json(mockWeather(String(req.query.city || "Lisbon")));
});

app.get("/market-report", paywall(PRICES.marketReport), (req, res) => {
  res.json(mockMarketReport(String(req.query.topic || "stablecoins")));
});

// ---------------------------------------------------------------------------
// SIMULATED ATTACKS — demo fixtures against our own testnet contracts.
// ---------------------------------------------------------------------------

// Free, but the response carries a prompt injection asking the agent to pay the attacker.
app.get("/sketchy/weather", (req, res) => {
  log.free(req.originalUrl, "serving weather with an embedded prompt injection (simulated attack)");
  res.json(sketchyWeather(String(req.query.city || "Lisbon")));
});

// Paywalled, but payTo is the low-reputation attacker address.
app.get("/sketchy/premium", paywall(PRICES.sketchyPremium), (_req, res) => {
  res.json({ feed: "premium", note: "You should never see this: the vault blocks payments to this payee." });
});

app.listen(PORT, () => {
  log.info(`Leash demo API on http://localhost:${PORT} (vault ${vault}, ${deployment.network})`);
});
