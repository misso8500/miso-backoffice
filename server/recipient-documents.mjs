import { randomUUID } from 'node:crypto';
import { createDriveReader, DriveError } from './drive.mjs';
const kinds = new Set(['identity', 'recognition', 'plan', 'equipment']);
export function parseFolderId(value) {
  if (typeof value !== 'string') throw new DriveError(400, '폴더 링크를 입력해 주세요.');
  let id = value.trim();
  if (id.startsWith('https://')) {
    let url; try { url = new URL(id); } catch { throw new DriveError(400, '폴더 링크를 확인해 주세요.'); }
    if (url.hostname !== 'drive.google.com') throw new DriveError(400, 'Google Drive 폴더 링크를 입력해 주세요.');
    id = /^\/drive\/folders\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)?.[1] ?? '';
  }
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new DriveError(400, '폴더 링크를 확인해 주세요.');
  return id;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0,10) === value;
}
export function normalizeDocuments(body) {
  if (!body || !Array.isArray(body.periods) || !Array.isArray(body.pages) || body.periods.length > 50 || body.pages.length > 300) throw new DriveError(400, '서류 입력 내용을 확인해 주세요.');
  const periodIds = new Set(), ranges = new Set(), files = new Set(), orders = new Set();
  const periods = body.periods.map((p) => {
    if (!p || typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(p.id) || periodIds.has(p.id) || !date(p.startDate) || !date(p.endDate) || p.startDate > p.endDate || ranges.has(`${p.startDate}/${p.endDate}`)) throw new DriveError(400, '인정 기간의 날짜나 중복을 확인해 주세요.');
    periodIds.add(p.id); ranges.add(`${p.startDate}/${p.endDate}`);
    return { id: p.id, startDate: p.startDate, endDate: p.endDate };
  });
  const pages = body.pages.map((p) => {
    if (!p || typeof p.fileId !== 'string' || !/^[A-Za-z0-9_-]{10,200}$/.test(p.fileId) || files.has(p.fileId) || !kinds.has(p.kind) || !Number.isInteger(p.order) || p.order < 1 || p.order > 300) throw new DriveError(400, '서류 종류, 파일 중복, 쪽 순서를 확인해 주세요.');
    const periodId = p.kind === 'identity' ? '' : p.periodId;
    if (p.kind !== 'identity' && !periodIds.has(periodId)) throw new DriveError(400, '서류의 인정 기간을 선택해 주세요.');
    const key = `${p.kind}/${periodId}/${p.order}`;
    if (orders.has(key)) throw new DriveError(400, '같은 서류 묶음 안에서 쪽 번호가 중복됩니다.');
    files.add(p.fileId); orders.add(key);
    return { fileId: p.fileId, kind: p.kind, periodId, order: p.order };
  });
  return { folderId: parseFolderId(body.folderId), periods, pages };
}
export function recipientReader(folderId, env = process.env, dependencies = {}) {
  const allowed = (env.DRIVE_RECIPIENT_FOLDER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const roots = (env.DRIVE_RECIPIENT_ROOT_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(folderId) && !roots.length) throw new DriveError(403, '수급자 서류의 상위 폴더가 아직 승인되지 않았습니다. 관리자에게 폴더 등록을 요청해 주세요.');
  if (roots.some(id => !/^[A-Za-z0-9_-]{10,200}$/.test(id))) throw new DriveError(503, '서버의 수급자 상위 폴더 설정을 확인해 주세요.');
  const reader = createDriveReader({ ...env, DRIVE_TEST_FOLDER_ID: folderId, DRIVE_INCLUDE_SUBFOLDERS: 'true' }, dependencies);
  if (allowed.includes(folderId)) return reader;
  // Validate again on every API request, including saved images: moved folders lose access.
  let check;
  const approve = () => check ??= reader.assertRootAllowed(roots);
  return {
    async tree() { await approve(); return reader.tree(); },
    async image(id) { await approve(); return reader.image(id); }
  };
}
// Caller must authenticate before entering. Repository adapters provide atomic version checks.
export async function handleRecipientDocuments(request, response, sendJson, store, dependencies = {}) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const match = /^\/api\/recipients\/([^/]+)\/documents(?:\/(candidates|images\/([A-Za-z0-9_-]+)))?$/.exec(url.pathname);
  if (!match) return false;
  response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const id = decodeURIComponent(match[1]);
    if (!await store.exists(id)) throw new DriveError(404, '수급자를 찾을 수 없습니다.');
    const saved = await store.get(id);
    const reader = dependencies.reader ?? recipientReader;
    if (request.method === 'GET' && !match[2]) {
      sendJson(response, 200, saved ?? { folderId: '', periods: [], pages: [], version: null });
    } else if (request.method === 'GET' && match[2] === 'candidates') {
      const folderId = parseFolderId(url.searchParams.get('folderId') || saved?.folderId || '');
      sendJson(response, 200, await reader(folderId).tree());
    } else if (request.method === 'GET' && match[3]) {
      const candidateFolder = url.searchParams.get('folderId');
      if (!candidateFolder && !saved?.pages.some(p => p.fileId === match[3])) throw new DriveError(404, '연결된 서류가 아닙니다.');
      const folderId = parseFolderId(candidateFolder || saved?.folderId || '');
      const image = await reader(folderId).image(match[3]);
      response.writeHead(200, { 'Content-Type': image.mimeType, 'Content-Length': image.bytes.length }); response.end(image.bytes);
    } else if (request.method === 'PUT' && !match[2]) {
      let raw = ''; for await (const chunk of request) { raw += chunk.toString(); if (Buffer.byteLength(raw) > 200000) throw new DriveError(413, '입력 내용이 너무 큽니다.'); }
      let body; try { body = JSON.parse(raw); } catch { throw new DriveError(400, '입력 내용을 확인해 주세요.'); }
      const normalized = normalizeDocuments(body);
      if ((body.version ?? null) !== (saved?.version ?? null)) throw new DriveError(409, '다른 사용자가 서류 연결을 변경했습니다. 다시 불러온 뒤 확인해 주세요.');
      const tree = await reader(normalized.folderId).tree();
      const lookup = new Map(tree.files.map(f => [f.id, f]));
      normalized.pages = normalized.pages.map(p => {
        const file = lookup.get(p.fileId);
        if (!file) throw new DriveError(400, '폴더에서 찾을 수 없는 파일이 있습니다. 목록을 다시 불러와 주세요.');
        return { ...p, name: file.name };
      });
      const next = { ...normalized, version: randomUUID(), updatedAt: new Date().toISOString() };
      await store.save(id, next, saved?.version ?? null);
      sendJson(response, 200, next);
    } else throw new DriveError(405, '지원하지 않는 요청입니다.');
  } catch (error) {
    const conflict = error.code === '23505' || error.code?.startsWith('SQLITE_CONSTRAINT');
    sendJson(response, error instanceof DriveError ? error.status : conflict ? 409 : 500, { error: error instanceof DriveError ? error.message : conflict ? '이미 다른 수급자에게 연결된 폴더입니다.' : '서류 연결을 처리하지 못했습니다.' });
  }
  return true;
}
