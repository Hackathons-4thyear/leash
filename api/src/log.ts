import pc from "picocolors";

const time = () => pc.dim(new Date().toISOString().slice(11, 19));
const tag = (color: (s: string) => string, label: string) => color(pc.bold(` ${label.padEnd(8)} `));

const print = (label: string, message: string) => console.log(`${time()} ${label} ${message}`);

export const log = {
  request: (method: string, url: string) => print(tag(pc.bgBlue, "REQ"), `${pc.bold(method)} ${url}`),
  issued: (resource: string, price: string, payTo: string, nonce: string) =>
    print(tag(pc.bgYellow, "402"), `${resource} ${pc.yellow(price)} → ${payTo} ${pc.dim(`nonce=${nonce}`)}`),
  verified: (resource: string, price: string, txHash: string) =>
    print(tag(pc.bgGreen, "PAID"), `${resource} ${pc.green(price)} settled via vault ${pc.dim(txHash)}`),
  rejected: (resource: string, reason: string) => print(tag(pc.bgRed, "REJECT"), `${resource} ${pc.red(reason)}`),
  replay: (resource: string, nonce: string) =>
    print(tag(pc.bgMagenta, "REPLAY"), `${resource} ${pc.magenta(`nonce ${nonce} already used, refusing`)}`),
  free: (resource: string, note: string) => print(tag(pc.bgCyan, "FREE"), `${resource} ${pc.cyan(note)}`),
  info: (message: string) => print(tag(pc.bgWhite, "INFO"), message),
};
