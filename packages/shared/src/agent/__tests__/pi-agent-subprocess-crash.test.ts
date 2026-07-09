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

describe('PiAgent subprocess startup-crash handling', () => {
  it('rejects the ready promise with the captured stderr when the subprocess dies before ready', async () => {
    const agent = new PiAgent(createConfig()) as any

    // Simulate a spawned-but-not-yet-ready subprocess.
    agent.subprocessBecameReady = false
    let captured: Error | null = null
    agent.subprocessReady = new Promise<void>((resolve: () => void, reject: (e: Error) => void) => {
      agent.subprocessReadyResolve = resolve
      agent.subprocessReadyReject = reject
    })
    ;(agent.subprocessReady as Promise<void>).catch((e: Error) => { captured = e })

    // The real crash writes this to stderr.
    agent.recordStderr('TypeError: webidl.util.markAsUncloneable is not a function.')

    // Subprocess exits with code 1 before ever signalling ready.
    agent.handleSubprocessExit(1, null)

    // Let the rejection microtask flush.
    await Promise.resolve()
    await Promise.resolve()

    expect(captured).toBeInstanceOf(Error)
    expect(captured!.message).toContain('failed to start')
    expect(captured!.message).toContain('code 1')
    expect(captured!.message).toContain('markAsUncloneable')

    agent.destroy()
  })

  it('does not reject the ready promise once the subprocess has become ready', async () => {
    const agent = new PiAgent(createConfig()) as any

    agent.subprocessBecameReady = true
    let rejectedWith: Error | null = null
    agent.subprocessReady = new Promise<void>((resolve: () => void, reject: (e: Error) => void) => {
      agent.subprocessReadyResolve = resolve
      agent.subprocessReadyReject = reject
    })
    ;(agent.subprocessReady as Promise<void>).catch((e: Error) => { rejectedWith = e })
    agent.subprocessReadyResolve()

    // A later exit (e.g. mid-turn crash) must not reject the already-resolved
    // ready promise via the startup path.
    agent.handleSubprocessExit(1, null)
    await Promise.resolve()
    await Promise.resolve()

    expect(rejectedWith).toBeNull()

    agent.destroy()
  })
})
