// Explicit rewrites are needed for nested routes in this Vite + Node deployment.
// Preserve query parameters (e.g. folderId) and pass through the existing auth gate.
export function createVercelHandler(handleRequest) {
  return async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const paths = url.searchParams.getAll('__miso_path');
    if (paths.length) {
      const path = paths[0];
      if (paths.length !== 1 || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path)) {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: '잘못된 API 경로입니다.' }));
        return;
      }
      url.pathname = `/api/${path}`;
      url.searchParams.delete('__miso_path');
      request.url = `${url.pathname}${url.search}`;
    }
    return handleRequest(request, response);
  };
}
