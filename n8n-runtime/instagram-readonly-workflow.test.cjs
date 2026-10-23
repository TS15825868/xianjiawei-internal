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

test('IG media GET includes permalink for known commented post cross-check', () => {
  const params=node('讀取正式帳號貼文').parameters.queryParameters.parameters;
  const fields=params.find(p=>p.name==='fields')?.value.split(',');
  for(const field of ['id','permalink','comments_count','timestamp'])
    assert.ok(fields.includes(field),field+' is required');
});

test('known commented permalink is prioritized before unrelated media without manufacturing permissions', () => {
  const data=[
    {id:'recent-unrelated',permalink:'https://www.instagram.com/p/RecentTest/',comments_count:2},
    {id:'known-20260919',permalink:'https://www.instagram.com/p/Dddia2NFGXr/?igsh=read_only',comments_count:1},
    {id:'other-unrelated',permalink:'https://www.instagram.com/p/Another/',comments_count:1},
  ];
  const result=executeReview('選取有留言貼文',[{data,paging:{next:'another-page'}}]);
  assert.equal(result.length,3);
  assert.equal(result[0].json.mediaId,'known-20260919');
  assert.equal(result[0].json.targetPostFromMetricool,true);
  assert.equal(result[0].json.commentsCount,1);
  assert.equal(result[0].json.mediaPaginationRemaining,true);
  assert.equal(result[1].json.targetPostFromMetricool,false);
  assert.ok(result.every(x=>!x.json.sent&&!x.json.e2eVerified));
});

test('known post with zero actual Meta comments does not get selected merely from external statistics', () => {
  const data=[{id:'known-20260919',permalink:'https://www.instagram.com/p/Dddia2NFGXr/',comments_count:0},
    {id:'unrelated',permalink:'https://www.instagram.com/p/Other/',comments_count:2}];
  const result=executeReview('選取有留言貼文',[{data}]);
  assert.equal(result.length,1);
  assert.equal(result[0].json.mediaId,'unrelated');
  assert.equal(result[0].json.targetPostFromMetricool,false);
  assert.throws(()=>executeReview('選取有留言貼文',[{data:data.slice(0,1)}]),/No commented media/);
});

test('malformed or untrusted media cannot force Graph URL selection', () => {
  const result=executeReview('選取有留言貼文',[{data:[
    {id:123,permalink:'https://www.instagram.com/p/Dddia2NFGXr/',comments_count:3},
    {id:'safe-id',permalink:'https://www.instagram.com/p/Safe/',comments_count:1},
    {id:'bad-negative',permalink:'https://www.instagram.com/p/Invalid/',comments_count:-1},
  ]}]);
  assert.equal(result.length,1);
  assert.equal(result[0].json.mediaId,'safe-id');
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
