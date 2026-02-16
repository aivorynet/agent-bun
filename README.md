# AIVory Monitor Bun Agent

Remote debugging with AI-powered fix generation for Bun runtime applications.

## Requirements

- Bun 1.0 or higher
- AIVory Monitor account with API key

## Installation

```bash
bun add @aivory/monitor-agent-bun
```

## Usage

### Basic Initialization

```typescript
import { init } from '@aivory/monitor-agent-bun';

init({
  apiKey: 'your-api-key',
  environment: 'production'
});
```

### Manual Exception Capture

Bun lacks runtime variable inspection, so you must explicitly pass local variables:

```typescript
import { captureException } from '@aivory/monitor-agent-bun';

try {
  const userId = '123';
  const data = fetchUserData(userId);
  processData(data);
} catch (error) {
  // Explicitly pass local variables for debugging context
  captureException(error, { userId: '123' }, { userId, data });
}
```

### Preload for Automatic Capture

Use Bun's preload to automatically capture unhandled exceptions:

```bash
bun --preload @aivory/monitor-agent-bun app.ts
```

Set configuration via environment variables when using preload:

```bash
AIVORY_API_KEY=xxx AIVORY_ENVIRONMENT=production bun --preload @aivory/monitor-agent-bun app.ts
```

### Set User Context

```typescript
import { setUser } from '@aivory/monitor-agent-bun';

setUser({
  id: 'user-123',
  email: 'user@example.com',
  username: 'john_doe'
});
```

## Configuration

Configuration can be provided via init options or environment variables:

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `AIVORY_API_KEY` | Required | Your AIVory Monitor API key |
| `AIVORY_BACKEND_URL` | `wss://api.aivory.net/ws/agent` | Backend WebSocket URL |
| `AIVORY_ENVIRONMENT` | `production` | Environment name (dev, staging, production) |
| `AIVORY_SAMPLING_RATE` | `1.0` | Exception sampling rate (0.0 - 1.0) |
| `AIVORY_MAX_DEPTH` | `10` | Maximum depth for variable capture |
| `AIVORY_MAX_STRING_LENGTH` | `1000` | Maximum string length to capture |
| `AIVORY_MAX_COLLECTION_SIZE` | `100` | Maximum array/object size to capture |
| `AIVORY_DEBUG` | `false` | Enable debug logging |

Example with custom configuration:

```typescript
import { init } from '@aivory/monitor-agent-bun';

init({
  apiKey: process.env.AIVORY_API_KEY,
  environment: 'staging',
  samplingRate: 0.5,  // Sample 50% of exceptions
  maxCaptureDepth: 5,
  debug: true
});
```

## How It Works

The Bun agent captures exceptions and streams debugging context to the AIVory Monitor backend:

1. **Process Event Hooks**: Attaches to Bun's `uncaughtException` and `unhandledRejection` events
2. **Native WebSocket**: Uses Bun's built-in WebSocket for efficient backend communication
3. **TypeScript Native**: No compilation step required, runs directly on Bun's TypeScript runtime
4. **Stack Trace Capture**: Automatically captures stack traces with file paths and line numbers
5. **Variable Context**: Captures local variables when explicitly provided via `captureException`

Unlike Node.js agents, Bun cannot inspect runtime variables automatically due to runtime limitations. Always pass local variables explicitly to `captureException` for full debugging context.

## Troubleshooting

### Agent Not Connecting

Check that your API key is valid and the backend URL is reachable:

```typescript
init({
  apiKey: 'your-key',
  debug: true  // Enable debug logging
});
```

### Missing Local Variables

Bun cannot automatically capture local variables. You must pass them explicitly:

```typescript
// Bad - no variable context
captureException(error);

// Good - full context
captureException(error, { requestId }, { userId, data, config });
```

### Exceptions Not Captured

Verify the agent is initialized before exceptions occur:

```typescript
import { init, isInitialized } from '@aivory/monitor-agent-bun';

init({ apiKey: 'xxx' });

if (isInitialized()) {
  console.log('Agent ready');
} else {
  console.error('Agent failed to initialize');
}
```

### High Memory Usage

Reduce capture depth and collection size:

```typescript
init({
  maxCaptureDepth: 3,
  maxCollectionSize: 50,
  maxStringLength: 500
});
```

## License

MIT
