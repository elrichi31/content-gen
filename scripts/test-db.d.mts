export function createTestDatabase(options?: { migrated?: boolean }): Promise<{
  url: string;
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  drop(): Promise<void>;
}>;
