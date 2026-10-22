import type { IncomingMessage, ServerResponse } from 'node:http';

export declare const UPSTREAMS: string[];

/** Express-style middleware: serves /tiles/{z}/{x}/{y}.jpg from disk cache + upstreams. */
export declare function tileMiddleware(
  cacheDir: string,
): (req: IncomingMessage, res: ServerResponse) => void;
