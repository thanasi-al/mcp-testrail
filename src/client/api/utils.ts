import { AxiosError } from "axios";
import { TestRailError, toTestRailError } from "./baseClient.js";

/**
 * Detects an axios error by shape rather than instanceof, so errors from a
 * different axios copy (or a mocked one) are still recognised
 */
function isAxiosLikeError(error: unknown): error is AxiosError {
	if (typeof error !== "object" || error === null) {
		return false;
	}
	const candidate = error as Partial<AxiosError>;
	return (
		candidate.isAxiosError === true ||
		typeof candidate.response?.status === "number"
	);
}

/**
 * Handles API errors with better context
 * @param error The error object from catch
 * @param message Context message describing the failed operation
 * @returns Error whose message includes the context, HTTP status, and TestRail's error text
 */
export function handleApiError(error: unknown, message: string): Error {
	if (error instanceof TestRailError) {
		return error;
	}

	if (isAxiosLikeError(error)) {
		const testRailError = toTestRailError(error);
		testRailError.message = `${message}: ${testRailError.message}`;
		return testRailError;
	}

	if (error instanceof Error) {
		return error;
	}

	// For non-Error objects, create a new Error
	return new Error(`${message}: ${String(error)}`);
}
