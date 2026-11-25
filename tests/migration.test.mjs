import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {views} from '../src/legacy/views.js';
test('all four local views use the deployment prefix and do not embed a GAS page',()=>{
 for(const view of Object.values(views)){
   assert(!/<iframe\b|<script\b/i.test(view.markup));assert(!view.markup.includes('script.google.com/macros'));
   for(const name of view.scripts){const script=fs.readFileSync(new URL('../public/legacy/'+name,import.meta.url),'utf8');assert(!script.includes('google.script.run'));assert(!script.includes('passwordHash'));}
 }
 assert(views.home.markup.includes('__PORTAL_BASE_PATH__/monthly-report'));
 assert(views.home.markup.includes('__PORTAL_BASE_PATH__/results'));
 assert(views.home.markup.includes('__PORTAL_BASE_PATH__/admin'));
});
test('existing screening retains original input and safe sentences while removing the supplied examples',()=>{
 const context=vm.createContext({});for(const name of ['ng-rules.js','report-core.js'])vm.runInContext(fs.readFileSync(new URL('../public/legacy/'+name,import.meta.url),'utf8'),context);
 const source={good:'クーリングオフで収益が減った。毎週の投稿を継続できた。',growth:'セールスチームに企画やってもらった。次月の投稿計画を見直した。'};
 const result=context.MonthlyReport.screenDraft(source);
 assert.equal(result.draft.good,'毎週の投稿を継続できた。');assert.equal(result.draft.growth,'次月の投稿計画を見直した。');assert(source.good.includes('クーリングオフ'));
});
