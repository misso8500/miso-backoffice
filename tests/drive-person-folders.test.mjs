import test from 'node:test';
import assert from 'node:assert/strict';
import { findDrivePersonFolder, uniqueDrivePersonName } from '../server/drive-person-folders.mjs';

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
