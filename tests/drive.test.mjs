import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriveReader } from '../server/drive.mjs';
const folder = 'test_folder_12345';
const file = 'test_image_12345';
const env = { DRIVE_TEST_FOLDER_ID: folder };
function reader(handler) {
  return createDriveReader(env, { token: async () => 'test-token', fetch: async (url, options) => {
    assert.equal(url.origin, 'https://www.googleapis.com');
    assert.equal(url.searchParams.get('supportsAllDrives'), 'true');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return handler(url);
  } });
}
const json = (data) => new Response(JSON.stringify(data));
test('Drive lists configured folder with pagination and excludes unsupported files', async () => {
  const drive = reader((url) => {
    if (url.pathname.endsWith(folder)) return json({ mimeType: 'application/vnd.google-apps.folder', name: 'Test' });
    assert.equal(url.searchParams.get('q'), `'${folder}' in parents and trashed = false`);
    return url.searchParams.has('pageToken') ? json({ files: [{ id: file, name: '02', mimeType: 'image/png' }] }) : json({ nextPageToken: 'next', files: [{ id: 'other', mimeType: 'image/svg+xml' }] });
  });
  const result = await drive.list();
  assert.equal(result.files.length, 1); assert.equal(result.files[0].id, file);
});
test('Drive refuses files outside configured folder before downloading', async () => {
  let calls = 0;
  const drive = reader(() => { calls++; return json({ mimeType: 'image/png', parents: ['other_folder'] }); });
  await assert.rejects(drive.image(file), { status: 404 }); assert.equal(calls, 1);
});
test('Drive refuses invalid IDs without sending requests', async () => {
  const drive = reader(() => assert.fail('No request expected'));
  await assert.rejects(drive.image('../secret'), { status: 400 });
});
test('Drive rejects oversized and deleted files', async () => {
  for (const extra of [{ size: String(21 * 1024 * 1024) }, { trashed: true }]) {
    const drive = reader(() => json({ mimeType: 'image/png', parents: [folder], ...extra }));
    await assert.rejects(drive.image(file), { status: extra.trashed ? 404 : 413 });
  }
});
test('Drive returns allowed image bytes without exposing credentials', async () => {
  const drive = reader((url) => url.searchParams.get('alt') === 'media' ? new Response(new Uint8Array([1,2,3])) : json({ mimeType: 'image/png', parents: [folder], size: '3' }));
  const result = await drive.image(file); assert.equal(result.mimeType, 'image/png'); assert.deepEqual([...result.bytes], [1,2,3]);
});
test('Drive sanitizes upstream errors', async () => {
  const drive = reader(() => { throw new Error('private key secret'); });
  await assert.rejects(drive.list(), (error) => error.status === 502 && !error.message.includes('secret'));
});

test('Vercel JSON credentials override local paths and exclude supplied endpoints', async () => {
  const { getDriveAuthOptions } = await import('../server/drive.mjs');
  const key = { type: 'service_account', client_email: 'reader@test.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----\n', token_uri: 'https://untrusted.example', universe_domain: 'untrusted.example' };
  const options = getDriveAuthOptions({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(key), GOOGLE_APPLICATION_CREDENTIALS: '/local/path' });
  assert.equal(options.keyFile, undefined);assert.equal(options.credentials.client_email,key.client_email);
  assert.equal(options.credentials.token_uri,'https://oauth2.googleapis.com/token');
  assert.equal(options.credentials.universe_domain,undefined);
  assert.equal(getDriveAuthOptions({ GOOGLE_APPLICATION_CREDENTIALS: '/local/path' }).keyFile,'/local/path');
});
test('invalid deployment credentials fail closed without echoing private values', async () => {
  const { getDriveAuthOptions } = await import('../server/drive.mjs');
  for(const json of ['private-secret',JSON.stringify({ type:'external_account', private_key:'private-secret' }), 'null']) {
    assert.throws(()=>getDriveAuthOptions({GOOGLE_SERVICE_ACCOUNT_JSON:json,GOOGLE_APPLICATION_CREDENTIALS:'/fallback'}), error=>error.status===503&&!error.message.includes('private-secret'));
  }
});
