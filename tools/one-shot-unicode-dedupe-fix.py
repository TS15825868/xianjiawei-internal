from pathlib import Path

for path in ('tools/build-social-batches-review-seed.mjs','src/publishing-review-gate-entry.js'):
    p=Path(path)
    s=p.read_text()
    s=s.replace("replace(/[\\s\\W_]+/gu,'')","replace(/[^\\p{L}\\p{N}]+/gu,'')")
    p.write_text(s)

print('PASS unicode-safe duplicate normalization patched')
