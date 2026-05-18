// Decompress the gzip+base64 demo payload. Same implementation as the artifact.
// Browser support: Chrome 80+, Firefox 113+, Safari 16.4+. All evergreen.
export async function decompressPayload(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const blob = await new Response(stream).blob();
  const text = await blob.text();
  return JSON.parse(text);
}

// And the inverse — useful for ingest results returned by the server uncompressed.
export async function compressJson(value) {
  const raw = new TextEncoder().encode(JSON.stringify(value));
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
  const blob = await new Response(stream).blob();
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}
