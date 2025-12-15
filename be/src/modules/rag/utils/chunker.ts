// simple chunker: prefer splitting by paragraphs/sentences, limit chars per chunk
export function chunkText(content: string, maxChars = 1500) {
  if (!content) return [];
  // Normalize
  content = content.replace(/\r\n/g, "\n");
  const paragraphs = content
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];

  let buffer = "";
  for (const p of paragraphs) {
    if ((buffer + "\n\n" + p).length <= maxChars) {
      buffer = buffer ? buffer + "\n\n" + p : p;
    } else {
      if (buffer) {
        chunks.push(buffer);
        buffer = p;
      } else {
        // paragraph itself may be larger than maxChars -> break by sentences
        const sentences = p.split(/(?<=[.!?])\s+/);
        let sBuf = "";
        for (const s of sentences) {
          if ((sBuf + " " + s).trim().length <= maxChars) {
            sBuf = sBuf ? sBuf + " " + s : s;
          } else {
            if (sBuf) chunks.push(sBuf);
            sBuf = s;
          }
        }
        if (sBuf) {
          buffer = sBuf;
        } else {
          buffer = "";
        }
      }
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}
