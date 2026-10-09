import axios, { AxiosInstance, AxiosError, AxiosResponse } from "axios";

// Custom error classes
export class TestRailError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TestRailError";
	}
}

export class TestRailAPIError extends TestRailError {
	constructor(
		public status: number,
		message: string,
		public data?: unknown,
	) {
		super(message);
		this.name = "TestRailAPIError";
	}
}

export class TestRailTimeoutError extends TestRailError {
	constructor(message = "Request timed out") {
		super(message);
		this.name = "TestRailTimeoutError";
	}
}

export class TestRailNetworkError extends TestRailError {
	constructor(message = "Network error occurred") {
		super(message);
		this.name = "TestRailNetworkError";
	}
}

/**
 * Converts an axios error into a TestRail error that carries the HTTP status
 * and TestRail's own error text (e.g. "Field :section_id is not a valid section.")
 */
export function toTestRailError(error: AxiosError): TestRailError {
	if (error.code === "ECONNABORTED") {
		return new TestRailTimeoutError();
	}
	if (!error.response) {
		return new TestRailNetworkError(
			error.message ? `Network error occurred: ${error.message}` : undefined,
		);
	}
	const status = error.response.status;
	const data = error.response.data;
	const detail =
		typeof (data as { error?: unknown })?.error === "string"
			? (data as { error: string }).error
			: undefined;
	const withDetail = (summary: string) =>
		detail ? `${summary} (${status}): ${detail}` : `${summary} (${status})`;

	switch (status) {
		case 400:
			return new TestRailAPIError(status, withDetail("Bad Request"), data);
		case 401:
			return new TestRailAPIError(
				status,
				withDetail("Authentication failed"),
				data,
			);
		case 403:
			return new TestRailAPIError(
				status,
				withDetail("Permission denied"),
				data,
			);
		case 404:
			return new TestRailAPIError(
				status,
				withDetail("Resource not found"),
				data,
			);
		case 429:
			return new TestRailAPIError(
				status,
				withDetail("Rate limit exceeded"),
				data,
			);
		default:
			if (status >= 500) {
				return new TestRailAPIError(
					status,
					withDetail("TestRail server error"),
					data,
				);
			}
			return new TestRailAPIError(
				status,
				withDetail(`Unknown error: ${detail ?? error.message}`),
				data,
			);
	}
}

// TestRail API client configuration interface
export interface TestRailClientConfig {
	baseURL: string;
	auth: {
		username: string;
		password: string;
	};
	timeout?: number;
	headers?: Record<string, string>;
}

/**
 * Base TestRail API client that handles configuration and common functionality
 */
export class BaseTestRailClient {
	protected client: AxiosInstance;

	constructor(config: TestRailClientConfig) {
		const headers = {
			"Content-Type": "application/json",
			...(config.headers || {}),
		};

		this.client = axios.create({
			baseURL: config.baseURL,
			headers,
			timeout: config.timeout ?? 30000,
			auth: config.auth,
		});
	}

	/**
	 * Set a custom header
	 */
	setHeader(name: string, value: string): void {
		this.client.defaults.headers.common[name] = value;
	}

	/**
	 * Wrapper for making HTTP requests with error handling
	 */
	protected async request<T>(
		method: "get" | "post" | "put" | "delete",
		url: string,
		data?: unknown,
	): Promise<T> {
		try {
			const response = await this.client.request<T>({
				method,
				url,
				data,
			});
			return response.data;
		} catch (error) {
			if (error instanceof TestRailError) {
				throw error;
			}
			if (error instanceof AxiosError) {
				throw toTestRailError(error);
			}
			throw new TestRailError(
				`Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
