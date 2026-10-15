// Private to one open recipient detail. Never persists image bytes in browser storage.
export function createDocumentImageCache(
  load: (endpoint: string, signal: AbortSignal) => Promise<Blob>,
  createUrl = (blob: Blob) => URL.createObjectURL(blob),
  revokeUrl = (url: string) => URL.revokeObjectURL(url)
) {
  const entries = new Map<string, { promise: Promise<string>; url?: string; controller: AbortController }>();
  return {
    peek(endpoint: string) { return entries.get(endpoint)?.url; },
    get(endpoint: string) {
      const existing = entries.get(endpoint);
      if (existing) return existing.promise;
      const controller = new AbortController();
      const entry = { controller, promise: Promise.resolve(''), url: undefined as string | undefined };
      entry.promise = Promise.resolve().then(() => load(endpoint, controller.signal)).then(blob => {
        if (controller.signal.aborted) throw new Error('이미지 읽기가 취소되었습니다.');
        entry.url = createUrl(blob);
        return entry.url;
      }).catch(error => {
        // An older request must not delete a newer retry after clear().
        if (entries.get(endpoint) === entry) entries.delete(endpoint);
        throw error;
      });
      entries.set(endpoint, entry);
      return entry.promise;
    },
    clear() {
      entries.forEach(entry => {
        entry.controller.abort();
        if (entry.url) revokeUrl(entry.url);
      });
      entries.clear();
    }
  };
}
export type DocumentImageCache = ReturnType<typeof createDocumentImageCache>;
