import { describe, expect, it } from 'bun:test'
import { PiAgent } from '../pi-agent.ts'
import type { BackendConfig } from '../backend/types.ts'

function createConfig(): BackendConfig {
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
  }
}

describe('PiAgent Bedrock env handling', () => {
  it('buildAwsEnv uses AWS env only and never sets CLAUDE_CODE_USE_BEDROCK', async () => {
    const agent = new PiAgent(createConfig())

    const env = (await (agent as any).buildAwsEnv(
      {
        credential: {
          type: 'iam',
          accessKeyId: 'AKIA_TEST',
          secretAccessKey: 'secret',
          sessionToken: 'session',
          region: 'eu-central-1',
        },
      },
      { piAuthProvider: 'amazon-bedrock' },
    )) as Record<string, string>

    expect(env.AWS_ACCESS_KEY_ID).toBe('AKIA_TEST')
    expect(env.AWS_SECRET_ACCESS_KEY).toBe('secret')
    expect(env.AWS_SESSION_TOKEN).toBe('session')
    expect(env.AWS_REGION).toBe('eu-central-1')
    expect(env.AWS_BEDROCK_FORCE_HTTP1).toBe('1')
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined()

    agent.destroy()
  })

  it('buildAwsEnv returns empty env for non-Bedrock Pi providers', async () => {
    const agent = new PiAgent(createConfig())

    const env = (await (agent as any).buildAwsEnv(
      {
        credential: {
          type: 'iam',
          accessKeyId: 'AKIA_TEST',
          secretAccessKey: 'secret',
          region: 'eu-central-1',
        },
      },
      { piAuthProvider: 'anthropic' },
    )) as Record<string, string>

    expect(env).toEqual({})

    agent.destroy()
  })

  it('buildAwsEnv resolves the AWS credential chain for implicit/environment Bedrock auth', async () => {
    const agent = new PiAgent(createConfig())

    const prevKey = process.env.AWS_ACCESS_KEY_ID
    const prevSecret = process.env.AWS_SECRET_ACCESS_KEY
    const prevImds = process.env.AWS_EC2_METADATA_DISABLED
    // Ensure no ambient static keys so the chain-resolution branch is exercised,
    // and disable IMDS so resolution fails fast (no network wait) in CI.
    delete process.env.AWS_ACCESS_KEY_ID
    delete process.env.AWS_SECRET_ACCESS_KEY
    process.env.AWS_EC2_METADATA_DISABLED = 'true'

    // Assert the environment-auth branch runs without throwing and still forces
    // HTTP/1.1. Full ECS/IMDS resolution is covered by integration/manual testing.
    const env = (await (agent as any).buildAwsEnv(
      // piAuth is null for environment auth (no stored credential)
      null,
      { piAuthProvider: 'amazon-bedrock' },
    )) as Record<string, string>

    expect(env.AWS_BEDROCK_FORCE_HTTP1).toBe('1')
    // No static creds were stored and no ambient chain is configured in CI, so
    // no AWS_ACCESS_KEY_ID is injected — the subprocess falls back to inheriting
    // the ambient AWS environment.
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined()

    if (prevKey !== undefined) process.env.AWS_ACCESS_KEY_ID = prevKey
    if (prevSecret !== undefined) process.env.AWS_SECRET_ACCESS_KEY = prevSecret
    if (prevImds === undefined) delete process.env.AWS_EC2_METADATA_DISABLED
    else process.env.AWS_EC2_METADATA_DISABLED = prevImds

    agent.destroy()
  })
})
