# Codex MCP - LLM Integration Guide

## Overview

Codex MCP provides two tools for AI-assisted coding tasks:
- `codex`: Start a new coding session
- `codex-reply`: Continue an existing conversation

## When to Use

Use Codex when:
- "review this code", "审查代码", "代码审核"
- "help me fix this bug", "修复这个bug"
- "explain this code", "解释这段代码"
- "refactor this function", "重构这个函数"
- "write tests for", "编写测试"
- "analyze the codebase", "分析代码库"

## Tool: `codex`

Start a new Codex session for coding tasks.

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | string | The task or question to ask Codex |

### Optional Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `cwd` | string | Working directory for the session | `"C:/projects/myapp"` |
| `model` | string | Model override | `"gpt-5.2-codex"` |
| `sandbox` | enum | Permission level | `"read-only"`, `"workspace-write"`, `"danger-full-access"` |
| `approval-policy` | enum | Command approval | `"untrusted"`, `"on-failure"`, `"on-request"`, `"never"` |

### Best Practices

1. **Always specify `cwd`** when working with a specific project
2. **Be specific in prompts** - include file paths when relevant
3. **Use `read-only` sandbox** for analysis/review tasks
4. **Use `workspace-write`** for code modifications

### Example Calls

```json
// Code review
{
  "prompt": "Review the code in src/ folder, focus on error handling and security",
  "cwd": "C:/projects/myapp",
  "sandbox": "read-only"
}

// Bug fix
{
  "prompt": "Fix the null pointer exception in UserService.java line 42",
  "cwd": "C:/projects/myapp",
  "sandbox": "workspace-write"
}

// Code analysis
{
  "prompt": "Analyze the architecture and suggest improvements",
  "cwd": "C:/projects/myapp",
  "sandbox": "read-only"
}
```

## Tool: `codex-reply`

Continue an existing Codex conversation.

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `threadId` | string | Thread ID from previous `codex` call |
| `prompt` | string | Follow-up message |

### When to Use

- Ask follow-up questions about previous analysis
- Request additional changes after initial fix
- Clarify or refine previous instructions

### Example

```json
{
  "threadId": "thread_abc123",
  "prompt": "Also add unit tests for the changes you made"
}
```

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `Upstream service unavailable` | Codex process not running | Wait and retry, or restart MCP server |
| `Upstream connection lost` | Codex process crashed | Restart MCP server |
| `Failed to send request` | Communication error | Retry the request |
| `Invalid working directory` | `cwd` path doesn't exist | Verify the path exists |
| `Permission denied` | Sandbox restrictions | Use appropriate sandbox level |

### Error Response Format

```json
{
  "error": {
    "code": -32603,
    "message": "Upstream service unavailable"
  }
}
```

### Retry Strategy

1. On transient errors (`-32603`): Wait 2-5 seconds, retry up to 3 times
2. On permission errors: Adjust sandbox/approval-policy settings
3. On path errors: Verify paths and retry

## Workflow Examples

### Code Review Workflow

```
1. Call `codex` with review prompt and target directory
2. Receive analysis with findings
3. If needed, call `codex-reply` for:
   - Clarification on specific issues
   - Additional areas to review
   - Suggested fixes
```

### Bug Fix Workflow

```
1. Call `codex` with bug description and cwd
2. Codex analyzes and proposes fix
3. Call `codex-reply` to:
   - Apply the fix
   - Request tests
   - Handle edge cases
```

### Refactoring Workflow

```
1. Call `codex` with refactoring goals
2. Review proposed changes
3. Call `codex-reply` to:
   - Proceed with changes
   - Modify approach
   - Handle additional files
```

## Tips for LLM Integration

1. **Extract thread IDs** from successful `codex` responses for follow-ups
2. **Parse structured output** - Codex returns markdown-formatted analysis
3. **Handle long-running tasks** - Complex tasks may take 30+ seconds
4. **Preserve context** - Use same threadId for related follow-ups
5. **Check cwd validity** before calling - avoid path errors

## Response Parsing

Successful responses contain:
- `threadId`: Save for follow-up calls
- Text content with analysis/code changes
- Tool call results (file reads, command outputs)

Parse the response to:
1. Extract and store `threadId`
2. Present analysis to user
3. Track any file modifications made
