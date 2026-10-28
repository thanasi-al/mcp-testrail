#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import "dotenv/config";
import { createTestRailClientFromEnv } from "./client/env.js";
import { registerAllTools } from "./server/api/index.js";

// Initialize TestRail client (validates TESTRAIL_* configuration)
const testRailClient = createTestRailClientFromEnv();

// Create McpServer
const server = new McpServer({
	name: "TestRail MCP Server",
	version: "1.0.0",
});

// Register all API tools
registerAllTools(server, testRailClient);

// Main execution
const main = async () => {
	try {
		console.error("Starting TestRail MCP Server (stdio mode)...");

		// Create and connect transport
		const transport = new StdioServerTransport();
		await server.connect(transport);

		console.error("TestRail MCP Server connected via stdio");
	} catch (error) {
		console.error("Error starting TestRail MCP Server:", error);
		process.exit(1);
	}
};

// Run the server
main();
