import * as net from "node:net";

export type TailBuffer = {
  push(chunk: string): void;
  read(): string;
};

export function createTailBuffer(maxChars: number): TailBuffer {
  let buf = "";
  return {
    push(chunk: string) {
      buf += chunk;
      if (buf.length > maxChars) {
        buf = buf.slice(buf.length - maxChars);
      }
    },
    read() {
      return buf;
    },
  };
}

export async function waitForPortOpen(
  host: string,
  port: number,
  timeoutMs: number
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port });
      const done = (result: boolean) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(result);
      };
      socket.once("connect", () => done(true));
      socket.once("error", () => done(false));
      socket.setTimeout(500, () => done(false));
    });
    if (ok) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * Wait for the preferred port to become free, retrying for up to {@link timeoutMs}.
 * This avoids picking a random port when a recently-killed gateway hasn't released
 * the port yet (race between process kill and OS socket teardown).
 */
export async function pickPort(preferred: number, timeoutMs = 3000): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortFree(preferred)) {
      return preferred;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.warn(
    `[pickPort] preferred port ${preferred} still occupied after ${timeoutMs}ms — using it anyway (gateway will bind or fail)`
  );
  return preferred;
}
