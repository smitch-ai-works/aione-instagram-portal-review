import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';

const checker=path.resolve('tools/check-publication-safety.mjs');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'portal-publication-'));
 t.after(async()=>{const actual=await fs.realpath(root),parent=await fs.realpath(os.tmpdir());assert.equal(path.dirname(actual),parent);assert.ok(path.basename(actual).startsWith('portal-publication-'));await fs.rm(actual,{recursive:true,force:true});});
 const git=args=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
 git(['init','--quiet']);
 await fs.mkdir(path.join(root,'.local'));
 await fs.writeFile(path.join(root,'.gitignore'),'.local/\n');
 const sensitive='synthetic-private-sheet-identity-0123456789';
 await fs.writeFile(path.join(root,'.local/source-config.json'),JSON.stringify({results:{id:sensitive}}));
 const env={...process.env};for(const key of Object.keys(env))if(/^(PORTAL_|LEGACY_)/.test(key))delete env[key];env.PORTAL_PRIVATE_AUDIT_ROOT=root;
 const run=args=>{const result=spawnSync(process.execPath,[checker,...args],{cwd:root,env,encoding:'utf8'});return {...result,report:JSON.parse(result.stdout)};};
 return {root,git,sensitive,run};
}

test('publication audit excludes private files and rejects a private source identifier without printing it',async t=>{
 const {root,git,sensitive,run}=await fixture(t);
 await fs.writeFile(path.join(root,'app.js'),'export const mode="review";\n');git(['add','.']);
 assert.equal(run([]).status,0);
 await fs.writeFile(path.join(root,'app.js'),'export const source='+JSON.stringify(sensitive)+';\n');
 const rejected=run([]);assert.equal(rejected.status,1);assert.equal(rejected.report.safe,false);
 assert.ok(rejected.report.problems.some(problem=>problem.file==='app.js'&&problem.kind==='private_configuration_value'));
 assert.ok(!rejected.stdout.includes(sensitive));
});

test('publication audit detects a removed identifier in Git history while accepting the clean current snapshot',async t=>{
 const {root,git,sensitive,run}=await fixture(t);
 await fs.writeFile(path.join(root,'app.js'),'export const source='+JSON.stringify(sensitive)+';\n');git(['add','.']);
 git(['-c','user.name=Publication Test','-c','user.email=audit@example.test','-c','commit.gpgSign=false','-c','core.hooksPath=.local/empty-hooks','commit','--quiet','-m','Fixture history']);
 await fs.writeFile(path.join(root,'app.js'),'export const mode="review";\n');
 assert.equal(run([]).status,0);
 const rejected=run(['--history']);assert.equal(rejected.status,1);assert.ok(rejected.report.historyBlobsChecked>0);assert.equal(rejected.report.safe,false);
 assert.ok(!rejected.stdout.includes(sensitive));
});
