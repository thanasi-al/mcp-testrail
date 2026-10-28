import type { TestRailClient } from "../client/api/index.js";

/**
 * The lookups describeToolCall needs, so tests can pass a fake
 */
export type LookupClient = {
	projects: Pick<TestRailClient["projects"], "getProject">;
	suites: Pick<TestRailClient["suites"], "getSuite">;
	sections: Pick<TestRailClient["sections"], "getSection">;
	cases: Pick<TestRailClient["cases"], "getCase">;
	runs: Pick<TestRailClient["runs"], "getRun">;
};

type Input = Record<string, unknown>;

// Guards against cycles or very deep trees when walking section parents
const MAX_SECTION_DEPTH = 20;
// How many cases to name when a call targets several
const MAX_NAMED_CASES = 3;

const TOOL_PREFIX = "mcp__testrail__";

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function asId(value: unknown): number | undefined {
	return typeof value === "number" && Number.isInteger(value)
		? value
		: undefined;
}

function asText(value: unknown): string | undefined {
	return typeof value === "string" && value !== "" ? value : undefined;
}

export type ApprovalField = {
	label: string;
	value: string;
	// True when the value only repeats an argument already in the tool input
	echo?: boolean;
};

export type ApprovalDescription = {
	tool: string;
	fields: ApprovalField[];
};

// Prefix for the display-only keys added to the tool input. The MCP server's
// input validation strips unknown keys, so these never reach a handler.
export const DISPLAY_KEY_PREFIX = "@";

/**
 * Describes the target of a TestRail write tool call
 *
 * Names and locations are looked up from TestRail by ID, so they show what
 * the IDs actually point to rather than what the caller says they are.
 * Lookup failures are reported inline and never throw.
 * @param client TestRail client used for read-only lookups
 * @param toolName Tool name, with or without the mcp__testrail__ prefix
 * @param input The tool's input arguments
 */
