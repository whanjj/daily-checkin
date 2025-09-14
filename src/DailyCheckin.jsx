import React, { useEffect, useMemo, useRef, useState } from "react";

/* ================= 错误边界 ================= */
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={hasError:false,error:null}; }
  static getDerivedStateFromError(e){ return {hasError:true,error:e}; }
  componentDidCatch(e, info){ console.error("UI Crash", e, info); }
  render(){
    if(this.state.hasError){
      return (<div style={{padding:20,fontFamily:"sans-serif"}}>
        <h2>😵 页面出错了</h2>
        <pre style={{whiteSpace:"pre-wrap",color:"#b91c1c",background:"#fee2e2",padding:12,borderRadius:8,border:"1px solid #fecaca"}}>{String(this.state.error)}</pre>
      </div>);
    }
    return this.props.children;
  }
}

/* ================= 小工具 ================= */
const pad = (n)=> n<10?`0${n}`:`${n}`;
const dateKey = (d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const monthKey = (d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const yearKey  = (d=new Date())=>`${d.getFullYear()}`;
const getISOWeek=(d=new Date())=>{
  const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=t.getUTCDay()||7; t.setUTCDate(t.getUTCDate()+4-day);
  const y0=new Date(Date.UTC(t.getUTCFullYear(),0,1));
  const wk=Math.ceil((((t-y0)/86400000)+1)/7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2,"0")}`;
};
const uid = ()=>Math.random().toString(36).slice(2,10);
const timeToNum = (hhmm="00:00")=>{ const [h,m]=String(hhmm).split(":").map(Number); return (h||0)*60+(m||0); };
const compareByFixedWindow = (a,b)=>{
  const sa=(a.fixedWindow||"23:59-23:59").split("-")[0];
  const sb=(b.fixedWindow||"23:59-23:59").split("-")[0];
  return timeToNum(sa)-timeToNum(sb);
};
const spanMinutes=(win)=>{ if(!win) return 25; const [s,e]=win.split("-"); return Math.max(5, timeToNum(e)-timeToNum(s)); };
const download=(filename,text,mime="text/plain;charset=utf-8")=>{
  const blob=new Blob([text],{type:mime}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
};
const PRIORITY_LABEL={ IN:"重要&紧急", In:"重要不紧急", nN:"不重要但紧急", nn:"不重要不紧急" };
const PRIORITY_ORDER=["IN","In","nN","nn"];

/* ================= 精力槽（提示用） ================= */
const ENERGY_PRESET={ morningHigh:"09:00-12:00", afternoonMid:"14:00-17:30", eveningLow:"19:00-22:00" };
const timeIn=(win,hhmm)=>{ if(!win) return false; const [s,e]=win.split("-"); const n=timeToNum(hhmm); return n>=timeToNum(s)&&n<=timeToNum(e); };
const energyAt=(hhmm)=>{
  if (timeIn(ENERGY_PRESET.morningHigh,hhmm)) return "high";
  if (timeIn(ENERGY_PRESET.afternoonMid,hhmm)) return "mid";
  if (timeIn(ENERGY_PRESET.eveningLow,hhmm)) return "low";
  return "unknown";
};
const isOverdueNow=(today,t)=>{
  if(!t.fixedWindow) return false;
  const [,end]=t.fixedWindow.split("-");
  const now=new Date(); if(dateKey(today)!==dateKey(now)) return false;
  return (now.getHours()*60+now.getMinutes())>timeToNum(end) && !t.done;
};

/* ================= 文本解析：四象限输入 → 任务 ================= */
// 支持行语法： [09:00-09:25] 写公众号 → 500字
const parseLineToTask=(line, priority="In")=>{
  let s=String(line||"").trim(); if(!s) return null;
  let fixedWindow=""; const m=s.match(/^\s*\[([0-2]\d:[0-5]\d-[0-2]\d:[0-5]\d)\]\s*/);
  if(m){ fixedWindow=m[1]; s=s.replace(m[0],""); }
  let title=s, output="";
  const a=s.split("→"); if(a.length>=2){ title=a[0].trim(); output=a.slice(1).join("→").trim(); }
  else { const b=s.split("->"); if(b.length>=2){ title=b[0].trim(); output=b.slice(1).join("->").trim(); } }
  if(!title) title="未命名任务";
  return {
    id: uid(),
    title, output,
    fixedWindow,
    minutes: spanMinutes(fixedWindow),
    section: "核心产出",
    priority,
    plannedPomos: 1,      // ✅ 固定番茄钟（默认 1 份，可编辑）
    donePomos: 0,
    done: false,
    remark: "",
  };
};

/* ================= 番茄钟（全球唯一计时器，结束自动 +1） ================= */
function Pomodoro({ onFocusDone }) {
  const DUR = { "25/5": { focus:25*60, rest:5*60 }, "50/10": { focus:50*60, rest:10*60 } };
  const PKEY=`pomo-${dateKey(new Date())}`;
  const [mode,setMode]=useState("25/5");
  const [phase,setPhase]=useState("focus");
  const [running,setRunning]=useState(false);
  const [endAt,setEndAt]=useState(null);
  const [remain,setRemain]=useState(0);
  const [bjNow,setBjNow]=useState(()=>new Date());
  const [bindTaskId,setBindTaskId]=useState("");

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(PKEY); if(raw){
        const s=JSON.parse(raw);
        setMode(s.mode||"25/5"); setPhase(s.phase||"focus");
        setRunning(!!s.running); setEndAt(typeof s.endAt==="number"? s.endAt:null);
        setBindTaskId(s.bindTaskId||"");
      }
    }catch{}
  },[]);
  const persist=(extra={})=>{
    try{ localStorage.setItem(PKEY, JSON.stringify({mode,phase,running,endAt,bindTaskId,...extra})); }catch{}
  };

  const tick=()=> Math.max(0, Math.ceil(((endAt||0)-Date.now())/1000));
  useEffect(()=>{ setRemain(tick()); const iv=setInterval(()=>setRemain(tick()),250); const clk=setInterval(()=>setBjNow(new Date()),1000); return ()=>{clearInterval(iv);clearInterval(clk);}; },[endAt]);

  useEffect(()=>{
    if(running && endAt && remain===0){
      if(phase==="focus"){ onFocusDone?.(bindTaskId); }
      const nextPhase= phase==="focus" ? "rest" : "focus";
      setPhase(nextPhase); setRunning(false); setEndAt(null); persist({phase:nextPhase,running:false,endAt:null});
      try{
        if("Notification" in window){
          if(Notification.permission==="granted") new Notification(phase==="focus"?"专注结束":"休息结束",{body: phase==="focus"?"该休息了～":"准备开始下一轮！"});
          else if(Notification.permission!=="denied") Notification.requestPermission();
        }
        if(navigator.vibrate) navigator.vibrate(180);
      }catch{}
    }
  },[remain,running,endAt,phase,onFocusDone,bindTaskId]);

  const start=()=>{
    if(running) return;
    const dur=DUR[mode][phase]; const t=Date.now()+dur*1000;
    setEndAt(t); setRunning(true); setRemain(dur); persist({endAt:t,running:true});
  };
  const pause=()=>{ setRunning(false); persist({running:false}); };
  const reset=()=>{ setRunning(false); setEndAt(null); setPhase("focus"); setRemain(0); persist({running:false,endAt:null,phase:"focus"}); };
  useEffect(()=>{
    const old=document.title;
    if(running&&endAt){ const m=String(Math.floor(remain/60)).padStart(2,"0"); const s=String(remain%60).padStart(2,"0"); document.title=`(${m}:${s}) 番茄钟`; }
    return ()=>{ document.title=old; };
  },[running,endAt,remain]);

  const fmtBj=(ts)=> ts? new Date(ts).toLocaleString("zh-CN",{hour12:false,timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"--:--:--";
  const nowBj=bjNow.toLocaleString("zh-CN",{hour12:false,timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const mm=String(Math.floor(remain/60)).padStart(2,"0"); const ss=String(remain%60).padStart(2,"0");

  return (
    <div style={card}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <h3 style={{margin:0}}>⏱️ 番茄钟（绑定任务后开始）</h3>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <select value={mode} onChange={e=>{ if(running) pause(); setMode(e.target.value); persist({mode:e.target.value}); }} style={select}>
            <option value="25/5">25/5</option>
            <option value="50/10">50/10</option>
          </select>
          <select value={phase} onChange={e=>{ if(running) pause(); setPhase(e.target.value); persist({phase:e.target.value}); }} style={select}>
            <option value="focus">专注</option><option value="rest">休息</option>
          </select>
        </div>
      </div>
      <div style={{marginTop:6,color:"#666"}}>现在北京时间：<b>{nowBj}</b> | 结束时间：{fmtBj(endAt)}</div>
      <div style={{fontSize:48,fontWeight:700,margin:"12px 0"}}>{mm}:{ss}</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {!running? <button style={btnPrimary} onClick={start}>开始</button> : <button style={btn} onClick={pause}>暂停</button>}
        <button style={btn} onClick={reset}>重置</button>
      </div>
      <div style={{fontSize:12,color:"#999",marginTop:8}}>提示：结束一轮“专注”会给当前绑定任务自动 +1 个番茄钟。</div>
    </div>
  );
}

/* ================= 统计/趋势 ================= */
function readAllDayEntries(){
  const entries=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k && k.startsWith("dc-")){
      try{ const d=k.slice(3); const v=JSON.parse(localStorage.getItem(k)||"{}"); entries.push({date:d,tasks:v.tasks||[],notes:v.notes||""}); }catch{}
    }
  }
  return entries.sort((a,b)=>a.date.localeCompare(b.date));
}
function Trend7Days({ today }){
  const all=readAllDayEntries(); const days=[];
  for(let i=6;i>=0;i--){ const d=new Date(today); d.setDate(d.getDate()-i); days.push(dateKey(d)); }
  const rates=days.map(dk=>{ const e=all.find(x=>x.date===dk); if(!e) return 0; const total=e.tasks.length||0; if(!total) return 0; const done=e.tasks.filter(t=>t.done).length; return Math.round(done*100/total); });
  const W=360,H=80,P=8,maxY=100;
  const xs=days.map((_,i)=>P+i*((W-2*P)/(days.length-1)));
  const ys=rates.map(r=>H-P-(r/maxY)*(H-2*P));
  const path=ys.map((y,i)=>i===0?`M ${xs[i]},${y}`:`L ${xs[i]},${y}`).join(" ");
  return (<div style={card}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h3 style={{margin:0}}>📈 近7天完成率</h3><div style={{fontSize:12,color:"#666"}}>单位：%</div></div>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="80" style={{marginTop:8}}>
      {[0,25,50,75,100].map(v=>{ const y=H-P-(v/maxY)*(H-2*P); return <g key={v}><line x1={P} y1={y} x2={W-P} y2={y} stroke="#e5e7eb" strokeDasharray="4 4"/><text x={W-P+2} y={y+3} fontSize="10" fill="#94a3b8">{v}</text></g>; })}
      <path d={path} fill="none" stroke="#3b82f6" strokeWidth="2" />
      {xs.map((x,i)=>(<g key={i}><circle cx={x} cy={ys[i]} r="3" fill="#3b82f6"/><text x={x} y={H-2} fontSize="9" fill="#64748b" textAnchor="middle">{days[i].slice(5)}</text></g>))}
    </svg>
  </div>);
}
function StatsPanel({ today }){
  const [scope,setScope]=useState("day");
  const all=readAllDayEntries();
  const day=dateKey(today), week=getISOWeek(today), month=monthKey(today), year=yearKey(today);
  const inScope=(ds)=> scope==="day"? ds===day : scope==="week"? getISOWeek(new Date(ds))===week : scope==="month"? ds.slice(0,7)===month : ds.slice(0,4)===year;
  const scoped=all.filter(e=>inScope(e.date));
  let total=0,done=0,minutesDone=0, byPriority={IN:0,In:0,nN:0,nn:0};
  scoped.forEach(e=>e.tasks.forEach(t=>{ total++; if(t.done){ done++; minutesDone += Number.isFinite(+t.minutes)? +t.minutes : spanMinutes(t.fixedWindow); if(PRIORITY_LABEL[t.priority]) byPriority[t.priority]=(byPriority[t.priority]||0)+1; } }));
  const rate= total? Math.round(done*100/total):0;
  const exportJSON=()=>download(`stats-${scope}-${Date.now()}.json`, JSON.stringify(scoped,null,2),"application/json");
  const exportCSV=()=>{
    const rows=[["date","title","output","priority","fixedWindow","plannedPomos","donePomos","done","minutes","remark"]];
    scoped.forEach(e=>e.tasks.forEach(t=>rows.push([e.date,t.title||"",t.output||"",t.priority||"",t.fixedWindow||"",t.plannedPomos||0,t.donePomos||0,t.done?1:0, Number.isFinite(+t.minutes)? +t.minutes : spanMinutes(t.fixedWindow), (t.remark||"").replace(/\n/g," ")])));
    const csv=rows.map(r=>r.map(x=>{ const s=String(x??""); return s.includes(",")||s.includes('"')?`"${s.replace(/"/g,'""')}"`:s; }).join(",")).join("\n");
    download(`stats-${scope}-${Date.now()}.csv`, csv, "text/csv;charset=utf-8");
  };
  return (<div style={card}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <h3 style={{margin:0}}>📊 统计面板</h3>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <select value={scope} onChange={e=>setScope(e.target.value)} style={select}><option value="day">今日</option><option value="week">本周</option><option value="month">本月</option><option value="year">今年</option></select>
        <button style={btn} onClick={exportJSON}>导出JSON</button>
        <button style={btn} onClick={exportCSV}>导出CSV</button>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginTop:12}}>
      <div style={statCard}><div style={statNum}>{done}</div><div style={statLabel}>完成任务</div></div>
      <div style={statCard}><div style={statNum}>{total}</div><div style={statLabel}>总任务</div></div>
      <div style={statCard}><div style={statNum}>{rate}%</div><div style={statLabel}>完成率</div></div>
      <div style={statCard}><div style={statNum}>{minutesDone}</div><div style={statLabel}>完成分钟</div></div>
    </div>
    <div style={{marginTop:16}}>
      <h4 style={{margin:"8px 0"}}>四象限完成分布</h4>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {PRIORITY_ORDER.map(k=><span key={k} style={badge}>{PRIORITY_LABEL[k]}：{byPriority[k]||0}</span>)}
      </div>
    </div>
  </div>);
}

