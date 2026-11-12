"use client";
import { useEffect, useState } from "react";
import { Copy, Lock, RefreshCw, Upload, Users } from "lucide-react";
const api=async(path:string,method="GET",body?:unknown)=>{const r=await fetch(`/api/${path}`,{method,credentials:"same-origin",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Request failed");return d;};
export default function AdminPage(){
 const [state,setState]=useState<any>(null),[names,setNames]=useState(""),[started,setStarted]=useState(false),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
 async function refresh(){try{const d=await api("admin/state");setState(d);setStarted(d.started);}catch(e:any){setMsg(e.message);}}
 useEffect(()=>{refresh();const t=setInterval(refresh,4000);return()=>clearInterval(t);},[]);
 async function importNames(){setBusy(true);try{const d=await api("admin/import","POST",{names:names.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)});setMsg(`Imported ${d.imported} names.${d.duplicatesAdjusted?" Duplicate names were labeled automatically.":""}`);refresh();}catch(e:any){setMsg(e.message);}finally{setBusy(false);}}
 async function start(){if(!confirm("Start the draw now? Names will be locked and assignments cannot be changed."))return;setBusy(true);try{await api("admin/start","POST",{});setMsg("Game started. The draw is permanently locked.");refresh();}catch(e:any){setMsg(e.message);}finally{setBusy(false);}}
 async function reset(p:any){if(!confirm(`Reset access for ${p.name}? Their original assignment will NOT change.`))return;try{await api("admin/reset","POST",{participantId:p.id});setMsg(`${p.name} access reset. Assignment preserved.`);refresh();}catch(e:any){setMsg(e.message);}}
 async function upload(file?:File){if(!file)return;const text=await file.text();setNames(text.replace(/,/g,"\n"));}
 const joined=state?.joined||0,total=state?.total||0;
 return <main className="min-h-screen px-4 py-10"><div className="mx-auto max-w-5xl">
  <header className="mb-8 flex items-center justify-between"><div><p className="text-xs font-bold tracking-widest text-amber-700">SECRET SANTA / ADMIN</p><h1 className="mt-1 text-3xl font-black">Game dashboard</h1></div><div className="rounded-2xl bg-green-900 p-3 text-white"><Lock/></div></header>
  {msg&&<p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{msg}</p>}
  {!started&&<section className="card mb-6 p-6"><h2 className="mb-2 text-xl font-bold">Participants</h2><p className="mb-4 text-sm text-gray-500">Paste one name per line. At least 3 participants are required. Duplicate names receive distinguishing labels.</p><textarea className="field min-h-40" value={names} onChange={e=>setNames(e.target.value)} placeholder={"Mona\nOmar\nSalma"}/><div className="mt-3 flex flex-wrap gap-2"><label className="btn btn-muted flex cursor-pointer items-center gap-2"><Upload size={16}/> Upload CSV/TXT<input hidden type="file" accept=".txt,.csv,text/plain,text/csv" onChange={e=>upload(e.target.files?.[0])}/></label><button disabled={busy} onClick={importNames} className="btn btn-primary">{busy?"Saving...":"Save participants"}</button><button disabled={busy||total<3} onClick={start} className="btn bg-red-700 text-white">Start Game</button></div></section>}
  <section className="card p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Players overview</h2><p className="text-sm text-gray-500">No assignments or wishlist contents are available in this dashboard.</p></div><button onClick={refresh} className="btn btn-muted flex items-center gap-2"><RefreshCw size={16}/> Refresh</button></div>
   <div className="mb-6 rounded-2xl bg-green-50 p-4"><div className="mb-2 flex justify-between text-sm font-bold"><span>{joined} of {total} joined</span><span>{total?Math.round(joined/total*100):0}%</span></div><div className="h-3 overflow-hidden rounded-full bg-green-100"><div className="h-full rounded-full bg-green-700 transition-all" style={{width:`${total?joined/total*100:0}%`}}/></div></div>
   <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-right text-sm"><thead><tr className="border-b text-gray-500"><th className="p-3">Name</th><th className="p-3">Status</th><th className="p-3">Join time</th><th className="p-3">Drawn Person</th><th className="p-3">Wishlist</th><th className="p-3">Action</th></tr></thead><tbody>{(state?.participants||[]).map((p:any)=><tr key={p.id} className="border-b border-gray-100"><td className="p-3 font-bold">{p.name}</td><td className="p-3">{p.status}</td><td className="p-3">{p.joinedAt?new Date(p.joinedAt).toLocaleString():"—"}</td><td className="p-3">
  {p.drawnPerson?.name ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-800">
      🎁 {p.drawnPerson.name}
    </span>
  ) : (
    <span className="text-gray-400">
      Not assigned
    </span>
  )}
</td><td className="p-3">{p.wishlist.hasItems?`Yes · ${p.wishlist.count} items`:"No"}</td><td className="p-3">{started&&<button onClick={()=>reset(p)} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Reset player</button>}</td></tr>)}</tbody></table></div>
   {!total&&<p className="py-8 text-center text-gray-400">No participants imported yet.</p>}
  </section>
  <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4"><div><b>Players link</b><p className="text-xs text-gray-500">Share this link with all participants.</p></div><button className="btn btn-muted flex items-center gap-2" onClick={()=>navigator.clipboard.writeText(`${location.origin}/play`)}><Copy size={16}/> Copy players link</button></section>
 </div></main>
}
