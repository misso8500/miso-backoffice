import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyStaffDriveFile, staffDriveReader } from '../server/staff-drive-documents.mjs';

test('staff Drive checks six document categories using filenames and subfolders', () => {
  for (const [name, path, kind] of [
    ['근로 계약서 3부.jpg', '', 'contract'],
    ['요양보호사_자격증.png', '', 'certificate'],
    ['2.jpg', '채용검진 확인서/', 'health'],
    ['범죄 경력 회보서.pdf', '', 'criminal'],
    ['장애인 학대 회신서.pdf', '', 'disabilityAbuse'],
    ['노인학대관련범죄 회신서.pdf', '', 'elderAbuse'],
    ['사진.jpg', '', '']
  ]) {
    assert.equal(classifyStaffDriveFile({ name, path }), kind);
  }
});

test('staff Drive only serves image and PDF files belonging to the approved staff folder', async () => {
  const root = 'staff_root_12345';
  const folder = 'staff_folder_12345';
  const pdf = 'contract_pdf_12345';
  const outside = 'outside_pdf_12345';
  const unsupported = 'unsupported_file_12345';
  let downloads = 0;
  let folderParent = root;
  const env = { DRIVE_STAFF_ROOT_IDS: root };
  const deps = {
    token: async () => 'fake-token',
    fetch: async url => {
      const id = url.pathname.split('/').at(-1);
      if (url.searchParams.get('alt') === 'media') {
        assert.equal(id, pdf);
        downloads++;
        return new Response(new Uint8Array([1, 2]));
      }
      if (id === 'files') return Response.json({ files: [
        { id: pdf, name: '근로계약서.pdf', mimeType: 'application/pdf' },
        { id: unsupported, name: '다른 파일.html', mimeType: 'text/html' }
      ] });
      if (id === pdf || id === outside || id === unsupported) {
        return Response.json({ mimeType: id === unsupported ? 'text/html' : 'application/pdf', parents: [id === outside ? root : folder] });
      }
      return Response.json({ mimeType: 'application/vnd.google-apps.folder', parents: id === folder ? [folderParent] : [] });
    }
  };
  await assert.rejects(staffDriveReader(root, env, deps), { status: 403 });
  const reader = await staffDriveReader(folder, env, deps);
  assert.deepEqual((await reader.tree()).files.map(file => file.id), [pdf]);
  assert.equal((await reader.file(pdf)).mimeType, 'application/pdf');
  await assert.rejects(reader.file(outside), { status: 404 });
  await assert.rejects(reader.file(unsupported), { status: 404 });
  assert.equal(downloads, 1);
  folderParent = 'moved_folder_12345';
  await assert.rejects(staffDriveReader(folder, env, deps), { status: 403 });
});
