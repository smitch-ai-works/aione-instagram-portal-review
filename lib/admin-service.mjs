import {createHash,randomBytes} from 'node:crypto';
import {compare} from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const digest=value=>createHash('sha256').update(value).digest('hex');
let defaultPolicy;
function basePolicy(){if(!defaultPolicy){const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(process.cwd(),'public/legacy/ng-rules.js'),'utf8'),context);defaultPolicy=JSON.parse(JSON.stringify(context.MonthlyReportNgRules));}return structuredClone(defaultPolicy);}
export function validateWords(words){
 if(!Array.isArray(words)||words.length>200)throw Error('invalid_words');const seen=new Set(),result=[];
 for(const value of words){if(typeof value!=='string'||!value.trim()||value.length>100||/[\x00-\x1f\x7f\u2028\u2029]/u.test(value))throw Error('invalid_words');const word=value.trim(),key=word.normalize('NFKC').replace(/[\s\p{Cf}]/gu,'').toLowerCase();if(!key)throw Error('invalid_words');if(!seen.has(key)){seen.add(key);result.push(word);}}
 if(Buffer.byteLength(JSON.stringify(result))>7000)throw Error('invalid_words');return result;
}
export function createAdminService({store,passwordHash,now=Date.now}){
 const credential=digest(passwordHash||''),configured=/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(passwordHash||'');
 const settings=state=>{const value=state.settings;if(!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('state_unavailable');return {revision:value.revision,words:validateWords(value.words)};};
 const session=(state,token)=>{if(!configured||!/^[a-f0-9]{64}$/.test(token||''))return null;const value=state.sessions[digest(token)];return value&&value.expiresAt>now()&&value.credential===credential?value:null;};
 return {
  async policy(){const value=settings(await store.read()),base=basePolicy();base.rules.forEach(rule=>rule.words=[]);if(value.words.length)base.rules.unshift({id:'managed-words',reason:'管理者が登録したNGワード',guidance:'ご自身の取り組みや次の行動を書いてください。',words:value.words});return {...base,revision:value.revision};},
  async login(password){if(!configured)return {status:'not_configured'};return store.transact(async state=>{
   const time=now(),old=state.failures,attempts=old&&old.until>time&&old.credential===credential?old:{count:0,until:time+600000,credential};
   if(attempts.count>=5)return {status:'locked',retryAfterSeconds:Math.ceil((attempts.until-time)/1000)};
   if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>72||!await compare(password,passwordHash)){attempts.count++;state.failures=attempts;return {status:'invalid_password'};}
   state.failures=null;for(const [key,value] of Object.entries(state.sessions))if(value.expiresAt<=time||value.credential!==credential)delete state.sessions[key];
   const token=randomBytes(32).toString('hex'),expiresAt=time+3600000;state.sessions[digest(token)]={expiresAt,credential};return {status:'ok',token,expiresAt};
  });},
  async getRules(token){const state=await store.read();if(!session(state,token))return {status:'unauthorized'};return {status:'ok',...settings(state),patterns:basePolicy().rules.map(rule=>({id:rule.id,reason:rule.reason}))};},
  async saveRules(token,words,revision){return store.transact(state=>{if(!session(state,token))return {status:'unauthorized'};const current=settings(state);if(current.revision!==revision)return {status:'conflict'};let checked;try{checked=validateWords(words);}catch{return {status:'invalid_words'};}state.settings={revision:current.revision+1,words:checked};return {status:'ok',...state.settings};});},
  async logout(token){return store.transact(state=>{if(session(state,token))delete state.sessions[digest(token)];return {status:'ok'};});}
 };
}
