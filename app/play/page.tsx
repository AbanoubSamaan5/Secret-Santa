"use client";
import { useEffect, useMemo, useState } from "react";
import { Gift, Search, Sparkles, Heart, RefreshCw, ExternalLink, Plus, Trash2, Globe2, GiftIcon, LucideGift } from "lucide-react";

type Person = { id: string; name: string; available: boolean };
type Item = { id?: string; title: string; url: string | null; note: string | null; approx_price: string | null; sort_order?: number };
const api = async (path: string, method = "GET", body?: unknown) => {
  const r = await fetch(`/api/${path}`, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await r.json(); if (!r.ok) throw new Error(data.error || "حدث خطأ"); return data;
};
export default function PlayPage() {
  const [lang, setLang] = useState<"ar"|"en">("en");
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Person|null>(null);
  const [claimed, setClaimed] = useState(false);
  const [me, setMe] = useState<any>(null);
  const [recipientItems, setRecipientItems] = useState<any[]>([]);
  const [anything, setAnything] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"mine"|"theirs">("mine");
  const [error, setError] = useState("");
  const ar = lang === "ar";
  const t = (a:string,b:string) => ar ? a : b;
  async function loadMe() {
    const d = await api("player/me");
    setMe(d);
    setItems(d.ownWishlist || []);
    setAnything(!!d.anythingIsFine);
    setClaimed(true);
    try {
      const w = await api("player/recipient-wishlist");
      setRecipientItems(w.items || []);
    } catch {
      setRecipientItems([]);
    }
  }
  useEffect(() => {
    api("player/list")
      .then((d) => {
        if (!d.alreadyClaimed) setPeople(d.participants || []);
      })
      .catch((e: Error) => setError(e.message || "Error"));
    api("player/me")
      .then(async (d) => {
        setMe(d);
        setItems(d.ownWishlist || []);
        setAnything(!!d.anythingIsFine);
        setClaimed(true);
        try {
          const w = await api("player/recipient-wishlist");
          setRecipientItems(w.items || []);
        } catch {
          setRecipientItems([]);
        }
      })
      .catch(() => setClaimed(false));
  }, []);
  useEffect(() => {
    if (!claimed) return;
    const timer = setInterval(() => {
      api("player/recipient-wishlist").then(d => setRecipientItems(d.items || [])).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [claimed]);
  const filtered = useMemo(() => people.filter(p => p.available && p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [people, search]);
  async function claim() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await api("player/claim", "POST", { participantId: selected.id });
      setSelected(null);
      await loadMe();
    } catch (e: any) {
      setError(e.message || t("حدث خطأ","Something went wrong"));
      try {
        const d = await api("player/list");
        if (!d.alreadyClaimed) setPeople(d.participants || []);
      } catch { /* ignore */ }
    } finally {
      setBusy(false);
    }
  }
  async function saveWishlist() {
    setBusy(true); setError("");
    try { await api("player/wishlist","POST",{items,anythingIsFine:anything}); setError(t("تم حفظ قائمتك 🎁","Wishlist saved 🎁")); }
    catch(e:any) { setError(e.message); } finally { setBusy(false); }
  }
  function addItem() { if(items.length<10) setItems([...items,{title:"",url:null,note:null,approx_price:null}]); }
  function updateItem(i:number,key:keyof Item,value:string) { setItems(items.map((x,n)=>n===i?{...x,[key]:value}:x)); }
  const moveItem=(i:number,delta:number)=>{const a=[...items],j=i+delta;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];setItems(a);};
  return <main dir={ar?"rtl":"ltr"} className="min-h-screen px-4 py-7 sm:py-12">
    <div className="mx-auto max-w-2xl">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3"><div className="rounded-2xl bg-green-800 p-3 text-white"><Sparkles/></div><div><p className="text-xs font-bold tracking-widest text-amber-700">SECRET SANTA</p><h1 className="text-xl font-black">{t("مفاجأة حلوة مستنياك","A little surprise awaits")}</h1></div></div>
        <button className="btn btn-muted flex items-center gap-2 text-sm" onClick={()=>setLang(ar?"en":"ar")}><Globe2 size={16}/>{ar?"EN":"عربي"}</button>
      </header>
      {error && <div role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</div>}
      {!claimed ? <section className="card p-6 sm:p-9">
        <div className="float mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-red-50 text-red-700"><Gift size={42}/></div>
        <h2 className="mb-2 text-center text-2xl font-black">{t("جاهز تلعب Secret Santa؟","Ready for Secret Santa?")}</h2>
        <p className="mb-7 text-center leading-7 text-gray-500">{t("اختار اسمك من القائمة، وبعدها هتعرف الشخص اللي هتجهزله هدية. اختيار واحد بس ومش هتقدر تغيره.","Choose your name and discover who you'll be gifting. One choice only — it can't be changed.")}</p>
        <div className="relative mb-4"><Search className="absolute top-3.5 right-3 text-gray-400" size={18}/><input className="field pr-10" placeholder={t("دور على اسمك...","Search your name...")} value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {filtered.map(p=><button key={p.id} onClick={()=>setSelected(p)} className="flex w-full items-center justify-between rounded-xl border border-gray-100 p-4 text-right transition hover:border-green-700 hover:bg-green-50"><span className="font-bold">{p.name}</span><span className="text-xs text-green-700">{t("اختارني","Choose")}</span></button>)}
          {!filtered.length && <p className="p-5 text-center text-sm text-gray-400">{t("مفيش أسماء متاحة مطابقة.","No available matching names.")}</p>}
        </div>
      </section> : <section className="space-y-5">
        <div className="card overflow-hidden p-7 text-center sm:p-10">
          <div className="mb-3 flex justify-center text-amber-500"><Sparkles size={28}/></div>
          <p className="text-sm font-bold text-green-800">{t("أنت هتجيب هدية لـ","YOU ARE GIFTING")}</p>
          <h2 className="reveal my-4 text-4xl font-black text-red-700">{me?.recipient || "••••••"}</h2>
          <p className="text-sm text-gray-500">{t("خليها مفاجأة جميلة! 🎁","Make it a lovely surprise! 🎁")}</p>
        </div>
        <div className="card p-5 sm:p-7">
          <div className="mb-5 flex gap-2">
            <button className={`btn flex-1 ${tab==="mine"?"btn-primary":"btn-muted"}`} onClick={()=>setTab("mine")}>{t("قائمتي","My Wishlist")}</button>
            <button className={`btn flex-1 ${tab==="theirs"?"btn-primary":"btn-muted"}`} onClick={()=>setTab("theirs")}>{t("قائمة الشخص بتاعي","My Person's Wishlist")}</button>
          </div>
          {tab==="mine" ? <div>
            <p className="mb-4 text-sm text-gray-500">{t("اكتب أفكار تساعد الشخص اللي هيجيبلك هدية. تقدر تعدلها في أي وقت.","Add ideas to help your Secret Santa. You can edit this anytime.")}</p>
            <label className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm"><input type="checkbox" checked={anything} onChange={e=>setAnything(e.target.checked)}/>{t("Surprise me! أي حاجة هتكون حلوة","Surprise me! Anything is fine")}</label>
            {!anything && items.map((item,i)=><div key={i} className="mb-3 rounded-xl border border-gray-100 p-3">
              <div className="mb-2 flex items-center justify-between"><b className="text-sm">{t("هدية","Item")} {i+1}</b><button onClick={()=>setItems(items.filter((_,n)=>n!==i))} aria-label="Delete item"><Trash2 size={17} className="text-red-500"/></button></div>
              <input className="field mb-2" placeholder={t("اسم الحاجة (مطلوب)","Item title (required)")} value={item.title} onChange={e=>updateItem(i,"title",e.target.value)}/>
              <input className="field mb-2" placeholder={t("لينك (اختياري)","Link (optional)")} value={item.url||""} onChange={e=>updateItem(i,"url",e.target.value)}/>
              <div className="grid grid-cols-2 gap-2"><input className="field" placeholder={t("مقاس / لون / ملاحظة","Size / color / note")} value={item.note||""} onChange={e=>updateItem(i,"note",e.target.value)}/><input className="field" placeholder={t("السعر التقريبي","Approx. price")} value={item.approx_price||""} onChange={e=>updateItem(i,"approx_price",e.target.value)}/></div>
              <div className="mt-2 flex gap-2 text-xs"><button className="text-green-800" onClick={()=>moveItem(i,-1)}>↑ {t("فوق","Up")}</button><button className="text-green-800" onClick={()=>moveItem(i,1)}>↓ {t("تحت","Down")}</button></div>
            </div>)}
            {!anything && items.length<10 && <button onClick={addItem} className="btn btn-muted mb-4 flex w-full items-center justify-center gap-2"><Plus size={17}/>{t("إضافة عنصر","Add item")}</button>}
            <button disabled={busy} onClick={saveWishlist} className="btn btn-primary w-full">{busy?t("جاري الحفظ...","Saving..."):t("حفظ القائمة","Save wishlist")}</button>
          </div> : <div>
            {recipientItems.length ? <div className="space-y-3">{recipientItems.map((it,i)=><div key={i} className="rounded-xl bg-gray-50 p-4"><b>{it.title}</b>{it.note&&<p className="mt-1 text-sm text-gray-600">{it.note}</p>}{it.approx_price&&<p className="mt-1 text-sm text-gray-600">{t("السعر التقريبي: ","Approx. price: ")}{it.approx_price}</p>}{it.url&&<a className="mt-2 inline-flex items-center gap-1 text-sm text-green-800 underline" href={it.url} target="_blank" rel="noopener noreferrer">{t("فتح الرابط","Open link")} <ExternalLink size={13}/></a>}</div>)}</div> : <div className="rounded-2xl bg-gray-50 p-8 text-center"><Heart className="mx-auto mb-3 text-red-400"/><b>{t("لسه مفيش Wishlist","No wishlist yet")}</b><p className="mt-2 text-sm text-gray-500">{t("هنحدثها تلقائيًا لما يضيف الشخص أفكاره.","We'll refresh automatically when they add ideas.")}</p></div>}
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400"><RefreshCw size={13}/> {t("تحديث تلقائي كل 5 ثواني","Auto-refreshes every 5 seconds")}</p>
          </div>}
        </div>
      </section>}
      {selected && <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"><div role="dialog" aria-modal="true" className="card w-full max-w-sm p-6"><h3 className="mb-2 text-xl font-black">{t("متأكد إنك","Are you") } {selected.name}؟</h3><p className="mb-6 text-sm leading-6 text-gray-500">{t("مش هتقدر تغير الاسم بعد التأكيد. كل شخص يقدر يشارك مرة واحدة بس.","You can't change this later. Each person can play only once.")}</p><div className="flex gap-2"><button className="btn btn-muted flex-1" onClick={()=>setSelected(null)}>{t("رجوع","Cancel")}</button><button disabled={busy} className="btn btn-primary flex-1" onClick={claim}>{busy?t("لحظة...","Please wait..."):t("أيوه، ده أنا","Confirm")}</button></div></div></div>}
      <footer className="mt-8 text-center text-xs text-gray-400">Enjoy with your Secret Santa 😊</footer>
    </div>
  </main>;
}
