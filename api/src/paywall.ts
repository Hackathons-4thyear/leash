import { randomBytes } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { formatUnits, isHex, type Hex } from "viem";
import { deployment, NONCE_TTL_SECONDS } from "./config";
import { log } from "./log";
import { verifyVaultPayment } from "./verify";

export type PaywallOptions = { price: bigint; payTo: Hex; description: string };

type Quote = {
  price: bigint;
  payTo: Hex;
  route: string;
  resource: string;
  description: string;
  expiresAt: number;
  used: boolean;
  /** Set while a verification is in flight, so two concurrent retries can't both succeed. */
  verifying: boolean;
};

/** Issued 402 nonces. In memory: a restart invalidates outstanding quotes. */
const quotes = new Map<string, Quote>();

export const formatPrice = (units: bigint) => `${formatUnits(units, deployment.usdcDecimals)} mUSDC`;

const routeOf = (req: Request) => req.baseUrl + req.path;
const resourceOf = (req: Request) => `${req.protocol}://${req.get("host")}${req.originalUrl}`;

function sweepExpired() {
  const now = Date.now();
  for (const [nonce, q] of quotes) if (q.expiresAt < now) quotes.delete(nonce);
}

function requirements(nonce: string, q: Quote) {
  return {
    scheme: "leash-vault",
    network: deployment.network,
    maxAmountRequired: q.price.toString(),
    asset: deployment.addresses.usdc,
    payTo: q.payTo,
    resource: q.resource,
    description: q.description,
    mimeType: "application/json",
    maxTimeoutSeconds: NONCE_TTL_SECONDS,
    extra: { nonce, vault: deployment.addresses.vault },
  };
}

function send402(res: Response, error: string, nonce: string, q: Quote) {
  res.status(402).json({ x402Version: 1, error, accepts: [requirements(nonce, q)] });
}

function issueQuote(req: Request, res: Response, opts: PaywallOptions, error = "Payment required") {
  sweepExpired();
  const nonce = randomBytes(16).toString("hex");
  const quote: Quote = {
    ...opts,
    route: routeOf(req),
    resource: resourceOf(req),
    expiresAt: Date.now() + NONCE_TTL_SECONDS * 1000,
    used: false,
    verifying: false,
  };
  quotes.set(nonce, quote);
  log.issued(req.originalUrl, formatPrice(opts.price), opts.payTo, nonce);
  send402(res, error, nonce, quote);
}

function decodeHeader(header: string): { txHash: Hex; nonce: string } | null {
  try {
    const { txHash, nonce } = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    if (typeof txHash !== "string" || !isHex(txHash) || txHash.length !== 66) return null;
    if (typeof nonce !== "string" || nonce.length === 0) return null;
    return { txHash, nonce };
  } catch {
    return null;
  }
}

/**
 * x402-style paywall settled through the Leash vault.
 * No X-PAYMENT -> 402 with a fresh nonce. X-PAYMENT = base64({txHash, nonce}) -> verified
 * onchain; on success the nonce is burned and the handler runs.
 */
export function paywall(opts: PaywallOptions): RequestHandler {
  return async (req, res, next) => {
    const header = req.get("X-PAYMENT");
    if (!header) return issueQuote(req, res, opts);

    const payment = decodeHeader(header);
    if (!payment) {
      log.rejected(req.originalUrl, "malformed X-PAYMENT header");
      return issueQuote(req, res, opts, "Malformed X-PAYMENT header");
    }

    const quote = quotes.get(payment.nonce);
    if (quote?.used) {
      log.replay(req.originalUrl, payment.nonce);
      return issueQuote(req, res, opts, "Nonce already used (replay refused)");
    }
    if (!quote || quote.expiresAt < Date.now()) {
      log.rejected(req.originalUrl, "unknown or expired nonce");
      return issueQuote(req, res, opts, "Unknown or expired nonce");
    }
    if (quote.route !== routeOf(req)) {
      log.rejected(req.originalUrl, `nonce was issued for ${quote.route}`);
      return issueQuote(req, res, opts, "Nonce was issued for a different resource");
    }
    if (quote.verifying) {
      log.replay(req.originalUrl, payment.nonce);
      return send402(res, "Payment for this nonce is already being verified", payment.nonce, quote);
    }

    quote.verifying = true;
    try {
      const result = await verifyVaultPayment(payment.txHash, {
        payTo: quote.payTo,
        amount: quote.price,
        nonce: payment.nonce,
      });
      if (!result.ok) {
        log.rejected(req.originalUrl, result.reason);
        return send402(res, result.reason, payment.nonce, quote);
      }
      quote.used = true;
      log.verified(req.originalUrl, `${formatPrice(result.amount)} (${result.kind})`, payment.txHash);
      const receipt = { txHash: payment.txHash, settled: true };
      res.setHeader("X-PAYMENT-RESPONSE", Buffer.from(JSON.stringify(receipt)).toString("base64"));
      next();
    } finally {
      quote.verifying = false;
    }
  };
}
