// Minimal ambient types for Node's built-in experimental `node:sqlite`
// (@types/node@20 predates it). Runtime is Node 22.5+.
declare module "node:sqlite" {
  export interface Statement {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): any;
    all(...params: unknown[]): any[];
  }
  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
  }
}
