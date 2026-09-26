import "dotenv/config";
import { baseSepolia as deployment } from "@leash/shared";

export { deployment };

export const PORT = Number(process.env.PORT || 4021);
export const RPC_URL = process.env.RPC_URL || deployment.rpcUrl;
export const WEB_ORIGIN = "http://localhost:3000";

/** How long a 402 nonce stays valid (also advertised as maxTimeoutSeconds). */
export const NONCE_TTL_SECONDS = 900;
