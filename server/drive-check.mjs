import { loadEnv } from './load-env.mjs';
import { createDriveReader } from './drive.mjs';
loadEnv(process.cwd());
try {
  const reader = createDriveReader();
  const listing = await reader.list();
  console.log(`Drive 연결 성공: 이미지 ${listing.files.length}개 · ${listing.sharedDrive ? 'Workspace 공유 드라이브' : '내 드라이브의 공유 폴더'}`);
  for (let index = 0; index < listing.files.length; index++) {
    const image = await reader.image(listing.files[index].id);
    console.log(`이미지 ${index + 1}: ${image.mimeType}, ${image.bytes.length} bytes 조회 성공`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
