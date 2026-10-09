# Claude Instructions for MCP TestRail Project

## Project Overview
This is an MCP (Model Context Protocol) server for TestRail integration built with TypeScript. It runs over stdio only.

## Key Commands
- **Build**: `npm run build`
- **Test**: `npm test`
- **Format**: `npm run format`
- **Run**: `npm run start:stdio` (runs `dist/stdio.js`; build first)

## Project Structure
```
src/
├── client/       # TestRail API client implementation (axios)
├── server/       # MCP tool and resource registration
├── shared/       # Zod schemas and types
└── stdio.ts      # stdio entry point
```

## Important Notes
- Always run tests after making changes: `npm test`
- Use Biome for code formatting: `npm run format`
- Node.js version requirement: >= 20.18.1 (see `engines` in package.json)
- The project uses ES modules (`"type": "module"`)
- Dependencies install from registry.npmjs.org; use `npm ci` so lockfile integrity hashes are enforced

## Environment Variables Required
- `TESTRAIL_URL`: Your TestRail instance URL
- `TESTRAIL_USERNAME`: TestRail username
- `TESTRAIL_API_KEY`: TestRail API key
