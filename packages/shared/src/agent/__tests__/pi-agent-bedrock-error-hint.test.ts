import { describe, expect, it } from 'bun:test'
import { PiAgent } from '../pi-agent.ts'
import type { BackendConfig } from '../backend/types.ts'

function createConfig(runtime?: Record<string, unknown>): BackendConfig {
  return {
    provider: 'pi',
    workspace: {
      id: 'ws-test',
      name: 'Test Workspace',
      rootPath: '/tmp/craft-agent-test',
    } as any,
    session: {
      id: 'session-test',
      workspaceRootPath: '/tmp/craft-agent-test',
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    } as any,
    isHeadless: true,
    ...(runtime ? { runtime } : {}),
  } as BackendConfig
}

describe('PiAgent Bedrock error hint', () => {
  it('appends an actionable hint to opaque Bedrock validation errors', () => {
    const agent = new PiAgent(
      createConfig({ piAuthProvider: 'amazon-bedrock', awsRegion: 'ap-southeast-2' }),
    ) as any

    const out = agent.augmentBedrockErrorEvent({
      type: 'error',
      message: 'Validation error: 400: [object Object]',
    })

    expect(out.message).toContain('Validation error: 400: [object Object]')
    expect(out.message).toContain('permission boundary')
    expect(out.message).toContain('ap-southeast-2')

    agent.destroy()
  })

  it('does not double-append the hint', () => {
    const agent = new PiAgent(
      createConfig({ piAuthProvider: 'amazon-bedrock', awsRegion: 'us-east-1' }),
    ) as any

    const once = agent.augmentBedrockErrorEvent({ type: 'error', message: 'ValidationException: nope' })
    const twice = agent.augmentBedrockErrorEvent(once)
    expect(twice).toBe(once) // already hinted → returned unchanged

    agent.destroy()
  })

  it('leaves non-Bedrock error events unchanged', () => {
    const agent = new PiAgent(
      createConfig({ piAuthProvider: 'anthropic' }),
    ) as any

    const event = { type: 'error', message: 'Validation error: 400: [object Object]' }
    expect(agent.augmentBedrockErrorEvent(event)).toBe(event)

    agent.destroy()
  })

  it('leaves unrelated Bedrock errors (non-validation) unchanged', () => {
    const agent = new PiAgent(
      createConfig({ piAuthProvider: 'amazon-bedrock', awsRegion: 'ap-southeast-2' }),
    ) as any

    const event = { type: 'error', message: 'Service unavailable: 503' }
    expect(agent.augmentBedrockErrorEvent(event)).toBe(event)

    agent.destroy()
  })

  it('ignores non-error events', () => {
    const agent = new PiAgent(
      createConfig({ piAuthProvider: 'amazon-bedrock' }),
    ) as any

    const event = { type: 'text_delta', text: 'hi' }
    expect(agent.augmentBedrockErrorEvent(event)).toBe(event)

    agent.destroy()
  })
})
