// Inspect ISO BMFF metadata in the Worker. Full bitstream decoding is a separate review step.
export async function inspectMp4(buffer, policy = {}) {
  const maxBytes = policy.maxBytes ?? 8 * 1024 * 1024;
  const maxSeconds = policy.maxSeconds ?? 60;
  if (!buffer.byteLength || buffer.byteLength > maxBytes) throw new Error('影片大小超出預審限制');
  const data = new DataView(buffer);
  const tag = offset => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
  function boxes(start, end) {
    const result = [];
    for (let offset = start; offset < end;) {
      if (end - offset < 8 || result.length >= 2048) throw new Error('MP4 結構不完整');
      const size = data.getUint32(offset);
      if (size < 8 || size > end - offset) throw new Error('MP4 區塊大小不合法');
      result.push({ type: tag(offset + 4), start: offset + 8, end: offset + size });
      offset += size;
    }
    return result;
  }
  function one(list, type, minimum = 0) {
    const matches = list.filter(box => box.type === type);
    if (matches.length !== 1 || matches[0].end - matches[0].start < minimum) throw new Error('MP4 缺少有效的 ' + type);
    return matches[0];
  }
  const children = box => boxes(box.start, box.end);
  const root = boxes(0, buffer.byteLength);
  if (root[0]?.type !== 'ftyp') throw new Error('檔案內容不是 MP4');
  one(root, 'ftyp', 8);
  one(root, 'mdat', 1);
  const movie = children(one(root, 'moov'));
  const video = [];
  for (const track of movie.filter(box => box.type === 'trak')) {
    const media = children(one(children(track), 'mdia'));
    if (tag(one(media, 'hdlr', 12).start + 8) === 'vide') video.push(media);
  }
  if (video.length !== 1) throw new Error('須有一條影片軌');
  const media = video[0];
  const timing = one(media, 'mdhd', 20);
  const version = data.getUint8(timing.start);
  if (version > 1 || (version === 1 && timing.end - timing.start < 32)) throw new Error('影片時間資料不合法');
  const clock = timing.start + (version === 1 ? 20 : 12);
  const ticks = version === 1 ? Number(data.getBigUint64(clock + 4)) : data.getUint32(clock + 4);
  const seconds = ticks / data.getUint32(clock);
  const tables = children(one(children(one(media, 'minf')), 'stbl'));
  const description = one(tables, 'stsd', 8);
  const entries = boxes(description.start + 8, description.end);
  if (data.getUint32(description.start + 4) !== 1 || entries.length !== 1) throw new Error('影片編碼描述不合法');
  if (!['avc1', 'avc3'].includes(entries[0].type)) throw new Error('須使用 H.264 編碼');
  const sample = one(entries, entries[0].type, 78);
  one(boxes(sample.start + 78, sample.end), 'avcC', 7);
  const width = data.getUint16(sample.start + 24);
  const height = data.getUint16(sample.start + 26);
  const resolutions = policy.resolutions ?? ['720x1280', '1080x1920'];
  if (!resolutions.includes(width + 'x' + height) || !Number.isFinite(seconds) || seconds <= 0 || seconds > maxSeconds) {
    throw new Error('影片解析度或長度超出預審限制');
  }
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return { mime_type: 'video/mp4', bytes: buffer.byteLength, codec: 'h264', width, height, seconds, sha256 };
}
