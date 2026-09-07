const test = require('node:test');
const assert = require('node:assert/strict');
const reconcile = require('../.github/scripts/reconcile-labels.cjs');
const context = {repo:{owner:'owner',repo:'repo'}};
const desired = {name:'documentation',color:'ABCDEF',description:'Documentation'};
function api(existing, failure) {
  const calls=[];
  const issues={
    listLabelsForRepo:()=>{},
    createLabel:async(params)=>{calls.push(['create',params]);if(failure) throw failure;},
    getLabel:async()=>({data:desired}),
    updateLabel:async(params)=>{calls.push(['update',params]);},
  };
  return {github:{rest:{issues},paginate:async(fn,params)=>{assert.equal(fn,issues.listLabelsForRepo);assert.equal(params.per_page,100);return existing;}},calls};
}
test('label reconciliation creates missing labels and preserves unmanaged labels',async()=>{
  const {github,calls}=api([{name:'custom',color:'000000',description:'Keep'}]);
  await reconcile(github,context,[desired]);assert.equal(calls.length,1);assert.equal(calls[0][0],'create');
});
test('label reconciliation is idempotent and corrects metadata and case',async()=>{
  const first=api([{...desired,color:'abcdef'}]);await reconcile(first.github,context,[desired]);assert.equal(first.calls.length,0);
  const second=api([{...desired,name:'Documentation',description:'Old'}]);await reconcile(second.github,context,[desired]);assert.equal(second.calls[0][0],'update');assert.equal(second.calls[0][1].new_name,'documentation');
});
test('concurrent creation is recovered, unrelated API failures propagate',async()=>{
  const concurrent=api([],Object.assign(new Error('exists'),{status:422}));await reconcile(concurrent.github,context,[desired]);
  const denied=api([],Object.assign(new Error('denied'),{status:403}));await assert.rejects(reconcile(denied.github,context,[desired]),/denied/u);
  const invalid=api([],Object.assign(new Error('validation'),{status:422}));invalid.github.rest.issues.getLabel=async()=>{throw new Error('not found');};await assert.rejects(reconcile(invalid.github,context,[desired]),/not found/u);
});
