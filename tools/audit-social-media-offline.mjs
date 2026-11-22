#!/usr/bin/env node
// Offline evidence only: no network, D1, publishing, or approval writes.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const str = value => String(value ?? '').trim();
const sha = value => /^[0-9a-f]{64}$/i.test(str(value)) ? str(value).toLowerCase() : '';
const dhash = value => /^[0-9a-f]{16}$/i.test(str(value)) ? str(value).toLowerCase() : '';
const distance = (left, right) => {
  let bits = BigInt('0x' + left) ^ BigInt('0x' + right);
  let count = 0;
  while (bits) { bits &= bits - 1n; count++; }
  return count;
};
const source = (asset, i) => ({
  key: str(asset?.id) || ((str(asset?.archive || asset?.source_zip) || str(asset?.file || asset?.source_path)) ? str(asset?.archive || asset?.source_zip) + ':' + str(asset?.file || asset?.source_path) : 'asset-' + i),
  sha256: sha(asset?.sha256),
  dhash: dhash(asset?.dhash),
  role: str(asset?.role || asset?.source_kind || 'unverified'),
  archive: str(asset?.archive || asset?.source_zip),
  path: str(asset?.file || asset?.source_path)
});
// URL provenance is evidence of a GitHub path only, not image equality or approval.
const githubMediaPath = value => {
  try {
    const url = new URL(str(value));
    const prefix = '/xianjiawei/images/';
    if (url.protocol !== 'https:' || url.hostname !== 'ts15825868.github.io' || !url.pathname.startsWith(prefix)) return '';
    const path = decodeURIComponent(url.pathname.slice('/xianjiawei/'.length));
    return path.startsWith('images/') && !path.includes('..') && !path.includes('\\') ? path : '';
  } catch { return ''; }
};
const stamp = review => {
  const value = Date.parse(review?.created_at || review?.reviewed_at || '');
  return Number.isFinite(value) ? value : -Infinity;
};

export function auditSocialMediaOffline(input, threshold = 8) {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 64) throw Error('Invalid dHash threshold');
  const rawAssets = input?.assets ?? input?.media_assets ?? [];
  const posts = input?.posts ?? [];
  const reviews = input?.reviews ?? [];
  if (![rawAssets, posts, reviews].every(Array.isArray)) throw Error('assets, posts and reviews must be arrays');
  const assets = rawAssets.map(source);
  const assetPairs = [];
  for (let a = 0; a < assets.length; a++) {
    for (let b = a + 1; b < assets.length; b++) {
      const left = assets[a], right = assets[b];
      if (left.sha256 && left.sha256 === right.sha256) {
        assetPairs.push({ a: left.key, b: right.key, type: 'exact_sha256' });
      } else if (left.dhash && right.dhash) {
        const n = distance(left.dhash, right.dhash);
        if (n <= threshold) assetPairs.push({ a: left.key, b: right.key, type: 'visual_candidate', distance: n });
      }
    }
  }
  const latest = new Map();
  for (const review of reviews) {
    const id = str(review?.post_id), t = stamp(review), prev = latest.get(id);
    if (!id || !Number.isFinite(t)) continue;
    if (!prev || t > prev.time || (t === prev.time && str(review.id) > str(prev.review.id))) latest.set(id, { review, time: t });
  }
  const inventory = input?.github_media_source_inventory;
  if (inventory && !Array.isArray(inventory.media)) throw Error('github_media_source_inventory.media must be an array');
  const knownGithubMedia = new Map((inventory?.media ?? []).map(item => [str(item?.path), str(item?.git_blob_sha)]));
  const pending = [];
  for (const post of posts) {
    if (str(post?.status) !== 'pending_review') continue;
    const id = str(post.id), review = latest.get(id)?.review;
    const imageSha = sha(review?.image_sha256 || post?.image_sha256);
    const imageDhash = dhash(review?.image_dhash || post?.image_dhash);
    const matches = [];
    for (const asset of assets) {
      if (imageSha && imageSha === asset.sha256) matches.push({ asset: asset.key, type: 'exact_sha256' });
      else if (imageDhash && asset.dhash) {
        const n = distance(imageDhash, asset.dhash);
        if (n <= threshold) matches.push({ asset: asset.key, type: 'visual_candidate', distance: n });
      }
    }
    const githubSourcePath = githubMediaPath(post?.image_url);
    pending.push({
      post_id: id,
      github_source_path: githubSourcePath || null,
      github_inventory_path_match: githubSourcePath ? knownGithubMedia.has(githubSourcePath) : false,
      github_blob_sha: githubSourcePath && knownGithubMedia.has(githubSourcePath) ? knownGithubMedia.get(githubSourcePath) : null,
      has_dated_review: !!review,
      has_image_sha256: !!imageSha,
      has_image_dhash: !!imageDhash,
      asset_matches: matches,
      evidence_status: !review ? 'missing_review' : !imageSha ? 'missing_image_sha256' :
        matches.length ? 'candidate_found_not_approved' : 'not_matched_to_supplied_assets',
      release_allowed: false
    });
  }
  return {
    mode: 'offline_read_only', production_d1_queries: 0, publication_writes: 0,
    known_github_media_paths: knownGithubMedia.size,
    assets_checked: assets.length, assets_with_sha256: assets.filter(x => x.sha256).length,
    assets_with_dhash: assets.filter(x => x.dhash).length,
    similarity_threshold: threshold, asset_pairs: assetPairs,
    pending_posts_checked: pending.length, pending,
    historical_media_coverage: 'unverified_until_complete_178_asset_manifest_and_post_bindings',
    automatic_approval_permitted: false,
    warning: '相似候選不等於重複；無候選不等於完整歷史去重、圖文合規或發布授權通過。'
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw Error('Usage: node tools/audit-social-media-offline.mjs <sanitized-manifest.json>');
    const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    if (process.argv[3]) input.github_media_source_inventory = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    console.log(JSON.stringify(auditSocialMediaOffline(input), null, 2));
  } catch (error) { console.error('Offline media audit failed: ' + error.message); process.exitCode = 2; }
}
