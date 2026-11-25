import {createHash,timingSafeEqual} from 'node:crypto';
export function secretMatches(value,expected){if(typeof expected!=='string'||expected.length<32||typeof value!=='string')return false;return timingSafeEqual(createHash('sha256').update(value).digest(),createHash('sha256').update(expected).digest());}
