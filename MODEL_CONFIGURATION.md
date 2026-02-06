# Model Configuration Guide

This guide explains how to configure different AI models in NanoClaw.

## Changes Made

The following files have been modified to support custom model configuration:

1. **`src/config.ts`** - Added model configuration environment variables
2. **`src/container-runner.ts`** - Updated to pass model environment variables to containers
3. **`container/agent-runner/src/index.ts`** - Updated to use model configuration from environment
4. **`.env`** - Added examples of model configuration options

## Using Different Claude Models

By default, NanoClaw uses `claude-sonnet-4-5-20250929`. To change the model, add one of these to your `.env` file:

```bash
# For Claude Opus (most capable, slower, more expensive)
CLAUDE_MODEL=claude-opus-4-1-20250805

# For Claude Sonnet (balanced - default)
CLAUDE_MODEL=claude-sonnet-4-5-20250929

# For Claude Haiku (fastest, cheapest, good for simple tasks)
CLAUDE_MODEL=claude-haiku-4-0-20250129
```

You can also set a fallback model:

```bash
CLAUDE_FALLBACK_MODEL=claude-sonnet-4-5-20250929
```

## Using 3rd Party Models (OpenAI, etc.)

NanoClaw now supports using OpenAI or any OpenAI-compatible API as the model provider.

**Important:** If `OPENAI_API_KEY` is set, it takes priority over Claude configuration.

### OpenAI Configuration

Add these to your `.env` file:

```bash
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4
```

### OpenAI-Compatible APIs

For other providers that support the OpenAI API format (like local models, Azure OpenAI, etc.):

```bash
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=your-model-name
OPENAI_BASE_URL=https://your-api-endpoint.com/v1
```

Examples:
- **Local models (Ollama, LM Studio):** Set `OPENAI_BASE_URL` to your local endpoint
- **Azure OpenAI:** Use Azure-specific endpoint URL
- **Other providers:** Use their OpenAI-compatible endpoint

## Rebuilding the Container

After modifying the `.env` file, you need to rebuild the container for changes to take effect:

```bash
# From the project root
cd container
container build -t nanoclaw-agent:latest .
# or use: docker build -t nanoclaw-agent:latest .
```

Then restart the NanoClaw service:

```bash
# If using launchd (macOS)
launchctl stop com.nanoclaw.agent
launchctl start com.nanoclaw.agent

# Or restart however you're running nanoclaw
```

## Verifying Configuration

To check which model is being used, look at the container logs:

```bash
# Check the logs directory in your main group folder
tail -f groups/main/logs/container-*.log
```

You should see a log line like:
- `Using Claude model: claude-opus-4-1-20250805`
- `Using OpenAI model configuration`

## Notes

- The model configuration is read from environment variables when the container starts
- All groups use the same model configuration (no per-group model settings)
- The `.env` file must be in the project root directory
- Only whitelisted environment variables are passed to containers for security

## Troubleshooting

**Model not changing:**
- Make sure you rebuilt the container after modifying `.env`
- Verify the environment variable is spelled correctly
- Check that the `.env` file is in the project root

**OpenAI not working:**
- Verify your API key is valid
- Check the base URL if using a custom endpoint
- Look at container logs for error messages

**Cost considerations:**
- Opus is significantly more expensive than Sonnet or Haiku
- Monitor your API usage if switching between models
- Consider using Haiku for simple tasks and Opus only when needed