/* ================= 四象限计划面板（生成/注入） ================= */
function QuadrantPlanner({ onGenerate, onInject }) {
  const KEY = `quad-plan-${dateKey(new Date())}`;
  const [state,setState]=useState(()=>{ try{ return JSON.parse(localStorage.getItem(KEY)||"{}"); }catch{ return {}; }});
  useEffect(()=>{ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch{} },[state]);
  const toLines=(txt)=>String(txt||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const buildTasks=()=>{
    const arr=[];
    toLines(state.IN).forEach(l=>{ const t=parseLineToTask(l,"IN"); if(t) arr.push(t); });
    toLines(state.In).forEach(l=>{ const t=parseLineToTask(l,"In"); if(t) arr.push(t); });
    toLines(state.nN).forEach(l=>{ const t=parseLineToTask(l,"nN"); if(t) arr.push(t); });
    toLines(state.nn).forEach(l=>{ const t=parseLineToTask(l,"nn"); if(t) arr.push(t); });
    // 有时间段的在前
    const withTime=arr.filter(t=>t.fixedWindow); withTime.sort(compareByFixedWindow);
    const noTime=arr.filter(t=>!t.fixedWindow);
    return [...withTime,...noTime];
  };
  return (
    <div style={card}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <h3 style={{margin:0}}>🧭 四象限计划</h3>
        <div style={{display:"flex",gap:8}}>
          <button style={btnPrimary} onClick={()=>onGenerate?.(buildTasks())}>生成今日清单</button>
          <button style={btn} onClick={()=>onInject?.(buildTasks())}>追加到今日清单</button>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12, marginTop:12}}>
        <div>
          <h4 style={{margin:"4px 0"}}>🔴 重要 & 紧急</h4>
          <textarea style={{...textarea,minHeight:100}} placeholder="每行一个任务；支持：[09:00-09:25] 任务 → 产出" value={state.IN||""} onChange={e=>setState(s=>({...s,IN:e.target.value}))}/>
        </div>
        <div>
          <h4 style={{margin:"4px 0"}}>🟢 重要不紧急</h4>
          <textarea style={{...textarea,minHeight:100}} placeholder="每行一个任务" value={state.In||""} onChange={e=>setState(s=>({...s,In:e.target.value}))}/>
        </div>
        <div>
          <h4 style={{margin:"4px 0"}}>🟠 不重要但紧急</h4>
          <textarea style={{...textarea,minHeight:100}} placeholder="每行一个任务" value={state.nN||""} onChange={e=>setState(s=>({...s,nN:e.target.value}))}/>
        </div>
        <div>
          <h4 style={{margin:"4px 0"}}>⚪ 不重要不紧急</h4>
          <textarea style={{...textarea,minHeight:100}} placeholder="每行一个任务" value={state.nn||""} onChange={e=>setState(s=>({...s,nn:e.target.value}))}/>
        </div>
      </div>
      <div style={{fontSize:12,color:"#666",marginTop:8}}>建议：把战略类任务写在“重要不紧急”，并尽量安排到上午的高能时段。</div>
    </div>
  );
}

