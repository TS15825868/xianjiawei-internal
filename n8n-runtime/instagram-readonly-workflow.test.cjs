'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../docs/n8n');
const files = [
  '06-instagram-api-preflight-readonly.json',
  '07-instagram-comments-readonly.json',
];
const workflows = files.map(file =>
  JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
);
const comments = workflows[1];
const node = name => {
  const match = comments.nodes.find(item => item.name === name);
  assert.ok(match, 'Missing review node: ' + name);
  return match;
};
function executeReview(nodeName, jsonItems) {
  const source = node(nodeName).parameters.jsCode;
  assert.equal(typeof source, 'string');
  const input = {
    first: () => ({ json: jsonItems[0] }),
    all: () => jsonItems.map(json => ({ json })),
  };
  return vm.runInNewContext(
    '(function($input) { ' + source + '\n })($input)',
    { $input: input },
    { timeout: 1000 }
  );
}

test('both tracked Instagram reviews are disabled and strictly read-only', () => {
  for (const workflow of workflows) {
    assert.equal(workflow.active, false);
    assert.equal(workflow.nodes.filter(n => n.type.endsWith('.manualTrigger')).length, 1);
    for (const n of workflow.nodes) {
      assert.ok([
        'n8n-nodes-base.manualTrigger',
        'n8n-nodes-base.httpRequest',
        'n8n-nodes-base.code',
      ].includes(n.type), 'Unreviewed node type: ' + n.type);
      if (n.type.endsWith('.httpRequest')) {
        assert.equal(n.parameters.method, 'GET', n.name + ' must never send');
        assert.match(n.parameters.url, /https:\/\/graph\.instagram\.com\/v\d+\.\d+\//);
        assert.doesNotMatch(n.parameters.url, /\/me\/permissions/i);
      }
    }
  }
});

test('account identity cannot be substituted or silently accepted', () => {
  assert.throws(() =>
    executeReview('確認正式帳號與不發送狀態', [{ username: 'other', user_id: '123' }]),
    /Official Instagram account identity not verified/
  );
  const result = executeReview('確認正式帳號與不發送狀態',
    [{ username: 'xianjiawei.tw', user_id: '17841478328163000' }])[0].json;
  assert.equal(result.identityVerified, true);
  assert.equal(result.sent, false);
  assert.equal(result.e2eVerified, false);
});

test('media selection never treats missing or un-commented media as verified', () => {
  assert.throws(() => executeReview('選取有留言貼文', [{ data: [] }]),
    /No commented media/);
  assert.throws(() => executeReview('選取有留言貼文', [{}]),
    /Invalid media response/);
  const result = executeReview('選取有留言貼文', [{
    data: [{ id: 'fixture-1', comments_count: 3 },
      { id: 'fixture-2', comments_count: 0 }],
  }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].json.commentsCount, 3);
});

test('empty comment response is not a successful comment-read verification', () => {
  const result = executeReview('輸出唯讀驗收摘要', [{ data: [] }])[0].json;
  assert.equal(result.commentsEndpointResponded, true);
  assert.equal(result.commentReadVerified, false);
  assert.equal(result.commentsRead, 0);
  assert.equal(result.repliesRead, 0);
  assert.equal(result.sent, false);
  assert.equal(result.e2eVerified, false);
  assert.equal(result.completeHistoryVerified, false);
  assert.equal(result.replyPermissionVerified, false);
  assert.equal(result.humanAttributionVerified, false);
});

test('real comment content can be read without authorizing sending', () => {
  const result = executeReview('輸出唯讀驗收摘要', [{
    data: [{ id: 'fixture-comment', text: '測試留言', username: 'fixture-author',
      replies: { data: [{ id: 'fixture-reply', username: 'xianjiawei.tw', text: '測試回覆' }] } }],
    paging: { next: 'fixture-page' },
  }])[0].json;
  assert.equal(result.commentReadVerified, true);
  assert.equal(result.commentsRead, 1);
  assert.equal(result.repliesRead, 1);
  assert.equal(result.brandRepliesRead, 1);
  assert.equal(result.paginationRemaining, true);
  assert.equal(result.sent, false);
  assert.equal(result.e2eVerified, false);
  assert.equal(result.completeHistoryVerified, false);
});

test('missing or malformed comments never produce a false pass', () => {
  assert.throws(() => executeReview('輸出唯讀驗收摘要', [{}]),
    /Invalid comments response/);
  const result = executeReview('輸出唯讀驗收摘要',
    [{ data: [{ id: 'fixture-comment', username: 'fixture-author' }] }])[0].json;
  assert.equal(result.commentReadVerified, false);
  assert.equal(result.commentsRead, 1);
  assert.equal(result.e2eVerified, false);
});
