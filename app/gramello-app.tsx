"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Activity, CalendarDays, ChevronLeft, ChevronRight, LayoutDashboard, Loader2, Plus, Settings2, Sparkles, Target, Trash2, TrendingUp, Utensils } from "lucide-react";
import { FoodDialog, type DiaryEntry } from "@/components/food-dialog";
import { FoodVerification } from "@/components/food-verification";
import { entryAmountLabel } from "@/lib/meals";
import { BrandMark as Logo } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ProfileMenu } from "@/components/profile-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster, toast } from "sonner";
import { changeGoal, macroPercent } from "./goal-math";
import { localDate as today } from "@/lib/diary-date";
import type { AuthUser } from "@/lib/auth";
import SignIn from "./sign-in";

type Goals={calories:number;protein:number;carbs:number;fat:number};
type Entry=DiaryEntry;
type Trend={date:string;calories:number;protein:number;carbs:number;fat:number};

const defaultGoals:Goals={calories:2400,protein:180,carbs:250,fat:70};
const meals=["Breakfast","Lunch","Dinner","Snacks"];
const fmtDate=(value:string)=>new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`));
const round=(n:number)=>Math.round(n);
const clamp=(n:number)=>Math.min(100,Math.max(0,n));


function MacroProgress({label,current,target,color}:{label:string;current:number;target:number;color:string}){
  const pct=target?current/target*100:0;
  return <div className="macro-progress"><div className="macro-progress-top"><span><i style={{background:color}}/>{label}</span><strong>{round(current)} <small>/ {target}g</small></strong></div><div className="track"><span style={{width:`${clamp(pct)}%`,background:color}}/></div></div>;
}

export default function GramelloApp({ user }: { user: AuthUser }){
  const [sessionExpired, setSessionExpired] = useState(false);
  const authFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, { ...init, cache: "no-store" });
    if (response.status === 401) {
      setSessionExpired(true);
      throw new Error("Your session has expired. Please sign in again.");
    }
    return response;
  }, []);
  const [view,setView]=useState<"today"|"trends">("today");
  const [date,setDate]=useState(today);
  const [goals,setGoals]=useState<Goals>(defaultGoals);
  const [entries,setEntries]=useState<Entry[]>([]);
  const [loading,setLoading]=useState(true);
  const [addOpen,setAddOpen]=useState(false);
  const [goalOpen,setGoalOpen]=useState(false);
  const [meal,setMeal]=useState("Breakfast");
  const [saving,setSaving]=useState(false);
  const [draftGoals,setDraftGoals]=useState<Goals>(defaultGoals);
  const [range,setRange]=useState(7);
  const [trends,setTrends]=useState<Trend[]>([]);
  const [trendLoading,setTrendLoading]=useState(false);

  const loadDay=useCallback(async(signal:AbortSignal)=>{
    setLoading(true);
    try {
      const r=await authFetch(`/api/day?date=${date}`,{signal});
      const data=await r.json() as { error?: string; entries: Entry[]; goals: Goals };
      if(signal.aborted)return;
      if(!r.ok)throw new Error(data.error);
      setEntries(data.entries);
      setGoals(data.goals);
    } catch(e) {
      if(!signal.aborted)toast.error(e instanceof Error?e.message:"Could not load diary");
    } finally {
      if(!signal.aborted)setLoading(false);
    }
  },[date,authFetch]);
  useEffect(()=>{
    if(sessionExpired)return;
    let controller:AbortController;
    const reload=()=>{
      controller?.abort();
      controller=new AbortController();
      void loadDay(controller.signal);
    };
    const resume=()=>{if(document.visibilityState==="visible")reload()};
    // The day response also supplies the goals used by Trends.
    reload();
    window.addEventListener("focus",resume);
    document.addEventListener("visibilitychange",resume);
    return()=>{
      controller.abort();
      window.removeEventListener("focus",resume);
      document.removeEventListener("visibilitychange",resume);
    };
  },[loadDay,view,sessionExpired]);

  useEffect(()=>{
    if(view!=="trends")return;
    const controller=new AbortController();
    const load=async()=>{
      setTrendLoading(true);
      try {
        const response=await authFetch(`/api/trends?days=${range}`,{signal:controller.signal});
        const data=await response.json() as {error?:string;days:Trend[]};
        if(!response.ok)throw new Error(data.error);
        if(!controller.signal.aborted)setTrends(data.days);
      } catch(error) { if(!controller.signal.aborted)toast.error(error instanceof Error?error.message:"Could not load trends"); }
      finally { if(!controller.signal.aborted)setTrendLoading(false); }
    };
    void load();
    return()=>controller.abort();
  },[view,range,authFetch]);

  const total=useMemo(()=>entries.reduce((a,e)=>({calories:a.calories+e.calories,protein:a.protein+e.protein,carbs:a.carbs+e.carbs,fat:a.fat+e.fat}),{calories:0,protein:0,carbs:0,fat:0}),[entries]);
  const remaining=Math.max(0,goals.calories-total.calories);
  const consumedPct=goals.calories?total.calories/goals.calories*100:0;

  const shiftDate=(days:number)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);setDate(d.toISOString().slice(0,10))};
  const openGoals=()=>{setDraftGoals(goals);setGoalOpen(true)};
  const openFood=()=>setAddOpen(true);
  const deleteEntry=async(id:string)=>{const previous=entries;setEntries(x=>x.filter(e=>e.id!==id));try{const r=await authFetch(`/api/entries?id=${id}`,{method:"DELETE"});if(!r.ok)throw new Error("Could not remove food");toast.success("Food removed")}catch{setEntries(previous);toast.error("Could not remove food")}};
  const updateGoals=async()=>{setSaving(true);try{const r=await authFetch("/api/goals",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(draftGoals)});const d=await r.json() as Goals & { error?: string };if(!r.ok)throw new Error(d.error);setGoals(d);setGoalOpen(false);toast.success("Daily goals updated")}catch(e){toast.error(e instanceof Error?e.message:"Could not save goals")}finally{setSaving(false)}};

  useEffect(()=>{
    const ctx=(document as Document & {modelContext?:{registerTool:(tool:unknown,opts:{signal:AbortSignal})=>void}}).modelContext;if(!ctx?.registerTool)return;const c=new AbortController();
    ctx.registerTool({name:"open_food_search",title:"Open food search",description:"Open the food search so the user can find and add a food to today's diary.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{setView("today");openFood();return{opened:true,date}}},{signal:c.signal});
    ctx.registerTool({name:"show_nutrition_trends",title:"Show nutrition trends",description:"Open nutrition trend charts for 7, 30, or 183 days.",inputSchema:{type:"object",properties:{days:{type:"number",enum:[7,30,183]}},required:["days"],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:(input:unknown)=>{const days=(input as {days:number}).days;if(![7,30,183].includes(days))throw new Error("Days must be 7, 30, or 183");setRange(days);setView("trends");return{opened:true,days}}},{signal:c.signal});return()=>c.abort();
  },[date]);

  if (sessionExpired) return <SignIn expired />;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><Logo/><span>Gramello</span></div>
      <nav aria-label="Main navigation">
        <button className={view==="today"?"active":""} onClick={()=>setView("today")}><LayoutDashboard/>Today</button>
        <button className={view==="trends"?"active":""} onClick={()=>setView("trends")}><TrendingUp/>Trends</button>
      </nav>
      <div className="sidebar-card"><Sparkles/><strong>Stay consistent</strong><span>Small choices, tracked daily, become visible progress.</span></div>
      <button className="settings-link" onClick={openGoals}><Settings2/>Daily goals</button>
    </aside>

    <main>
      <header className="topbar">
        <div className="mobile-brand"><Logo/><span>Gramello</span></div>
        <div><p>{view==="today"?"DAILY DIARY":"NUTRITION ANALYTICS"}</p><h1>{view==="today"?"Today’s fuel":"Your progress"}</h1></div>
        <div className="topbar-actions">
          <Button onClick={openFood} className="add-food" aria-label="Add food"><Plus/><span>Add food</span></Button>
          <ProfileMenu displayName={user.displayName} email={user.email}/>
        </div>
      </header>

      <div className="mobile-tabs"><button className={view==="today"?"active":""} onClick={()=>setView("today")}><LayoutDashboard/>Today</button><button className={view==="trends"?"active":""} onClick={()=>setView("trends")}><TrendingUp/>Trends</button></div>

      {view==="today"?<section className="page-content">
        <div className="date-row"><button aria-label="Previous day" onClick={()=>shiftDate(-1)}><ChevronLeft/></button><div><CalendarDays/><span>{date===today()?"Today":fmtDate(date)}</span></div><button aria-label="Next day" disabled={date>=today()} onClick={()=>shiftDate(1)}><ChevronRight/></button></div>
        <div className="overview-card">
          <div className="calorie-focus"><div className="calorie-ring" style={{"--pct":`${clamp(consumedPct)}%`} as React.CSSProperties}><div><strong>{round(remaining).toLocaleString()}</strong><span>cal left</span></div></div><div><span className="eyebrow">DAILY ENERGY</span><h2>{round(total.calories).toLocaleString()} <small>of {goals.calories.toLocaleString()} kcal</small></h2><p>{consumedPct>100?`${round(total.calories-goals.calories)} calories over goal`:`${round(consumedPct)}% of your calorie target logged`}</p></div></div>
          <div className="macro-grid"><MacroProgress label="Protein" current={total.protein} target={goals.protein} color="#6ee7c7"/><MacroProgress label="Carbs" current={total.carbs} target={goals.carbs} color="#78a9ff"/><MacroProgress label="Fat" current={total.fat} target={goals.fat} color="#ffbd66"/></div>
        </div>

        <div className="diary-heading"><div><span className="eyebrow">MEALS</span><h2>Food diary</h2></div><button onClick={openGoals}><Target/>Edit goals</button></div>
        {loading?<div className="loading-card"><Loader2 className="spin"/>Loading your diary…</div>:<div className="meal-list">{meals.map(name=>{const items=entries.filter(e=>e.meal===name);const c=items.reduce((s,e)=>s+e.calories,0);return <article className="meal-card" key={name}><header><div><span className={`meal-icon ${name.toLowerCase()}`}><Utensils/></span><div><h3>{name}</h3><p>{items.length?`${items.length} item${items.length===1?"":"s"}`:"Nothing logged yet"}</p></div></div><div><strong>{round(c)}</strong><span>kcal</span><button aria-label={`Add ${name}`} onClick={()=>{setMeal(name);openFood()}}><Plus/></button></div></header>{items.length>0&&<div className="food-rows">{items.map(item=><div className="food-row" key={item.id}><div className="food-thumb">{item.name.charAt(0)}</div><div><strong>{item.name}</strong><span>{item.brand?`${item.brand} · `:""}{entryAmountLabel(item)} · {item.source}</span><FoodVerification verified={item.verified}/></div><div className="food-macros"><span><b>{round(item.protein)}g</b>P</span><span><b>{round(item.carbs)}g</b>C</span><span><b>{round(item.fat)}g</b>F</span></div><strong className="food-cal">{round(item.calories)}</strong><button className="delete" aria-label={`Remove ${item.name}`} onClick={()=>void deleteEntry(item.id)}><Trash2/></button></div>)}</div>}</article>})}</div>}
      </section>:<Trends range={range} setRange={setRange} trends={trends} loading={trendLoading} goals={goals}/>} 
    </main>

    {addOpen && <FoodDialog date={date} initialMeal={meal} authFetch={authFetch} onClose={()=>setAddOpen(false)} onAdded={entry=>{setEntries(prev=>[...prev,entry]);setAddOpen(false);toast.success(`${entry.name} added to ${entry.meal.toLowerCase()}`)}}/>}

    <Dialog open={goalOpen} onOpenChange={setGoalOpen}><DialogContent className="goal-dialog"><DialogHeader><DialogTitle>Daily targets</DialogTitle><DialogDescription>Macro grams update calories automatically. Changing calories keeps your current macro percentage split.</DialogDescription></DialogHeader><div className="goal-fields">{(["calories","protein","carbs","fat"] as const).map(k=><label key={k}><span>{k.charAt(0).toUpperCase()+k.slice(1)}{k!=="calories"&&<small style={{display:"block",color:"#6ee7c7",fontSize:".8rem"}}>{macroPercent(draftGoals,k).toFixed(1)}%</small>}</span><div><Input type="number" min="0" step="any" value={Math.round(draftGoals[k]*100)/100} onChange={e=>setDraftGoals(g=>changeGoal(g,k,Number(e.target.value)))}/><span>{k==="calories"?"kcal":"g"}</span></div></label>)}</div><p style={{fontSize:".875rem",color:"#8ca1b2"}}>Protein & carbs: 4 kcal/g · Fat: 9 kcal/g. Grams are displayed rounded to two decimals. If all macros are zero, changing calories starts a 30/40/30 split.</p><Button className="confirm-button" onClick={()=>void updateGoals()} disabled={saving||draftGoals.calories<=0}>{saving&&<Loader2 className="spin"/>}Save goals</Button></DialogContent></Dialog>
    <Toaster richColors position="bottom-right"/>
  </div>
}

function Trends({range,setRange,trends,loading,goals}:{range:number;setRange:(n:number)=>void;trends:Trend[];loading:boolean;goals:Goals}){
  const avg=(key:keyof Omit<Trend,"date">)=>trends.length?trends.reduce((s,d)=>s+Number(d[key]),0)/trends.length:0;
  const adherent=trends.length?trends.filter(d=>Math.abs(d.calories-goals.calories)<=goals.calories*.1).length/trends.length*100:0;
  const proteinDays=trends.length?trends.filter(d=>d.protein>=goals.protein*.9).length:0;
  const chartData=trends.map(d=>({...d,label:new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(`${d.date}T12:00:00Z`)),goal:goals.calories}));
  return <section className="page-content trends-page"><div className="trends-toolbar"><div><span className="eyebrow">ROLLING VIEW</span><h2>Nutrition trends</h2></div><Tabs value={String(range)} onValueChange={v=>setRange(Number(v))}><TabsList><TabsTrigger value="7">7 days</TabsTrigger><TabsTrigger value="30">30 days</TabsTrigger><TabsTrigger value="183">6 months</TabsTrigger></TabsList></Tabs></div>
    <div className="stat-grid"><div><span>Average calories</span><strong>{round(avg("calories")).toLocaleString()}</strong><small>daily kcal</small></div><div><span>Goal-range days</span><strong>{round(adherent)}%</strong><small>within ±10%</small></div><div><span>Average protein</span><strong>{round(avg("protein"))}g</strong><small>{round(avg("protein")-goals.protein)}g vs target</small></div><div><span>Protein target</span><strong>{proteinDays}</strong><small>days at 90%+</small></div></div>
    <div className="chart-card"><div className="chart-title"><div><span className="eyebrow">ENERGY</span><h3>Calories over time</h3></div><div className="legend"><span><i className="actual"/>Actual</span><span><i className="goal"/>Goal</span></div></div>{loading?<div className="chart-empty"><Loader2 className="spin"/>Loading trends…</div>:chartData.length===0?<div className="chart-empty"><Activity/><strong>Your chart starts with your first logged day</strong><span>Food you log today will appear here automatically.</span></div>:<div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:12,right:8,left:-18,bottom:0}}><defs><linearGradient id="calFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6ee7c7" stopOpacity={.38}/><stop offset="1" stopColor="#6ee7c7" stopOpacity={.02}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#21384a" strokeDasharray="3 5"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill:"#8ca1b2",fontSize:12}} minTickGap={28}/><YAxis axisLine={false} tickLine={false} tick={{fill:"#8ca1b2",fontSize:12}}/><ChartTooltip contentStyle={{background:"#10283a",border:"1px solid #29465a",borderRadius:14,color:"#fff"}}/><Area type="monotone" dataKey="goal" stroke="#78a9ff" strokeDasharray="5 5" fill="transparent"/><Area type="monotone" dataKey="calories" stroke="#6ee7c7" strokeWidth={3} fill="url(#calFill)"/></AreaChart></ResponsiveContainer></div>}</div>
    <div className="chart-card"><div className="chart-title"><div><span className="eyebrow">MACRONUTRIENTS</span><h3>Daily macro mix</h3></div><div className="legend"><span><i style={{background:"#6ee7c7"}}/>Protein</span><span><i style={{background:"#78a9ff"}}/>Carbs</span><span><i style={{background:"#ffbd66"}}/>Fat</span></div></div>{chartData.length>0?<div className="chart-wrap short"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{top:12,right:8,left:-18,bottom:0}}><CartesianGrid vertical={false} stroke="#21384a"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill:"#8ca1b2",fontSize:12}} minTickGap={28}/><YAxis axisLine={false} tickLine={false} tick={{fill:"#8ca1b2",fontSize:12}}/><ChartTooltip contentStyle={{background:"#10283a",border:"1px solid #29465a",borderRadius:14,color:"#fff"}}/><Bar dataKey="protein" stackId="m" fill="#6ee7c7" radius={[0,0,3,3]}/><Bar dataKey="carbs" stackId="m" fill="#78a9ff"/><Bar dataKey="fat" stackId="m" fill="#ffbd66" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div>:<div className="chart-empty small"><span>No macro data in this range yet.</span></div>}</div>
  </section>
}