/* ================= 主组件 ================= */
export default function DailyCheckin(){
  return <ErrorBoundary><AppInner/></ErrorBoundary>;
}

function AppInner(){
  const [today,setToday]=useState(()=>new Date());
  const storageKey=useMemo(()=>`dc-${dateKey(today)}`,[today]);

  const [tasks,setTasks]=useState([]);
  const [notes,setNotes]=useState("");
  const [locked,setLocked]=useState(true);
  const pomoRef = useRef(null); // 接收 onFocusDone

  // 初始加载
  useEffect(()=>{
    const raw=localStorage.getItem(storageKey);
    if(raw){
      try{ const d=JSON.parse(raw); setTasks(Array.isArray(d?.tasks)? d.tasks:[]); setNotes(typeof d?.notes==="string"? d.notes:""); return; }catch{}
    }
    setTasks([]); setNotes("");
  },[storageKey]);

  // 持久化
  useEffect(()=>{ try{ localStorage.setItem(storageKey, JSON.stringify({tasks,notes})); }catch{} },[tasks,notes,storageKey]);

  const visible=[...tasks].sort(compareByFixedWindow);
  const doneCount=visible.filter(t=>t.done).length;
  const prog=visible.length? Math.round(doneCount*100/visible.length):0;

  // 行为
  const toggleDone=(id)=>setTasks(arr=>arr.map(t=>t.id===id? {...t,done:!t.done}:t));
  const removeTask =(id)=>setTasks(arr=>arr.filter(t=>t.id!==id));
  const addTask=()=>setTasks(arr=>[...arr,{id:uid(),title:"自定义任务",output:"",fixedWindow:"",minutes:25,priority:"In",plannedPomos:1,donePomos:0,section:"核心产出",done:false,remark:""}]);
  const updateTask=(id,patch)=>setTasks(arr=>arr.map(t=>t.id===id? ({...t,...patch, minutes: ("fixedWindow" in patch && patch.fixedWindow)? spanMinutes(patch.fixedWindow) : (Number.isFinite(+patch?.minutes)? +patch.minutes : t.minutes)}):t));

  const shiftDay=(dlt)=>{ const d=new Date(today); d.setDate(d.getDate()+dlt); setToday(d); };

  // 绑定任务到番茄钟（结束 +1）
  const onFocusDone=(bindTaskId)=>{
    if(!bindTaskId) return;
    setTasks(arr=>arr.map(t=>{
      if(t.id!==bindTaskId) return t;
      const nextP = Math.max(0,(t.donePomos||0)+1);
      const doneNow = nextP >= (t.plannedPomos||1) ? true : t.done;
      return {...t, donePomos: nextP, done: doneNow};
    }));
  };

  // 生成/注入（来自四象限计划）
  const generateToday=(newTasks=[])=>{
    setTasks(newTasks);
    localStorage.setItem(storageKey, JSON.stringify({tasks:newTasks, notes}));
  };
  const injectToday=(newTasks=[])=>{
    // 同名去重（按标题）
    const titleSet=new Set(tasks.map(t=>String(t.title||"").trim()));
    const merged=[...tasks, ...newTasks.filter(t=>!titleSet.has(String(t.title||"").trim()))];
    setTasks(merged);
    localStorage.setItem(storageKey, JSON.stringify({tasks:merged, notes}));
    alert(`已追加 ${merged.length - tasks.length} 条任务到今日清单`);
  };

  return (
    <div style={page}>
      <header style={header}>
        <div>
          <h1 style={{margin:0}}>📅 每日执行打卡</h1>
          <div style={{color:"#666"}}>{dateKey(today)}</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button style={btn} onClick={()=>shiftDay(-1)}>← 前一天</button>
          <button style={btn} onClick={()=>setToday(new Date())}>回到今天</button>
          <button style={btn} onClick={()=>shiftDay(1)}>后一天 →</button>
          <button style={btn} onClick={()=>setLocked(l=>!l)}>{locked? "解锁编辑":"锁定"}</button>
          <button style={btn} onClick={()=>{ const ok=confirm("清空今日清单？"); if(!ok) return; setTasks([]); }}>清空</button>
        </div>
      </header>

      {/* 进度 */}
      <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between"}}>
          <div>今日进度</div><div>{doneCount}/{visible.length}（{prog}%）</div>
        </div>
        <div style={barWrap}><div style={{...barFill,width:`${prog}%`}}/></div>
        <div style={{fontSize:12,color:"#666",marginTop:6}}>精力槽：上午高能 {ENERGY_PRESET.morningHigh} ｜ 下午中能 {ENERGY_PRESET.afternoonMid} ｜ 晚上低能 {ENERGY_PRESET.eveningLow}</div>
      </div>

      {/* 番茄钟（全局） */}
      <Pomodoro onFocusDone={onFocusDone} ref={pomoRef} />

      {/* 四象限计划面板（生成/注入） */}
      <QuadrantPlanner onGenerate={generateToday} onInject={injectToday} />

      {/* 今日任务清单（固定番茄钟 + 可选时间段） */}
      <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <h3 style={{margin:0}}>✅ 今日任务（番茄钟固定份数 + 可选时间段）</h3>
          {!locked && <button style={btnPrimary} onClick={addTask}>+ 新增任务</button>}
        </div>

        <div style={{marginTop:12}}>
          {visible.length===0 && <div style={{color:"#666"}}>今天还没有任务。请在上面的「四象限计划」里填写并生成/追加。</div>}

          {visible.map(t=>{
            const overdue=isOverdueNow(today,t);
            const startHHMM=(t.fixedWindow||"").split("-")[0]||"";
            const energy= startHHMM? energyAt(startHHMM): "unknown";
            const important=(t.priority||"In").startsWith("I");
            const energyWarn= important && (energy==="low"||energy==="unknown");

            return (
              <div key={t.id} style={{...taskRow, ...(t.done? rowDone:null)}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12,width:"100%"}}>
                  <input type="checkbox" checked={!!t.done} onChange={()=>toggleDone(t.id)} style={{marginTop:4}} title="完成勾选"/>
                  <div style={{flex:1}}>
                    {locked ? (
                      <>
                        <div style={{display:"flex",flexWrap:"wrap",alignItems:"baseline",gap:8}}>
                          {t.fixedWindow && <span style={badgeTime}>{t.fixedWindow}</span>}
                          <span style={badge}>{PRIORITY_LABEL[t.priority||"In"]}</span>
                          <span style={{...titleText, ...(t.done? titleDone:null)}}>{t.title||"未命名任务"}</span>
                          {t.output && <span style={chip}>产出：{t.output}</span>}
                          <span style={chip}>Pomo：{t.donePomos||0} / {t.plannedPomos||1}</span>
                          {overdue && <span style={overdueTag}>已过时</span>}
                          {energyWarn && <span style={warnTag}>⚠ 重要任务建议放到高能时段</span>}
                        </div>
                        <textarea style={textarea} placeholder="备注/产出链接/要点…" value={t.remark||""} onChange={e=>updateTask(t.id,{remark:e.target.value})}/>
                      </>
                    ) : (
                      <>
                        <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
                          <input style={textInput} value={t.title||""} onChange={e=>updateTask(t.id,{title:e.target.value})} placeholder="任务标题"/>
                          <select value={t.priority||"In"} onChange={e=>updateTask(t.id,{priority:e.target.value})} style={select} title="四象限">
                            {PRIORITY_ORDER.map(k=><option key={k} value={k}>{PRIORITY_LABEL[k]}</option>)}
                          </select>
                          <input style={{...textInput,maxWidth:180}} value={t.fixedWindow||""} onChange={e=>updateTask(t.id,{fixedWindow:e.target.value})} placeholder="时间段 09:00-09:25"/>
                          <input style={{...textInput,maxWidth:220}} value={t.output||""} onChange={e=>updateTask(t.id,{output:e.target.value})} placeholder="产出（如：500字草稿）"/>
                          <label style={{fontSize:12,color:"#111",display:"inline-flex",alignItems:"center",gap:6}}>
                            计划番茄钟
                            <input type="number" min={1} step={1} value={t.plannedPomos||1} onChange={e=>updateTask(t.id,{plannedPomos:Math.max(1,parseInt(e.target.value||"1",10))})} style={{width:64,...textInput}}/>
                          </label>
                          <button style={btnDanger} onClick={()=>removeTask(t.id)}>删除</button>
                        </div>
                        <div style={{display:"flex",gap:8,alignItems:"center",marginTop:6,flexWrap:"wrap"}}>
                          <span style={badge}>已完成 Pomo：{t.donePomos||0}</span>
                          <button style={btn} onClick={()=>updateTask(t.id,{donePomos:Math.max(0,(t.donePomos||0)-1)})}>-1</button>
                          <button style={btn} onClick={()=>updateTask(t.id,{donePomos:(t.donePomos||0)+1})}>+1</button>
                        </div>
                        <textarea style={textarea} placeholder="备注/产出链接/要点…" value={t.remark||""} onChange={e=>updateTask(t.id,{remark:e.target.value})}/>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 统计 + 趋势 */}
      <StatsPanel today={today}/>
      <Trend7Days today={today}/>

      {/* 复盘 */}
      <div style={card}>
        <h3 style={{marginTop:0}}>📝 今日复盘/杂记</h3>
        <textarea style={{...textarea,minHeight:120}} placeholder="1）完成了什么？ 2）哪些没完成，原因？ 3）明天最重要的一件事？" value={notes} onChange={e=>setNotes(e.target.value)}/>
      </div>

      <footer style={{fontSize:12,color:"#999",textAlign:"center",margin:"24px 0"}}>
        每个任务都有固定番茄钟份数，可选时间段；四象限面板用于生成/管理今日任务。数据保存在浏览器 localStorage。
      </footer>
    </div>
  );
}

/* ================= 样式 ================= */
const page={maxWidth:960,margin:"0 auto",padding:"24px 16px",fontFamily:"-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif",color:"#111",background:"#fafafa"};
const header={display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12};
const card={background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:16,marginTop:12,boxShadow:"0 1px 2px rgba(0,0,0,.03)"};
const barWrap={height:10,background:"#f1f5f9",borderRadius:999,overflow:"hidden",marginTop:8};
const barFill={height:"100%",background:"linear-gradient(90deg,#22c55e,#3b82f6)"};
const btn={padding:"8px 12px",border:"1px solid #e5e7eb",background:"#fff",borderRadius:8,cursor:"pointer"};
const btnPrimary={...btn,background:"#111",color:"#fff",borderColor:"#111"};
const btnDanger={...btn,borderColor:"#ef4444",color:"#ef4444",background:"#fff"};
const textInput={padding:"8px 10px",borderRadius:8,border:"1px solid #e5e7eb",outline:"none"};
const select={padding:"8px 10px",borderRadius:8,border:"1px solid #e5e7eb",background:"#fff"};
const textarea={width:"100%",marginTop:8,padding:10,border:"1px solid #e5e7eb",borderRadius:8,minHeight:64,outline:"none",resize:"vertical"};
const taskRow={borderBottom:"1px solid #f1f5f9",padding:"12px 0",display:"flex",flexDirection:"column",gap:6};
const badgeTime={fontFamily:"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",fontSize:12,padding:"2px 6px",borderRadius:6,background:"#eef2ff",color:"#3730a3",border:"1px solid #e0e7ff"};
const badge={fontSize:12,padding:"2px 6px",borderRadius:6,background:"#f1f5f9",color:"#0f172a",border:"1px solid #e5e7eb"};
const titleText={fontSize:15,fontWeight:600};
const chip={fontSize:12,padding:"2px 6px",borderRadius:999,background:"#ecfeff",color:"#155e75",border:"1px solid #cffafe"};
const rowDone={opacity:.55}; const titleDone={textDecoration:"line-through"};
const overdueTag={fontSize:12,padding:"2px 6px",borderRadius:6,background:"#fee2e2",color:"#991b1b",border:"1px solid #fecaca"};
const warnTag={fontSize:12,padding:"2px 6px",borderRadius:6,background:"#fff7ed",color:"#9a3412",border:"1px solid #fed7aa"};
const statCard={border:"1px solid #e5e7eb",borderRadius:12,padding:"12px 10px",background:"#fff",textAlign:"center"};
const statNum={fontSize:24,fontWeight:700}; const statLabel={fontSize:12,color:"#666"};
