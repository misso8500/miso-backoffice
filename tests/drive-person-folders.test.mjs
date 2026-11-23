import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrivePersonFolderCache, findDrivePersonFolder, uniqueDrivePersonName } from '../server/drive-person-folders.mjs';

const root = 'root_folder_12345';
const caregivers = 'caregivers_12345';
const information = 'info_folder_12345';
const personal = 'person_folder_12345';
const folder = (id, name) => ({ id, name });

function mockedDrive(children) {
  const visited = [];
  return {
    visited,
    token: async () => 'test-token',
    fetch: async url => {
      const query = url.searchParams.get('q');
      if (!query) return Response.json({ mimeType: 'application/vnd.google-apps.folder' });
      const parent = /^'([^']+)' in parents/.exec(query)[1];
      visited.push(parent);
      return Response.json({ files: children[parent] ?? [] });
    }
  };
}

test('finds a person only under the configured relative path and normalizes Korean names', async () => {
  const drive = mockedDrive({
    [root]: [folder(caregivers, '2.요양보호사'), folder('other_person_12345', '김미소')],
    [caregivers]: [folder(information, '요양보호사 정보')],
    [information]: [folder(personal, '김미소'.normalize('NFD'))]
  });
  const env = { DRIVE_STAFF_ROOT_IDS: root, DRIVE_STAFF_LOOKUP_PATH: '2.요양보호사/요양보호사 정보' };
  assert.equal(await findDrivePersonFolder('김미소', 'STAFF', env, drive), personal);
  assert.deepEqual(drive.visited, [root, caregivers, information]);
  assert.equal(await findDrivePersonFolder('김미', 'STAFF', env, drive), null);
});

test('uses the root directly when the relative path is blank and rejects ambiguous folders or people', async () => {
  const env = { DRIVE_RECIPIENT_ROOT_IDS: root };
  const person = folder(personal, '김미소');
  assert.equal(await findDrivePersonFolder('김미소', 'RECIPIENT', env, mockedDrive({ [root]: [person] })), personal);
  await assert.rejects(findDrivePersonFolder('김미소', 'RECIPIENT', env, mockedDrive({
    [root]: [person, folder('duplicate_person_12345', '김미소')]
  })), { status: 409 });
  assert.throws(() => uniqueDrivePersonName([{ id: 'a', name: '김미소' }, { id: 'b', name: ' 김미소 ' }], 'a'), { status: 409 });
});

test('folder cache coalesces concurrent requests and expires successful matches', async () => {
  let calls = 0;
  let time = 0;
  const resolve = createDrivePersonFolderCache({ now: () => time, resolve: async () => {
    calls++;
    return personal;
  } });
  const env = { DRIVE_STAFF_ROOT_IDS: root };
  const requests = Array.from({ length: 4 }, () => resolve('staff-1', '김미소', 'STAFF', env));
  assert.deepEqual(await Promise.all(requests), Array(4).fill(personal));
  assert.equal(calls, 1);
  await resolve('staff-1', '김미소', 'STAFF', env);
  assert.equal(calls, 1);
  time += 30_000;
  await resolve('staff-1', '김미소', 'STAFF', env);
  assert.equal(calls, 2);
});

test('folder cache separates changes in identity or settings and retries misses and errors', async () => {
  let calls = 0;
  const resolve = createDrivePersonFolderCache({ resolve: async name => {
    calls++;
    if (name === 'error') throw new Error('Drive error');
    return name === 'missing' ? null : personal;
  } });
  const env = { DRIVE_STAFF_ROOT_IDS: root };
  await resolve('staff-1', 'start', 'STAFF', env);
  await resolve('staff-2', 'start', 'STAFF', env);
  await resolve('staff-1', 'changed', 'STAFF', env);
  await resolve('staff-1', 'start', 'STAFF', { ...env, DRIVE_STAFF_LOOKUP_PATH: 'another' });
  await resolve('staff-1', 'missing', 'STAFF', env);
  await resolve('staff-1', 'missing', 'STAFF', env);
  await assert.rejects(resolve('staff-1', 'error', 'STAFF', env), /Drive error/);
  await assert.rejects(resolve('staff-1', 'error', 'STAFF', env), /Drive error/);
  assert.equal(calls, 8);
});
