// The handful of Node built-ins the tests and scripts use, so the repo needs no @types packages.

declare module "node:test" {
  type Fn = (t?: unknown) => void | Promise<void>;
  export function test(name: string, fn: Fn): Promise<void>;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: Fn): void;
  export default test;
}

declare module "node:assert/strict" {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    match(value: string, pattern: RegExp, message?: string): void;
    throws(fn: () => unknown, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}

declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
  export function writeFileSync(path: string | URL, data: string): void;
  export function readdirSync(path: string | URL, options: { recursive: true }): string[];
  export function statSync(path: string | URL): { isFile(): boolean };
}

declare module "node:fs/promises" {
  export function readFile(path: string): Promise<Uint8Array>;
}

declare module "node:http" {
  interface Response { writeHead(status: number, headers?: Record<string, string>): Response; end(body?: string | Uint8Array): void }
  export function createServer(handler: (req: { url?: string }, res: Response) => void): { listen(port: number, host: string, ready: () => void): void };
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export function normalize(path: string): string;
  export function extname(path: string): string;
  export const sep: string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}

declare const process: { exitCode?: number; argv: string[]; env: Record<string, string | undefined>; stdout: { write(s: string): void } };
