import { createDriveReader, DriveError } from './drive.mjs';
import { parseFolderId } from './recipient-documents.mjs';

const types = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const categories = [
  ['contract', /근로계약/],
  ['certificate', /요양보호사.*자격증/],
  ['health', /채용.*검진|건강검진/],
  ['criminal', /범죄경력/],
  ['disabilityAbuse', /장애인학대/],
  ['elderAbuse', /노인학대/]
];

export function classifyStaffDriveFile(file) {
  const category = text => categories.find(([, pattern]) => pattern.test(text.normalize('NFKC').replace(/[\s_-]/g, '')))?.[0];
  return category(file.name) || category(file.path || '') || '';
}

export async function staffDriveReader(value, env = process.env, dependencies = {}) {
  const folderId = parseFolderId(value);
  const roots = (env.DRIVE_STAFF_ROOT_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean);
  const allowed = (env.DRIVE_STAFF_FOLDER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean);
  if (!allowed.includes(folderId) && (!roots.length || roots.includes(folderId))) {
    throw new DriveError(403, '승인된 직원별 Drive 폴더를 선택해 주세요.');
  }
  const reader = createDriveReader({ ...env, DRIVE_TEST_FOLDER_ID: folderId, DRIVE_INCLUDE_SUBFOLDERS: 'true' }, { ...dependencies, fileTypes: types });
  await reader.assertRootAllowed(allowed.includes(folderId) ? [folderId] : roots,
    '승인된 직원 상위 폴더 안의 직원별 폴더를 선택해 주세요.');
  return reader;
}
