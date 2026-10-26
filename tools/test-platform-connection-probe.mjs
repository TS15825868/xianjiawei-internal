import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probePublisherConnections} from '../src/platform-connection-probe.js';
import {probePlatforms,blockingPlatformFailures} from '../src/system-readiness.js';

test('Threads Work handoff never claims a remote verified or automatically publishing channel',async()=>{
 const result=await probePublisherConnections({});
 const t=result.platforms.Threads;
 assert.equal(t.externalScheduler,'Metricool');
 assert.equal(t.account,'xianjiawei.tw');
 assert.equal(t.directConfigured,false);
 assert.equal(t.connected,null);
 assert.equal(t.verified,false);
 assert.equal(t.externalSchedulerReady,false);
 assert.equal(t.externalSchedulerLiveVerified,false);
 assert.equal(t.operational,false);
 assert.equal(t.verificationRequired,true);
 assert.equal(t.status,'metricool_external_publish_unverified');
 assert.equal(result.all_automatic_channels_configured,false);
 assert.equal(result.all_external_schedulers_verified,false);
 assert.ok(result.verification_required_platforms.includes('Threads'));
 assert.ok(!result.operational_platforms.includes('Threads'));
 assert.equal(result.publishes_content,false);
});
test('configuring a Threads webhook without official remote proof remains unverified',async()=>{
 const env={THREADS_PUBLISH_WEBHOOK_URL:'https://example.test/disabled-threads',
  THREADS_PUBLISH_WEBHOOK_TOKEN:'dummy-local-only'};
 const result=await probePublisherConnections(env),t=result.platforms.Threads;
 assert.equal(t.webhookConfigured,true);
 assert.equal(t.operational,false);
 assert.equal(t.verified,false);
 assert.equal(t.connected,null);
 assert.equal(t.verificationRequired,true);
 assert.equal(result.all_configured_channels_operational,false);
 assert.equal(result.all_external_schedulers_verified,false);
});
test('Threads proof pending does not disable other platforms or permit publication',async()=>{
 const readiness=await probePlatforms({});
 const t=readiness.platforms.Threads;
 assert.equal(t.ok,false);
 assert.equal(t.verified,false);
 assert.equal(t.operational,false);
 assert.equal(t.name,'Threads');
 assert.equal(readiness.publishes_content,false);
 assert.deepEqual(blockingPlatformFailures(readiness),[]);
});
test('LINE VOOM manual-only channel remains manual, never automatic',async()=>{
 const readiness=await probePublisherConnections({});
 const item=readiness.platforms['LINE VOOM'];
 assert.equal(item.manualRequired,true);
 assert.equal(item.mode,'manual');
 assert.equal(item.verified,false);
 assert.equal(item.directConfigured,false);
});
