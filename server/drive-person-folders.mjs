import { createDriveReader, DriveError } from './drive.mjs';

export const normalizeDriveFolderName = value => (value ?? '').normalize('NFC').trim();

export function uniqueDrivePersonName(people, id) {
  const name = normalizeDriveFolderName(people.find(person => person.id === id)?.name);
  if (!name) throw new DriveError(404, '명부에서 이름을 확인할 수 없습니다.');
  if (people.filter(person => normalizeDriveFolderName(person.name) === name).length > 1) {
    throw new DriveError(409, '명부에 같은 이름이 있습니다. 사람별 Drive 폴더를 직접 연결해 주세요.');
  }
  return name;
}

export async function findDrivePersonFolder(name, scope, env = process.env, dependencies = {}) {
  const roots = [...new Set((env[`DRIVE_${scope}_ROOT_IDS`] ?? '').split(',').map(id => id.trim()).filter(Boolean))];
  if (!roots.length) return null;
  const path = (env[`DRIVE_${scope}_LOOKUP_PATH`] ?? '').split('/').map(normalizeDriveFolderName).filter(Boolean);
  if (path.length > 10) throw new DriveError(503, 'Drive 조회 경로는 10단계까지 설정할 수 있습니다.');
  const reader = id => createDriveReader({ ...env, DRIVE_TEST_FOLDER_ID: id }, dependencies);
  const findChildren = async (id, label) => (await reader(id).childFolders())
    .filter(folder => normalizeDriveFolderName(folder.name) === label);
  const searchRoots = await Promise.all(roots.map(async root => {
    await reader(root).assertRootAllowed([root], '설정한 Drive 루트 폴더를 확인해 주세요.');
    let parent = root;
    for (const segment of path) {
      const matches = await findChildren(parent, segment);
      if (matches.length > 1) throw new DriveError(409, '조회 경로에 같은 이름의 폴더가 여러 개 있습니다.');
      if (!matches.length) return [];
      parent = matches[0].id;
    }
    return findChildren(parent, normalizeDriveFolderName(name));
  }));
  const matches = [...new Set(searchRoots.flat().map(folder => folder.id))];
  if (matches.length > 1) throw new DriveError(409, '같은 이름의 Drive 폴더가 여러 개 있습니다. 사람별 폴더를 직접 연결해 주세요.');
  return matches[0] ?? null;
}
