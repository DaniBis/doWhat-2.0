declare module 'pg' {
	export interface PoolConfig {
		connectionString?: string;
		ssl?: unknown;
	}

	export class Pool {
		constructor(config?: PoolConfig);
		query: (queryText: string) => Promise<unknown>;
		end: () => Promise<void>;
	}

	const pg: {
		Pool: typeof Pool;
	};

	export default pg;
}
