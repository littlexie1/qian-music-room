import { openAsBlob } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelBaseUrl } from './settings.mjs';

const cacheDir = fileURLToPath(new URL('./private/uploads/', import.meta.url));
const inFlight = new Map();

export async function getUploadPolicy(apiKey, model, fetcher = fetch) {
  const endpoints = [
    `${(process.env.DASHSCOPE_UPLOAD_BASE_URL || new URL(modelBaseUrl()).origin).replace(/\/$/,'')}/api/v1/uploads`,
  ];
  for (const [index, endpoint] of endpoints.entries()) {
    const url = new URL(endpoint);
    url.searchParams.set('action', 'getPolicy');
    url.searchParams.set('model', model);
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
    if ((response.status === 404 || response.status === 405) && index === 0) continue;
    if (!response.ok) throw new Error(`Bailian upload-policy request failed (HTTP ${response.status}).`);
    const body = await response.json();
    const policy = body.data;
    if (!policy?.upload_host || !policy?.policy || !policy?.upload_dir) throw new Error('Bailian returned an invalid upload policy.');
    return policy;
  }
  throw new Error('Bailian upload-policy endpoint is unavailable.');
}

export async function uploadWithPolicy(path, policy, fetcher = fetch) {
  const host = new URL(policy.upload_host);
  if (host.protocol !== 'https:' || !host.hostname.endsWith('.aliyuncs.com')) throw new Error('Unexpected Bailian upload host.');
  const key = `${policy.upload_dir}/${randomUUID()}-${basename(path)}`;
  const form = new FormData();
  form.set('OSSAccessKeyId', policy.oss_access_key_id);
  form.set('policy', policy.policy);
  form.set('Signature', policy.signature);
  form.set('x-oss-object-acl', policy.x_oss_object_acl || 'private');
  form.set('x-oss-forbid-overwrite', String(policy.x_oss_forbid_overwrite ?? 'true'));
  form.set('key', key);
  form.set('success_action_status', '200');
  // File last; openAsBlob streams from disk instead of making a Base64 copy.
  form.set('file', await openAsBlob(path), basename(path));
  const response = await fetcher(host, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Bailian media upload failed (HTTP ${response.status}).`);
  await response.arrayBuffer();
  return `oss://${key}`;
}

export async function mediaUrl(path, model = 'qwen3.8-omni-flash') {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error('请在 .env 配置 DASHSCOPE_API_KEY。');
  const scope = createHash('sha256').update(`${apiKey}\0${model}\0${path}`).digest('hex');
  if (inFlight.has(scope)) return inFlight.get(scope);
  const work = (async () => {
    const cachePath = join(cacheDir, `${scope}.json`);
    try {
      const cached = JSON.parse(await readFile(cachePath, 'utf8'));
      if (cached.expiresAt > Date.now() && cached.url?.startsWith('oss://')) return cached.url;
    } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    const policy = await getUploadPolicy(apiKey, model);
    const url = await uploadWithPolicy(path, policy);
    await mkdir(cacheDir, { recursive: true });
    // Official expiry is 48 hours; refresh early to avoid expiry mid-request.
    await writeFile(cachePath, JSON.stringify({ url, expiresAt: Date.now() + 47 * 3600_000 }));
    return url;
  })();
  inFlight.set(scope, work);
  try { return await work; } finally { inFlight.delete(scope); }
}
