// Assignment files: the browser uploads straight to private storage with a short-lived URL from the API.
// Types and limits mirror apps/api/app/storage.py (the API enforces them; this only saves a wasted upload).
const MB = 1024 * 1024;
export const FILE_TYPES = {
  'audio/mpeg': ['audio', 25 * MB], 'audio/mp4': ['audio', 25 * MB], 'audio/x-m4a': ['audio', 25 * MB], 'audio/aac': ['audio', 25 * MB],
  'audio/ogg': ['audio', 25 * MB], 'audio/webm': ['audio', 25 * MB], 'audio/wav': ['audio', 25 * MB], 'audio/x-wav': ['audio', 25 * MB],
  'video/mp4': ['video', 300 * MB], 'video/webm': ['video', 300 * MB], 'video/quicktime': ['video', 300 * MB],
  'application/pdf': ['pdf', 20 * MB],
  'image/jpeg': ['image', 10 * MB], 'image/png': ['image', 10 * MB], 'image/webp': ['image', 10 * MB],
};
// Some systems report no type (or a generic one) for common files.
const BY_EXTENSION = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', webm: 'video/webm',
  mp4: 'video/mp4', mov: 'video/quicktime', pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const ACCEPT = [...Object.keys(FILE_TYPES), ...Object.keys(BY_EXTENSION).map((ext) => `.${ext}`)].join(',');

export function fileType(file) {
  const type = (file.type || '').split(';')[0].trim().toLowerCase();
  return FILE_TYPES[type] ? type : BY_EXTENSION[file.name.split('.').pop().toLowerCase()] || type;
}
export function checkFile(file) {
  const rule = FILE_TYPES[fileType(file)];
  if (!rule) return 'type';
  return file.size > rule[1] ? 'size' : null;
}
export const attachmentKind = (attachment) => attachment.kind === 'link' ? 'link' : FILE_TYPES[attachment.content_type]?.[0] || 'pdf';

export function formatSize(bytes, locale = 'en') {
  const [value, unit] = bytes >= MB ? [bytes / MB, 'megabyte'] : [Math.max(bytes, 1) / 1024, 'kilobyte'];
  return new Intl.NumberFormat(locale, { style: 'unit', unit, maximumFractionDigits: 1 }).format(value);
}

// API status for a failed file call, mapped to portal.assignments.errors keys.
export function fileErrorKey(result) {
  return { 409: 'limit', 413: 'size', 415: 'type', 502: 'storage', 503: 'storageOff' }[result.status] || 'upload';
}

// Start, PUT with progress, then confirm. A failed PUT removes the pending record.
export async function uploadFile(client, parent, file, onProgress, createXhr = () => new XMLHttpRequest()) {
  const started = await client.files.startUpload({ ...parent, name: file.name, content_type: fileType(file), size: file.size });
  if (!started.ok) return started;
  const { attachment, upload } = started.data;
  const sent = await new Promise((resolve) => {
    const xhr = createXhr();
    xhr.open(upload.method, upload.url);
    Object.entries(upload.headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
  if (!sent) { await client.files.remove(attachment.id); return { ok: false, status: 0, error: 'upload_failed' }; }
  return client.files.complete(attachment.id);
}
