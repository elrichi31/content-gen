export const migrationsDir: string;
export function migrate(databaseUrl: string, options?: { direction?: "up" | "down"; count?: number; silent?: boolean }): Promise<{ name: string }[]>;
