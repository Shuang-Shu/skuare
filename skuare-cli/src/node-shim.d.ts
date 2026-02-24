declare const process: any;
declare const require: any;
declare const Buffer: any;

declare module "node:fs/promises" {
  export function readFile(...args: any[]): Promise<any>;
  export function writeFile(...args: any[]): Promise<any>;
  export function mkdir(...args: any[]): Promise<any>;
  export function readdir(...args: any[]): Promise<any>;
  export function stat(...args: any[]): Promise<any>;
}

declare module "node:path" {
  export function join(...parts: any[]): string;
  export function resolve(...parts: any[]): string;
  export function dirname(path: string): string;
  export function basename(path: string): string;
  export function relative(from: string, to: string): string;
  export const posix: { normalize(path: string): string };
}

declare module "node:os" {
  export function homedir(): string;
}

declare module "node:readline" {
  export function createInterface(...args: any[]): any;
  export function emitKeypressEvents(...args: any[]): any;
}

declare module "node:readline/promises" {
  export function createInterface(...args: any[]): any;
}

declare module "node:crypto" {
  export function randomBytes(...args: any[]): any;
  export function createHash(...args: any[]): any;
  export function createPrivateKey(...args: any[]): any;
  export function sign(...args: any[]): any;
}
