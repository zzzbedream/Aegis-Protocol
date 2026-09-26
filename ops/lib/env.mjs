/**
 * Configuration loading for the ops scripts. Secrets come from the environment only;
 * public addresses come from the deployment file written by DeployDemo.s.sol.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ADDRESS_FIELDS = ['processorEndpoint', 'teeAuthenticator', 'tokenAllowlist', 'usdc', 'zen', 'priceFeed', 'keeper', 'trigger'];

export const DEPLOYMENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'vela-app', 'trigger', 'deployments');

export function requireEnv(env, name) {
  const v = env[name];
  if (v === undefined || v === '') throw new Error(`Missing environment variable ${name}`);
  return v;
}

export function validateDeployment(d, { needApp = false } = {}) {
  if (!Number.isInteger(d?.chainId)) throw new Error('deployment: invalid chainId');
  for (const f of ADDRESS_FIELDS) {
    if (!ADDRESS.test(d[f] || '')) throw new Error(`deployment: invalid or missing ${f}`);
  }
  if (needApp && !/^\d+$/.test(String(d.applicationId ?? ''))) {
    throw new Error('deployment: missing applicationId (run deploy-app first)');
  }
  return d;
}

export function deploymentPath(chainId) {
  return join(DEPLOYMENTS_DIR, `${chainId}.json`);
}

export function loadDeployment(chainId, opts) {
  const raw = JSON.parse(readFileSync(deploymentPath(chainId), 'utf8'));
  return validateDeployment(raw, opts);
}

/** Returns a new deployment object with `patch` applied and persists it (never mutates the input). */
export function saveDeployment(d, patch) {
  const next = { ...d, ...patch };
  writeFileSync(deploymentPath(next.chainId), JSON.stringify(next, null, 2) + '\n');
  return next;
}
