import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { net, session } from "electron";

const execFileAsync = promisify(execFile);

export interface NetworkEnvironment {
  proxyUrl?: string;
  source: "environment" | "windows-system" | "direct";
}

function normalizeProxy(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Windows stores fixed proxy settings either as host:port or a semicolon
  // mapping such as "http=host:port;https=host:port".
  const byScheme = value.split(";").map((entry) => entry.trim());
  const https = byScheme.find((entry) => /^https=/i.test(entry))?.replace(/^https=/i, "");
  const http = byScheme.find((entry) => /^http=/i.test(entry))?.replace(/^http=/i, "");
  const selected = https ?? http ?? byScheme.find((entry) => !entry.includes("=")) ?? value;
  if (!selected || /^socks/i.test(selected)) return undefined;
  return /^[a-z]+:\/\//i.test(selected) ? selected : `http://${selected}`;
}

async function readWindowsFixedProxy(): Promise<string | undefined> {
  try {
    // Check ProxyEnable first: proxy clients (Clash, v2rayN, ...) leave the
    // ProxyServer value behind when they exit or crash. Trusting a stale
    // ProxyServer made the shell inject a dead proxy address into the Pi Web
    // child process, breaking every request until the client was restarted.
    const { stdout: enable } = await execFileAsync("reg.exe", [
      "query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyEnable"
    ], { windowsHide: true });
    if (!/ProxyEnable\s+REG_\w+\s+0x1\b/i.test(enable)) return undefined;
    const { stdout } = await execFileAsync("reg.exe", [
      "query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyServer"
    ], { windowsHide: true });
    const match = /ProxyServer\s+REG_\w+\s+(.+)$/mi.exec(stdout);
    return normalizeProxy(match?.[1]?.trim());
  } catch {
    return undefined;
  }
}

/**
 * Prefers an explicit standard proxy environment, then Windows fixed proxy.
 * PAC/WPAD is still honored by Electron's system proxy for updater traffic;
 * Node's HTTP_PROXY convention cannot safely represent arbitrary PAC rules.
 */
export async function resolveNetworkEnvironment(): Promise<NetworkEnvironment> {
  const explicit = normalizeProxy(process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY);
  if (explicit) return { proxyUrl: explicit, source: "environment" };
  const windowsProxy = await readWindowsFixedProxy();
  if (windowsProxy) return { proxyUrl: windowsProxy, source: "windows-system" };
  return { source: "direct" };
}

export async function configureElectronNetwork(network: NetworkEnvironment): Promise<void> {
  if (network.proxyUrl) {
    await session.defaultSession.setProxy({
      proxyRules: network.proxyUrl,
      proxyBypassRules: "<-loopback>;localhost;127.0.0.1"
    });
  } else {
    // Direct connections and VPN routes work without special configuration.
    // This also lets Electron honor a PAC/WPAD proxy configured in Windows.
    await session.defaultSession.setProxy({ mode: "system" });
  }
}

/** Electron net.fetch honors the session proxy configured above. */
export function networkFetch(url: string, init?: RequestInit): Promise<Response> {
  return net.fetch(url, init);
}
