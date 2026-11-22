#!/usr/bin/env node
// Reconcile previously saved official review receipts. No HTTP, DB, or publication calls.
// All outputs are read-only historical evidence, never approval or scheduling authority.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const requireCondition = (value, msg) => { if (!value) throw Error(msg); };

const source = {
  candidates: 'ops/social-pending-46-offline-evidence-source-v20261122.json',
  imageBinary: 'ops/social-46-offline-github-image-reconciliation-v20261122.json',
  copyAndVisual: 'ops/request-20261112-49-visual-evidence-write.json',
  publishedHistory: 'ops/receipts/20261112-owner-gap-current-copy-screen.json',
  archivedVisual: 'ops/receipts/20261112-owner-gap-current-image-screen.json',
};
const [candidates, binary, visual, history, archived] = Object.values(source).map(read);
const rows = candidates.candidates, binaryRows = binary.records, visualRows = visual.rows,
      historyRows = history.rows, archivedRows = archived.allPendingNearest;
requireCondition(Array.isArray(rows) && rows.length === 46, 'Missing 46 archived pending candidates');
requireCondition(Array.isArray(binaryRows) && binaryRows.length === 46, 'Missing 46 binary source matches');
requireCondition(binary.candidate_posts_with_exact_erp_file === 46 && binary.candidate_posts_missing_erp_file === 0, 'Incomplete original image restoration');
requireCondition(Array.isArray(visualRows) && visualRows.length === 49, 'Missing 49 archived visual records');
requireCondition(Array.isArray(historyRows) && historyRows.length === 49 && history.historyRows === 132, 'Historical published-copy receipt changed');
requireCondition(Array.isArray(archivedRows) && archivedRows.length === 49 && archived.pendingScanned === 49 && archived.referenceImages === 88, 'Archived image evidence changed');
requireCondition(history.source?.historicalMediaRecovered === 178 && history.source?.historicalMediaUnavailable === 15, 'Historical media coverage assumption changed');
const unique = values => new Map(values.map(record => [record.post_id ?? record.id, record]));
const indexed = {
 binary:unique(binaryRows), visual:unique(visualRows),
 history:unique(historyRows), archived:unique(archivedRows)
};
for (const [name, map] of Object.entries(indexed)) requireCondition(map.size === (name === 'binary' ? 46 : 49), 'Duplicate ID in '+ name);
const pairs = archived.imageNearPairs.filter(pair => rows.some(r => r.post_id === pair.current));
const findings = [];
for (const row of rows) {
  const id = row.post_id,
        src = indexed.binary.get(id),
        scene = indexed.visual.get(id),
        receipt = indexed.history.get(id),
        ref = indexed.archived.get(id);
  requireCondition(src && scene && receipt && ref, 'Missing historical ID mapping: '+id);
  requireCondition(scene.expectedTitle === receipt.title, 'Historical title mismatch: '+id);
  requireCondition(scene.expectedSha === row.image_sha256_20261112, 'Archived image SHA mismatch: '+id);
  requireCondition(src.expected_image_sha256 === row.image_sha256_20261112, 'Restored binary SHA mismatch: '+id);
  requireCondition(src.found_in_erp_repo === true &&
    src.github_erp_exact_image_paths.some(x => x.sha256 === row.image_sha256_20261112 && /^[a-f0-9]{16}$/.test(x.dhash||'')), 'Unmatched original image: '+id);
  requireCondition(receipt.copySHA256 === sha256(scene.expectedCopy), 'Historical review receipt copy hash mismatch: '+id);
  requireCondition(row.review_id_20261112 === receipt.currentAIReviewId, 'Version-bound AI review mismatch: '+id);
  requireCondition(receipt.status === 'pending_review' && receipt.latestAIDecision === 'NEEDS_HUMAN_REVIEW', 'Historical review state inconsistent: '+id);
  requireCondition(receipt.checks?.duplicate === 'DEFER', 'Unexpected duplicate state: '+id);
  const otherChecks = Object.entries(receipt.checks || {}).filter(([key])=>key !== 'duplicate');
  requireCondition(otherChecks.length === 15 && otherChecks.every(([,value])=>value === 'PASS'), 'Unexpected non-dedup gate: '+id);
  findings.push({
    post_id: id,
    image_sha256_verified_against_erp_git: true,
    archival_copy_sha256_verified: true,
    archival_review_id_verified: true,
    archival_non_dedup_gate_pass: 15,
    archival_duplicate_gate: 'DEFER',
    archival_published_similarity_peak: receipt.highestPublishedSimilarity,
    archival_caption_alert: receipt.alert,
    archived_image_review_candidates: pairs.filter(p => p.current === id).map(p=>({
      other_post_id:p.reference, reference_status:p.referenceStatus,
      visual_dhash_distance:p.dhash64, visual_ahash_distance:p.averageHash64,
      is_proven_duplicate:false
    })),
    latest_live_d1_binding_verified: false,
    publication_eligible: false
  });
}
const alerts = findings.filter(x=>x.archival_caption_alert==='MANUAL_EDITORIAL_ANGLE_CHECK');
requireCondition(alerts.length === 1 && alerts[0].post_id === 'XJW-CONV-chat-photo-size', 'One known editorial hold changed');
const report = {
 schema:'xjw-46-archival-posts-offline-cross-evidence-v1',
 as_of:'2026-11-22',
 source_paths:source,
 history_snapshot_at:history.checkedAt,
 scope:'11/12 version-bound saved review: Facebook 74, Instagram 35, Threads 23; archival image references 88',
 counts:{
   posts:findings.length, original_image_sha256_confirmed:findings.length,
   caption_sha256_matches_review_receipt:findings.length,
   current_archival_review_ids_confirmed:findings.length,
   posts_with_15_other_gates_pass:findings.length,
   posts_with_duplicate_defer:findings.length,
   historical_published_post_rows:history.historyRows,
   historical_facebook_rows:history.historyByPlatform.facebook,
   historical_instagram_rows:history.historyByPlatform.instagram,
   historical_threads_rows:history.historyByPlatform.threads,
   archival_reference_images:archived.referenceImages,
   cross_reference_visual_candidate_pairs:pairs.length,
   explicit_editorial_topic_hold_posts:alerts.length,
   recovered_historical_media_claim_from_saved_receipt:178,
   historically_unavailable_media_bytes:15,
   current_d1_binding_confirmed:0,
   approved_posts:0,
   scheduled_posts:0,
   published_posts:0
 },
 editorial_hold_posts:alerts.map(x=>({post_id:x.post_id,reason:'Similarity with 2026-08-06 original 30cc tasting-related published post; manual editorial angle review still needed'})),
 visual_review_pairs:pairs.map(p=>({
  post_id:p.current,reference_post_id:p.reference,reference_status:p.referenceStatus,
  archival_dhash_distance:p.dhash64,archival_ahash_distance:p.averageHash64,
  confirmed_duplicate:false
 })),
 historical_178_media_full_content_coverage:false,
 historical_15_missing_bytes_resolved:false,
 cloudflare_d1_queries:0,
 cloudflare_d1_mutations:0,
 metricool_mutations:0,
 approvals:0,
 schedules:0,
 publications:0,
 release_allowed:false,
 explanation:'All 46 archived source images and version-bound non-duplicate gates match. This does not replace 15 missing older media, current live D1 binding validation, review of 6 image similarity signals and one editorial angle hold, or owner/delegated publishing authorization. No publishing action is allowed.',
 rows:findings
};
requireCondition(report.counts.posts === 46 && report.counts.cross_reference_visual_candidate_pairs === 6, 'Unexpected historical cross-reference candidate count');
writeFileSync('ops/receipts/20261122-46-cross-history-offline-readiness.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:'offline_only',...report.counts,release_allowed:false}));
