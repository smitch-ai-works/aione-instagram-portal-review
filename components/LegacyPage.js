'use client';
import {useEffect, useState} from 'react';

// Trusted, versioned local markup. No student input is passed to innerHTML.
// Full document navigation keeps the original page-scoped event lifecycle.
export default function LegacyPage({markup,styles,scripts=[]}) {
  const [error,setError]=useState('');
  const [ready,setReady]=useState(scripts.length===0);
  const prefix=process.env.NEXT_PUBLIC_BASE_PATH || '/aione-instagram';
  useEffect(()=>{
    let stopped=false;
    (async()=>{
      for(const name of scripts){
        if(stopped)return;
        await new Promise((resolve,reject)=>{
          const script=document.createElement('script');
          script.src=prefix+'/legacy/'+name;script.async=false;
          script.onload=resolve;script.onerror=()=>reject(new Error('runtime_unavailable'));
          document.body.appendChild(script);
        });
      }
      if(!stopped)setReady(true);
    })().catch(()=>{if(!stopped)setError('画面を読み込めませんでした。ページを再読み込みしてください。');});
    return()=>{stopped=true;};
  },[prefix,scripts]);
  return <>
    <style>{styles}</style>
    <fieldset disabled={!ready} aria-busy={!ready} style={{display:'contents'}}>
      <div data-portal-prefix={prefix} dangerouslySetInnerHTML={{__html:markup.replaceAll('__PORTAL_BASE_PATH__',prefix)}} />
    </fieldset>
    {error&&<p role="alert" style={{padding:24,color:'#a13927'}}>{error}</p>}
  </>;
}
