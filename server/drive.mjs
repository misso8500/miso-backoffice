import { GoogleAuth } from 'google-auth-library';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const validId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(value);
export class DriveError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function createDriveReader(env = process.env, dependencies = {}) {
  const folderId = env.DRIVE_TEST_FOLDER_ID;
  let auth;
  async function call(path, params = {}) {
    if (!validId(folderId)) throw new DriveError(503, 'Drive 테스트 폴더가 설정되지 않았습니다.');
    if (!dependencies.token && !env.GOOGLE_APPLICATION_CREDENTIALS) throw new DriveError(503, '서버의 Drive 인증 파일이 설정되지 않았습니다.');
    try {
      auth ??= new GoogleAuth({ keyFile: env.GOOGLE_APPLICATION_CREDENTIALS, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
      const token = dependencies.token ? await dependencies.token() : await auth.getAccessToken();
      const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
      Object.entries({ supportsAllDrives: 'true', ...params }).forEach(([key, value]) => url.searchParams.set(key, value));
      const response = await (dependencies.fetch ?? fetch)(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000), redirect: 'error' });
      if (!response.ok) {
        if (response.status === 404) throw new DriveError(404, '폴더 또는 파일을 찾을 수 없습니다. 서비스 계정의 공유 권한을 확인해 주세요.');
        throw new DriveError(502, 'Drive 조회에 실패했습니다. Drive API 활성화와 공유 권한을 확인해 주세요.');
      }
      return response;
    } catch (error) {
      if (error instanceof DriveError) throw error;
      throw new DriveError(502, 'Drive 인증 또는 연결에 실패했습니다. 서버의 인증 파일과 네트워크를 확인해 주세요.');
    }
  }
  async function metadata(id) {
    return (await call(`files/${id}`, { fields: 'id,name,mimeType,parents,trashed,size,driveId' })).json();
  }
  async function assertWithinRoot(file) {
    const seen = new Set();
    let current = file;
    for (let depth = 0; depth < 12; depth++) {
      if (current.trashed) break;
      if (current.parents?.includes(folderId)) {
        const root = await metadata(folderId);
        if (!root.trashed && root.mimeType === 'application/vnd.google-apps.folder') return;
        break;
      }
      const parent = current.parents?.[0];
      if (!validId(parent) || seen.has(parent)) break;
      seen.add(parent); current = await metadata(parent);
    }
    throw new DriveError(404, '연결한 폴더에서 조회할 수 없는 이미지입니다.');
  }
  return {
    async tree() {
      const root = await metadata(folderId);
      if (root.trashed || root.mimeType !== 'application/vnd.google-apps.folder') throw new DriveError(404, '폴더를 사용할 수 없습니다.');
      const queue = [{ id: folderId, path: '', depth: 0 }], seen = new Set(), files = [];
      let pages = 0;
      while (queue.length) {
        const folder = queue.shift();
        if (seen.has(folder.id)) continue;
        seen.add(folder.id);
        let pageToken = '';
        do {
          if (++pages > 100 || seen.size > 50 || folder.depth > 8) throw new DriveError(422, '폴더가 너무 큽니다. 사람별 폴더를 연결해 주세요.');
          const data = await (await call('files', { q: `'${folder.id}' in parents and trashed = false`, fields: 'nextPageToken,files(id,name,mimeType,size)', pageSize: '100', includeItemsFromAllDrives: 'true', orderBy: 'name', ...(pageToken ? { pageToken } : {}) })).json();
          for (const file of data.files ?? []) {
            if (file.mimeType === 'application/vnd.google-apps.folder') queue.push({ id: file.id, path: `${folder.path}${file.name}/`, depth: folder.depth + 1 });
            else if (imageTypes.has(file.mimeType)) files.push({ ...file, path: folder.path });
          }
          if (files.length > 300) throw new DriveError(422, '사람별 폴더에 이미지는 300장까지 지원합니다.');
          pageToken = data.nextPageToken;
        } while (pageToken);
      }
      return { folderName: root.name, files };
    },
    async list() {
      const folder = await metadata(folderId);
      if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder') throw new DriveError(404, '설정한 폴더를 사용할 수 없습니다.');
      const files = [];
      let pageToken = '';
      let pageCount = 0;
      do {
        if (++pageCount > 20) throw new DriveError(422, '테스트 폴더의 항목이 너무 많습니다. 작은 테스트 폴더를 사용해 주세요.');
        const data = await (await call('files', { q: `'${folderId}' in parents and trashed = false`, fields: 'nextPageToken,files(id,name,mimeType,size)', pageSize: '100', includeItemsFromAllDrives: 'true', orderBy: 'name', ...(pageToken ? { pageToken } : {}) })).json();
        files.push(...data.files.filter((file) => imageTypes.has(file.mimeType)).map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size })));
        pageToken = data.nextPageToken;
        if (files.length > 300) throw new DriveError(422, '테스트 폴더의 이미지가 너무 많습니다. 300장 이하로 준비해 주세요.');
      } while (pageToken);
      return { folderName: folder.name, sharedDrive: Boolean(folder.driveId), files };
    },
    async image(id) {
      if (!validId(id)) throw new DriveError(400, '잘못된 파일 식별자입니다.');
      const file = await metadata(id);
      // Never serve arbitrary IDs, shortcuts or files outside the configured test folder.
      if (file.trashed || !imageTypes.has(file.mimeType)) throw new DriveError(404, '조회할 수 없는 이미지입니다.');
      if (env.DRIVE_INCLUDE_SUBFOLDERS === 'true') await assertWithinRoot(file);
      else if (!file.parents?.includes(folderId)) throw new DriveError(404, '테스트 폴더에서 조회할 수 없는 이미지입니다.');
      const maximum = 20 * 1024 * 1024;
      if (Number(file.size) > maximum) throw new DriveError(413, '20MB 이하의 이미지만 미리볼 수 있습니다.');
      const response = await call(`files/${id}`, { alt: 'media' });
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > maximum) throw new DriveError(413, '20MB 이하의 이미지만 미리볼 수 있습니다.');
        chunks.push(Buffer.from(chunk));
      }
      return { bytes: Buffer.concat(chunks), mimeType: file.mimeType };
    }
  };
}
let reader;
// Both API adapters call this only after handleAuthRequest has verified the user.
export async function handleDriveRequest(request, response, sendJson) {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (!path.startsWith('/api/drive/')) return false;
  reader ??= createDriveReader();
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (request.method !== 'GET') throw new DriveError(405, '조회만 지원합니다.');
    if (path === '/api/drive/test-files') sendJson(response, 200, await reader.list());
    else {
      const match = /^\/api\/drive\/test-files\/([A-Za-z0-9_-]+)\/image$/.exec(path);
      if (!match) throw new DriveError(404, 'Not found');
      const image = await reader.image(match[1]);
      response.writeHead(200, { 'Content-Type': image.mimeType, 'Content-Length': image.bytes.length });
      response.end(image.bytes);
    }
  } catch (error) {
    sendJson(response, error instanceof DriveError ? error.status : 502, { error: error instanceof DriveError ? error.message : 'Drive 조회에 실패했습니다.' });
  }
  return true;
}
