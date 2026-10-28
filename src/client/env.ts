import { TestRailClient } from "./api/index.js";

/**
 * Creates a TestRail client from TESTRAIL_URL, TESTRAIL_USERNAME and
 * TESTRAIL_API_KEY
 * @param timeout Optional request timeout in milliseconds
 */
export function createTestRailClientFromEnv(timeout?: number): TestRailClient {
	if (
		!process.env.TESTRAIL_URL ||
		!process.env.TESTRAIL_USERNAME ||
		!process.env.TESTRAIL_API_KEY
	) {
		throw new Error(
			"TESTRAIL_URL, TESTRAIL_USERNAME, and TESTRAIL_API_KEY must be set",
		);
	}

	// Correct URL format: https://example.testrail.com/index.php?/
	const url = process.env.TESTRAIL_URL;
	const baseURL = url.endsWith("/index.php?/")
		? url
		: url.endsWith("/")
			? `${url}index.php?/`
			: `${url}/index.php?/`;

	return new TestRailClient({
		baseURL,
		auth: {
			username: process.env.TESTRAIL_USERNAME,
			password: process.env.TESTRAIL_API_KEY,
		},
		timeout,
	});
}