export async function describeToolCallFields(
	client: LookupClient,
	toolName: string,
	input: Input,
): Promise<ApprovalDescription> {
	const tool = toolName.startsWith(TOOL_PREFIX)
		? toolName.slice(TOOL_PREFIX.length)
		: toolName;

	// Each ID is looked up at most once per call
	const cache = new Map<string, Promise<unknown>>();
	const once = <T>(key: string, load: () => Promise<T>): Promise<T> => {
		if (!cache.has(key)) {
			cache.set(key, load());
		}
		return cache.get(key) as Promise<T>;
	};
	const project = (id: number) =>
		once(`project:${id}`, () => client.projects.getProject(id));
	const suite = (id: number) =>
		once(`suite:${id}`, () => client.suites.getSuite(id));
	const section = (id: number) =>
		once(`section:${id}`, () => client.sections.getSection(id));
	const testCase = (id: number) =>
		once(`case:${id}`, () => client.cases.getCase(id));
	const run = (id: number) => once(`run:${id}`, () => client.runs.getRun(id));

	// Full path from the suite root, marked when the section is top level
	async function sectionPath(id: number): Promise<string> {
		let current = await section(id);
		const names = [current.name];
		for (
			let depth = 0;
			current.parent_id && depth < MAX_SECTION_DEPTH;
			depth++
		) {
			current = await section(current.parent_id);
			names.unshift(current.name);
		}
		const path = names.join(" › ");
		return names.length === 1 ? `${path} [top level]` : path;
	}

	const fields: ApprovalField[] = [];
	const add = (label: string, value: string, echo = false) =>
		fields.push({ label, value, echo });

	async function addLookup(label: string, load: () => Promise<string>) {
		try {
			add(label, await load());
		} catch (error) {
			add(label, `(lookup failed: ${errorText(error)})`);
		}
	}

	// The project and suite are derived from the most specific ID given, so
	// they always describe where the call really lands
	let projectId = asId(input.projectId);
	let suiteId = asId(input.suiteId);
	const located: { label: string; id?: number }[] = [];

	const sectionId = asId(input.sectionId);
	const parentId = asId(input.parentId);
	const afterId = asId(input.afterId);
	const caseId = asId(input.caseId);
	const caseIds = Array.isArray(input.caseIds)
		? input.caseIds.map(asId).filter((id) => id !== undefined)
		: [];
	const runId = asId(input.runId);
	const planId = asId(input.planId);

	try {
		if (sectionId !== undefined) {
			suiteId ??= (await section(sectionId)).suite_id;
		} else if (parentId !== undefined) {
			suiteId ??= (await section(parentId)).suite_id;
		} else if (caseId !== undefined) {
			suiteId ??= (await testCase(caseId)).suite_id;
		} else if (caseIds.length > 0) {
			suiteId ??= (await testCase(caseIds[0])).suite_id;
		} else if (runId !== undefined) {
			const r = (await run(runId)) as {
				suite_id?: number;
				project_id?: number;
			};
			suiteId ??= r.suite_id;
			projectId ??= r.project_id;
		}
		if (suiteId !== undefined) {
			projectId ??= (await suite(suiteId)).project_id;
		}
	} catch {
		// Reported on the individual lines below
	}

	if (projectId !== undefined) {
		const id = projectId;
		await addLookup("Project", async () => {
			const p = await project(id);
			return `${p.name} (#${id})`;
		});
	}
	if (suiteId !== undefined) {
		const id = suiteId;
		await addLookup("Suite", async () => {
			const s = await suite(id);
			return `${s.name} (#${id})`;
		});
	}
	if (sectionId !== undefined) {
		located.push({ label: "Section", id: sectionId });
	}
	if (parentId !== undefined) {
		located.push({ label: "Parent", id: parentId });
	} else if (tool === "addSection" || tool === "moveSection") {
		// No parent means the section is placed at the top of the suite
		located.push({ label: "Parent" });
	}
	if (afterId !== undefined) {
		located.push({ label: "After", id: afterId });
	}
	for (const { label, id } of located) {
		if (id === undefined) {
			add(label, "(root of suite)");
			continue;
		}
		await addLookup(label, async () => {
			const path = await sectionPath(id);
			return `${path} (#${id})`;
		});
	}

	if (caseId !== undefined) {
		await addLookup("Case", async () => {
			const c = await testCase(caseId);
			const path = await sectionPath(c.section_id);
			return `${c.title} (C${caseId}) in ${path}`;
		});
	}
	if (caseIds.length > 0) {
		const named = caseIds.slice(0, MAX_NAMED_CASES);
		const titles = await Promise.all(
			named.map(async (id) => {
				try {
					return `${(await testCase(id)).title} (C${id})`;
				} catch (error) {
					return `C${id} (lookup failed: ${errorText(error)})`;
				}
			}),
		);
		const more = caseIds.length - named.length;
		add(
			"Cases",
			`${caseIds.length} case(s): ${titles.join("; ")}${more > 0 ? `; +${more} more` : ""}`,
		);
	}
	if (runId !== undefined) {
		await addLookup("Run", async () => {
			const r = await run(runId);
			return `${r.name} (R${runId})`;
		});
	}
	if (planId !== undefined) {
		add("Plan", `#${planId}`);
	}

	const title = asText(input.title);
	const name = asText(input.name);
	const refs = asText(input.refs);
	if (title) {
		add("Title", `"${title}"`, true);
	}
	if (name) {
		add("Name", `"${name}"`, true);
	}
	if (refs) {
		// Updates replace refs, so show what is being overwritten
		if (tool === "updateCase" && caseId !== undefined) {
			let current = "(unknown)";
			try {
				current = (await testCase(caseId)).refs || "(none)";
			} catch {
				// Leave as unknown
			}
			add("Refs", `${refs}  (replaces current: ${current})`);
		} else if (tool === "updateCases") {
			add("Refs", `${refs}  (replaces each case's current refs)`);
		} else {
			add("Refs", refs, true);
		}
	}
	if (tool === "deleteSection" && input.soft !== true) {
		add(
			"Warning",
			"deletes the section, its subsections and every case in them",
		);
	}

	return { tool, fields };
}

/**
 * Formats a description as plain text, one field per line
 */
export function formatDescription(description: ApprovalDescription): string {
	return [
		`TestRail ${description.tool}`,
		...description.fields.map(
			({ label, value }) => `${`${label}:`.padEnd(9)} ${value}`,
		),
		"Names are looked up from TestRail by ID; title, name and refs are as requested.",
	].join("\n");
}

/**
 * Builds the text shown in the approval prompt for a TestRail write tool
 * @param client TestRail client used for read-only lookups
 * @param toolName Tool name, with or without the mcp__testrail__ prefix
 * @param input The tool's input arguments
 */
export async function describeToolCall(
	client: LookupClient,
	toolName: string,
	input: Input,
): Promise<string> {
	return formatDescription(
		await describeToolCallFields(client, toolName, input),
	);
}

/**
 * Returns the tool input with display-only keys naming the call's targets,
 * so the approval prompt's argument list shows names next to the IDs
 *
 * Any display keys already in the input are dropped first, so only values
 * looked up by the hook are shown. Fields that repeat an existing argument
 * (title, name, plain refs) are left out.
 * @param input The tool's original input arguments
 * @param fields Fields from describeToolCallFields, or a failure notice
 */
export function withDisplayKeys(input: Input, fields: ApprovalField[]): Input {
	const display: Input = {};
	for (const { label, value, echo } of fields) {
		if (!echo) {
			display[`${DISPLAY_KEY_PREFIX}${label.toLowerCase()}`] = value;
		}
	}
	const original = Object.fromEntries(
		Object.entries(input).filter(
			([key]) => !key.startsWith(DISPLAY_KEY_PREFIX),
		),
	);
	// Display keys first, so they lead the prompt's argument list
	return { ...display, ...original };
}
