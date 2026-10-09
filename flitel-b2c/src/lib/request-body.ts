export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<{ input: unknown } | { tooLarge: true }> {
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let body = "";
  try {
    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        byteCount += value.byteLength;
        if (byteCount > maxBytes) {
          await reader.cancel();
          return { tooLarge: true };
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    }
  } finally {
    reader?.releaseLock();
  }
  try {
    return { input: JSON.parse(body) };
  } catch {
    return { input: null };
  }
}
