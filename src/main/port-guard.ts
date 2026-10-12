import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

export async function assertPortAvailable(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use. K pi agent will not terminate an unknown process.`));
      } else {
        reject(error);
      }
    });
    probe.listen(port, "127.0.0.1", () => probe.close((error) => error ? reject(error) : resolve()));
  });
}

export async function waitForHttpReady(url: string, timeoutMs = 60_000, signal?: AbortSignal): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    try {
      const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(2_000)]) : AbortSignal.timeout(2_000);
      const response = await fetch(url, { signal: requestSignal });
      if (response.ok || response.status === 401) return;
      lastError = new Error(`Unexpected HTTP status ${response.status}`);
    } catch (error) {
      signal?.throwIfAborted();
      lastError = error;
    }
    try {
      await delay(300, undefined, { signal });
    } catch (error) {
      signal?.throwIfAborted();
      throw error;
    }
  }
  throw new Error(`Pi Web did not become ready at ${url}: ${String(lastError)}`);
}
