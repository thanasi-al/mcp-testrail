#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook for TestRail write tools
 *
 * Reads the hook payload from stdin and always answers "ask". It names the
 * project, suite, section, case or run the call targets, so the approval
 * prompt shows names instead of bare IDs:
 * - updatedInput adds display-only "@" keys to the tool input, which the
 *   prompt lists with the other arguments. The MCP server's input validation
 *   strips them, so they never reach TestRail.
 * - permissionDecisionReason carries the same text, for prompts raised by
 *   the hook itself rather than by an ask rule.
 * It never answers "allow": failures still ask, with the error shown.
 */
import { createTestRailClientFromEnv } from "../client/env.js";
import {
	type ApprovalField,
	describeToolCallFields,
	formatDescription,
	withDisplayKeys,
} from "./describe.js";

// Keep lookups well inside the hook's timeout in settings.json
const LOOKUP_TIMEOUT_MS = 8000;

function ask(reason: string, updatedInput?: Record<string, unknown>): void {
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "ask",
				permissionDecisionReason: reason,
				// updatedInput replaces the whole input, so it is only sent when
				// built from the original input
				...(updatedInput ? { updatedInput } : {}),
			},
		}),
	);
}

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString("utf-8");
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
	let payload: { tool_name?: unknown; tool_input?: unknown };
	try {
		payload = JSON.parse(await readStdin());
	} catch (error) {
		ask(`TestRail approval context unavailable: ${errorText(error)}`);
		return;
	}

	const toolName =
		typeof payload.tool_name === "string" ? payload.tool_name : "unknown";
	const input =
		payload.tool_input && typeof payload.tool_input === "object"
			? (payload.tool_input as Record<string, unknown>)
			: {};

	try {
		const client = createTestRailClientFromEnv(LOOKUP_TIMEOUT_MS);
		const description = await describeToolCallFields(client, toolName, input);
		ask(
			formatDescription(description),
			withDisplayKeys(input, description.fields),
		);
	} catch (error) {
		// Still strip any display keys from the input, so the prompt never
		// shows names the hook didn't look up itself
		const failure: ApprovalField[] = [
			{ label: "Lookup", value: `failed: ${errorText(error)}` },
		];
		ask(
			`TestRail approval context unavailable: ${errorText(error)}`,
			withDisplayKeys(input, failure),
		);
	}
}

main();
