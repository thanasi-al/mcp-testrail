# TestRail MCP Server

<a href="https://flatt.tech/oss/gmo/trampoline" target="_blank"><img src="https://flatt.tech/assets/images/badges/gmo-oss.svg" height="24px"/></a>

This Model Context Protocol (MCP) server provides tools for interacting with TestRail directly from Claude AI and other MCP-supported clients like Cursor. It allows you to manage test cases, projects, suites, runs, and more without leaving your conversation with the AI.

## Available Tools

The TestRail MCP server provides the following tools:

| Category | Tools |
|----------|-------|
| **Projects** | `getProjects`, `getProject` |
| **Suites** | `getSuites`, `getSuite`, `addSuite`, `updateSuite` |
| **Cases** | `getCase`, `getCases`, `addCase`, `updateCase`, `deleteCase`, `getCaseTypes`, `getCaseFields`, `copyToSection`, `moveToSection`, `getCaseHistory`, `updateCases`, `addBdd`, `getBdd` |
| **Sections** | `getSection`, `getSections`, `addSection`, `moveSection`, `updateSection`, `deleteSection` |
| **Runs** | `getRuns`, `getRun`, `addRun`, `updateRun` |
| **Tests** | `getTests`, `getTest` |
| **Results** | `getResults`, `getResultsForCase`, `getResultsForRun`, `addResultForCase`, `addResultsForCases` |
| **Plans** | `getPlans` |
| **Milestones** | `getMilestones` |
| **Shared Steps** | `getSharedSteps` |

## Usage

This fork is run from a local build of this repository. Do not use the published npm package (`npx @bun913/mcp-testrail`): it runs upstream code that has not been reviewed here.

### Build

```bash
npm ci --ignore-scripts   # install exact lockfile versions
npm run build             # compile src/ to dist/
```

`dist/stdio.js` is the entry point. It imports its dependencies from `node_modules/`, so run it from this checkout. Rebuild after every pull or merge.

### Configure

The server reads three environment variables:

| Variable | Value |
|----------|-------|
| `TESTRAIL_URL` | Your TestRail instance URL, e.g. `https://your-instance.testrail.io` |
| `TESTRAIL_USERNAME` | The TestRail user the server acts as |
| `TESTRAIL_API_KEY` | That user's API key |

Use a dedicated TestRail user whose role grants only the permissions you want the AI to have. To keep the API key out of MCP config files, set the variables in a launcher script that reads the key from a secret store, for example the macOS Keychain:

```bash
#!/bin/bash
export TESTRAIL_URL="https://your-instance.testrail.io"
export TESTRAIL_USERNAME="your-email@example.com"
export TESTRAIL_API_KEY="$(security find-generic-password -s testrail-mcp -a "$TESTRAIL_USERNAME" -w)"
exec /absolute/path/to/node /absolute/path/to/mcp-testrail/dist/stdio.js
```

### Connect

Claude Code:

```bash
claude mcp add testrail --scope user -- /absolute/path/to/run-local.sh
```

Other MCP clients:

```json
{
  "mcpServers": {
    "testrail": {
      "command": "/absolute/path/to/run-local.sh"
    }
  }
}
```

Keep the server name `testrail`. Permission rules such as `mcp__testrail__delete*` match on that name.

## Troubleshooting

- **`spawn node ENOENT` (commonly on macOS)**: your MCP host (Cursor, Claude Code, Claude Desktop, …) cannot find `node` at process-spawn time. The chat UI usually surfaces this as a generic "MCP server doesn't work" with no useful detail; the per-server log is the diagnostic source of truth.

  **Why it happens on macOS:** GUI apps launched from the Dock, Spotlight, or Finder inherit launchd's minimal `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`). If you installed Node via a version manager (`nvm`, `asdf`, `mise`, `fnm`, `Volta`) or Apple Silicon Homebrew (`/opt/homebrew/bin/`), `node` lives outside that PATH — only your shell startup file (`~/.zshrc` / `~/.bashrc`) adds it. Your terminal works because the shell ran the startup file; the GUI-app process never did.

  **Diagnose** by checking the per-server log for `spawn node ENOENT`:

  - **Cursor:** `~/Library/Application Support/Cursor/logs/<session>/window<N>/exthost/anysphere.cursor-mcp/MCP <server>.log`
  - **Claude Code / Claude Desktop:** `~/Library/Logs/Claude/`

  **Fix** by using absolute paths in your launcher script, as in the example under [Configure](#configure). Run `which node` in your normal terminal to find the path:

  ```text
  /Users/you/.nvm/versions/node/v24.15.0/bin/node   # nvm
  /opt/homebrew/bin/node                            # Apple Silicon Homebrew
  /usr/local/bin/node                               # Intel Homebrew / system Node
  ```

  Restart your MCP client after the change.

- **Authentication issues**: Check your TestRail API credentials.
- **Your conversation is too long**: Use `limit` and `offset` parameters for test cases and sections to paginate results.
- **HTTP 400 errors when creating/updating test cases**: TestRail projects have different templates, custom fields, and required fields. This MCP server passes your parameters directly to the TestRail API — it does not validate or transform them. If you encounter 400 errors, define your project's rules in `CLAUDE.md` or `AGENTS.md` so the LLM sends the correct parameters. For example:

  ```markdown
  # TestRail Rules for This Project
  - Project ID: 1
  - Always use template 2 (Separated Steps) when creating test cases
    - Use `customStepsSeparated` (array of step objects)
    - Do NOT send `customSteps` or `customExpected` with template 2
  - Required custom fields: custom_automation_type (default: 0)
  - Call `getCaseFields` at the start of a session to check available fields
  ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgements

- [TestRail API](https://docs.testrail.techmatrix.jp/testrail/docs/702/api/)
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)

