/**
 * AWS credential-chain resolution
 *
 * Resolves AWS credentials from the canonical AWS SDK "node provider chain":
 *   environment variables → SSO → shared config/credentials profiles →
 *   web identity token → ECS container credentials (AWS_CONTAINER_CREDENTIALS_*)
 *   → EC2 instance metadata (IMDS).
 *
 * This is the implicit/ambient credential path used for Bedrock connections
 * configured with `authType: 'environment'` (and for Bedrock setup tests where
 * no static key is provided). Resolving here — in the host process, which owns
 * the ambient AWS environment — rather than relying on the Pi subprocess to
 * re-run the chain, means:
 *   - ECS container credential URLs and IMDS are resolved via the SDK's own
 *     HTTP client (reachable even when the subprocess has proxy env set that
 *     would otherwise route the link-local metadata endpoint through a proxy),
 *   - the resolved credentials (including the STS session token) are handed to
 *     the subprocess ready-to-use, and
 *   - each subprocess spawn re-runs the chain, so rotated ECS/STS credentials
 *     are picked up on the next spawn.
 *
 * The AWS SDK is loaded lazily so the dependency is only paid for by Bedrock
 * users, and any resolution failure fails soft (returns null) — callers then
 * fall back to letting the subprocess inherit the ambient AWS environment.
 */

import { debug } from '../utils/debug.ts';

export interface ResolvedAwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  /** Epoch millis when temporary credentials expire, if known. */
  expiration?: number;
}

/**
 * Resolve AWS credentials from the default Node provider chain.
 * Returns null when no credentials can be resolved (no ambient AWS config)
 * or when the AWS SDK is unavailable.
 */
export async function resolveAwsChainCredentials(): Promise<ResolvedAwsCredentials | null> {
  try {
    // Lazy import: only Bedrock/implicit-chain connections pull in the AWS SDK.
    const { defaultProvider } = await import('@aws-sdk/credential-provider-node');
    const provider = defaultProvider();
    const creds = await provider();
    if (!creds?.accessKeyId || !creds?.secretAccessKey) {
      debug('[aws-chain] Provider chain returned no usable credentials');
      return null;
    }
    return {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      expiration: creds.expiration ? creds.expiration.getTime() : undefined,
    };
  } catch (err) {
    debug(`[aws-chain] Failed to resolve AWS credential chain: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
