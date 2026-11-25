import LegacyPage from '../../components/LegacyPage';
import {views} from '../../src/legacy/views';
import {top5View} from '../../src/legacy/top5-view';
import {secretMatches} from '../../lib/notifications/authorization.mjs';
export const metadata={title:"AI ONEインスタ部門 成果ダッシュボード"};
export default async function Page({searchParams}){const params=await searchParams;if(params&&Object.hasOwn(params,'ranking_image')){if(!secretMatches(params.ranking_image,process.env.PORTAL_TOP5_DOWNLOAD_KEY))return <p>このリンクは利用できません。</p>;return <LegacyPage {...top5View}/>;}return <LegacyPage {...views.results} />;}
