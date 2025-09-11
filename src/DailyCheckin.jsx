import React, { useEffect, useMemo, useState } from "react";

/* ------------------ 错误边界：防止整页白屏 ------------------ */
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError:false, error:null }; }
  static getDerivedStateFromError(error){ return { hasError:true, error }; }
  componentDidCatch(error, info){ console.error("UI Crash:", error, info); }
  render(){
    if(this.state.hasError){
      return (
        <div style={{padding:20, fontFamily:"sans-serif"}}>
          <h2>😵 页面出错了，但我没让它白屏</h2>
          <div style={{whiteSpace:"pre-wrap", color:"#b91c1c", background:"#fee2e2", padding:12, borderRadius:8, border:"1px solid #fecaca"}}>
            {String(this.state.error)}
          </div>
          <p style={{color:"#666"}}>把上面的红字发我，我立刻定位修复。</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ------------------ 小工具 ------------------ */
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const yearKey = (d = new Date()) => `${d.getFullYear()}`;
const getISOWeek = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(weekNo).padStart(2,"0")}`;
};
const uid = () => Math.random().toString(36).slice(2, 10);

const timeToNum = (hhmm = "00:00") => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const compareByFixedWindow = (a, b) => {
  const sa = (a.fixedWindow || "23:59-23:59").split("-")[0];
  const sb = (b.fixedWindow || "23:59-23:59").split("-")[0];
  return timeToNum(sa) - timeToNum(sb);
};
const spanMinutes = (win) => {
  if(!win) return 25;
  const [s, e] = win.split("-");
  return Math.max(5, timeToNum(e) - timeToNum(s));
};
// 今天是否逾期（只对“今天”计算）
const isOverdueNow = (today, t) => {
  if (!t.fixedWindow) return false;
  const [_, end] = t.fixedWindow.split("-");
  const now = new Date();
  const isSameDay = dateKey(today) === dateKey(now);
  if (!isSameDay) return false;
  const nowMin = now.getHours()*60 + now.getMinutes();
  return nowMin > timeToNum(end) && !t.done;
};
// 下载工具
function download(filename, text, mime="text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ------------------ 固定任务模板（你的清单） ------------------ */
const DEFAULT_TASKS = [
  { fixedWindow: "09:00-09:50", section: "核心产出", title: "写公众号草稿500字",            output: "500字草稿" },
  { fixedWindow: "10:00-10:25", section: "核心产出", title: "改稿+排版",                    output: "可发布文章" },
  { fixedWindow: "10:30-10:55", section: "热点捕捉", title: "浏览热榜，记录3条热点",         output: "热点清单" },
  { fixedWindow: "11:00-11:15", section: "爆款拆解", title: "拆解1个爆款标题/开头",         output: "拆解笔记" },
  { fixedWindow: "11:15-11:30", section: "对标学习", title: "对比1个账号选题（隔日）",       output: "对标表", altDays: true }, // 偶数日显示
  { fixedWindow: "11:30-12:00", section: "股票",     title: "查盘+写下1条操作逻辑",          output: "投资日志" },
  { fixedWindow: "14:00-14:30", section: "学习升级", title: "Coze/AI 短视频：做1个小案例",   output: "工作流/短视频demo" },
  { fixedWindow: "14:30-15:00", section: "输入",     title: "阅读10页+写3条灵感",            output: "灵感清单" },
  { fixedWindow: "15:00-15:30", section: "扩展产出", title: "剪辑1条短视频（视频号/小红书）", output: "成片30秒" },
  { fixedWindow: "15:30-15:45", section: "微博维护", title: "发1条+互动5条评论",             output: "微博动态" },
];

/* ------------------ 番茄钟（北京时间/后台继续/提醒，强化版） ------------------ */
function Pomodoro({ tasks, onAutoComplete }) {
  const DUR = { "25/5": { focus: 25 * 60, rest: 5 * 60 }, "50/10": { focus: 50 * 60, rest: 10 * 60 } };
  const POMO_KEY = `pomo-state-${(new Date()).toISOString().slice(0,10)}`;

  const [mode, setMode] = useState("25/5");
  const [phase, setPhase] = useState("focus");
  const [running, setRunning] = useState(false);
  const [endAt, setEndAt] = useState(null);     // 目标时间戳（ms）
  const [bindTaskId, setBindTaskId] = useState(tasks[0]?.id ?? "");
  const [soundOn, setSoundOn] = useState(true);
  const [notifyOn, setNotifyOn] = useState(true);
  const [remain, setRemain] = useState(0);
  const [bjNow, setBjNow] = useState(() => new Date());

  // —— 读取历史（保证刷新/切页继续）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(POMO_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.mode) setMode(s.mode);
        if (s.phase) setPhase(s.phase);
        if (typeof s.running === "boolean") setRunning(s.running);
        if (typeof s.endAt === "number") setEndAt(s.endAt);
        if (s.bindTaskId) setBindTaskId(s.bindTaskId);
        if (typeof s.soundOn === "boolean") setSoundOn(s.soundOn);
        if (typeof s.notifyOn === "boolean") setNotifyOn(s.notifyOn);
      }
    } catch {}
  }, []);

  // —— 保存
  const persist = (next = {}) => {
    try {
      const payload = { mode, phase, running, endAt, bindTaskId, soundOn, notifyOn, ...next };
      localStorage.setItem(POMO_KEY, JSON.stringify(payload));
    } catch {}
  };

  // —— 计算剩余秒（用绝对时间戳，后台也准确）
  const computeRemain = React.useCallback(() => {
    if (!endAt) return 0;
    const diff = Math.ceil((endAt - Date.now()) / 1000);
    return Math.max(0, diff);
  }, [endAt]);

  // —— UI 心跳：每 250ms 刷一次剩余时间；并每秒刷新一次“现在北京时间”
  useEffect(() => {
    // 立刻对时一次（避免刚点开始时短暂显示 00:00）
    setRemain(computeRemain());
    const iv = setInterval(() => setRemain(computeRemain()), 250);
    const clock = setInterval(() => setBjNow(new Date()), 1000);
    return () => { clearInterval(iv); clearInterval(clock); };
  }, [computeRemain]);

  // —— 到点提醒
  const beep = () => {
    if (!soundOn) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine"; o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      o.start();
      setTimeout(() => { g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1); o.stop(ctx.currentTime + 0.12); }, 120);
    } catch {}
  };
  const notify = (title, body) => {
    if (!notifyOn) return;
    try {
      if ("Notification" in window) {
        if (Notification.permission === "granted") new Notification(title, { body });
        else if (Notification.permission !== "denied") {
          Notification.requestPermission().then((p) => { if (p === "granted") new Notification(title, { body }); });
        }
      }
    } catch {}
    if (navigator.vibrate) navigator.vibrate(200);
  };

  // —— 阶段结束
  const finishPhase = () => {
    if (phase === "focus" && bindTaskId) onAutoComplete?.(bindTaskId);
    beep();
    notify(phase === "focus" ? "专注结束" : "休息结束", phase === "focus" ? "该休息了～" : "准备开始下一轮！");
    const next = phase === "focus" ? "rest" : "focus";
    setPhase(next);
    setRunning(false);
    setEndAt(null);
    persist({ phase: next, running: false, endAt: null });
  };

  // —— 到点切换阶段（remain 归零且在运行时）
  useEffect(() => {
    if (running && endAt && remain === 0) finishPhase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remain, running, endAt]);

  // —— 北京时间格式化（展示用；计时仍用 UTC 时间戳）
  const fmtBeijing = (ts) => {
    if (!ts) return "--:--:--";
    return new Date(ts).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai",
      hour:"2-digit", minute:"2-digit", second:"2-digit" });
  };
  const fmtBjNow = bjNow.toLocaleString("zh-CN", { hour12:false, timeZone:"Asia/Shanghai",
    year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit" });

  // —— 控制
  const start = () => {
    if (running) return;
    const dur = DUR[mode][phase];
    const nextEnd = Date.now() + dur * 1000;
    setEndAt(nextEnd);
    setRunning(true);
    // 立刻对时一次
    setRemain(Math.ceil(dur));
    persist({ endAt: nextEnd, running: true });
    try { if (notifyOn && "Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch {}
  };
  const pause = () => { setRunning(false); persist({ running: false }); };
  const reset = () => { setRunning(false); setEndAt(null); setPhase("focus"); setRemain(0); persist({ running: false, endAt: null, phase: "focus" }); };
  const changeMode = (v) => { if (running) pause(); setMode(v); persist({ mode: v }); };

  // —— 页面标题显示剩余时间（切到其它标签也能看见）
  useEffect(() => {
    const old = document.title;
    if (running && endAt) document.title = `(${String(Math.floor(remain/60)).padStart(2,"0")}:${String(remain%60).padStart(2,"0")}) 番茄钟`;
    else document.title = old.includes("番茄钟") ? "番茄钟" : old;
    return () => { document.title = old; };
  }, [running, endAt, remain]);

  const mm = String(Math.floor(remain / 60)).padStart(2, "0");
  const ss = String(remain % 60).padStart(2, "0");

  return (
    <div style={card}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <h3 style={{margin:0}}>⏱️ 番茄钟</h3>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <select value={mode} onChange={(e)=>changeMode(e.target.value)} style={select} disabled={running}>
            <option value="25/5">25/5</option>
            <option value="50/10">50/10</option>
          </select>
          <select value={phase} onChange={(e)=>{ if(running) pause(); setPhase(e.target.value); persist({phase:e.target.value}); }} style={select}>
            <option value="focus">专注</option>
            <option value="rest">休息</option>
          </select>
          <label style={{fontSize:12,color:"#444"}}><input type="checkbox" checked={soundOn} onChange={(e)=>{setSoundOn(e.target.checked); persist({soundOn:e.target.checked});}}/> 声音</label>
          <label style={{fontSize:12,color:"#444"}}><input type="checkbox" checked={notifyOn} onChange={(e)=>{setNotifyOn(e.target.checked); persist({notifyOn:e.target.checked});}}/> 通知</label>
        </div>
      </div>

      <div style={{marginTop:6, color:"#666"}}>
        现在北京时间：<b>{fmtBjNow}</b>
      </div>
      <div style={{marginTop:6, color:"#666"}}>
        当前阶段：{phase==="focus"?"专注":"休息"}　|　结束(北京时间)：{fmtBeijing(endAt)}
      </div>

      <div style={{fontSize:48,fontWeight:700,margin:"12px 0"}}>{mm}:{ss}</div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {!running ? (
          <button style={btnPrimary} onClick={start}>开始</button>
        ) : (
          <button style={btn} onClick={pause}>暂停</button>
        )}
        <button style={btn} onClick={reset}>重置</button>
        <select value={bindTaskId} onChange={(e)=>{ setBindTaskId(e.target.value); persist({bindTaskId:e.target.value}); }} style={{...select,minWidth:220}}>
          <option value="">不绑定任务</option>
          {tasks.map(t => <option key={t.id} value={t.id}>绑定：{(t.title||"").slice(0,24)}</option>)}
        </select>
      </div>

      <div style={{fontSize:12,color:"#999",marginTop:8}}>
        · 计时用绝对时间戳，切到其他网页也不会慢；显示为<b>北京时间</b>。<br/>
        · 阶段结束会提示（声音/通知/震动），若绑定任务则自动勾选完成。
      </div>
    </div>
  );
}

/* ------------------ 读取全部天数据，用于统计/导出 ------------------ */
function readAllDayEntries() {
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("dc-")) {
      try {
        const d = k.slice(3); // YYYY-MM-DD
        const v = JSON.parse(localStorage.getItem(k) || "{}");
        entries.push({ key: k, date: d, tasks: v.tasks || [], notes: v.notes || "" });
      } catch {}
    }
  }
  return entries.sort((a,b)=> a.date.localeCompare(b.date));
}

/* ------------------ 统计面板（日/周/月/年） + 导出 ------------------ */
function StatsPanel({ today }) {
  const [scope, setScope] = useState("day"); // day / week / month / year
  const all = readAllDayEntries();

  const dayKeyStr = dateKey(today);
  const week = getISOWeek(today);  // YYYY-Www
  const month = monthKey(today);   // YYYY-MM
  const year  = yearKey(today);    // YYYY

  const inScope = (dstr) => {
    if (scope === "day")   return dstr === dayKeyStr;
    if (scope === "week")  return getISOWeek(new Date(dstr)) === week;
    if (scope === "month") return dstr.slice(0,7) === month;
    return dstr.slice(0,4) === year; // year
  };

  const scoped = all.filter(e => inScope(e.date));

  // 汇总
  let total=0, done=0, minutesDone=0;
  const bySection = {};
  scoped.forEach(e => {
    e.tasks.forEach(t => {
      total += 1;
      if (t.done) {
        done += 1;
        minutesDone += Number.isFinite(+t.minutes) ? +t.minutes : spanMinutes(t.fixedWindow);
        const sec = t.section || "未分类";
        bySection[sec] = (bySection[sec] || 0) + 1;
      }
    });
  });
  const rate = total ? Math.round(done*100/total) : 0;

  const exportJSON = () => {
    download(`stats-${scope}-${Date.now()}.json`, JSON.stringify(scoped, null, 2), "application/json");
  };

  const exportCSV = () => {
    const rows = [["date","section","title","output","minutes","done","fixedWindow","remark"]];
    scoped.forEach(e=>{
      e.tasks.forEach(t=>{
        rows.push([
          e.date,
          (t.section||""),
          (t.title||"").replace(/\n/g," "),
          (t.output||"").replace(/\n/g," "),
          (Number.isFinite(+t.minutes)? +t.minutes : spanMinutes(t.fixedWindow)),
          t.done?1:0,
          (t.fixedWindow||""),
          (t.remark||"").replace(/\n/g," "),
        ]);
      });
    });
    const csv = rows.map(r=>r.map(x=>{
      const s = String(x??"");
      if (s.includes(",") || s.includes('"')) return `"${s.replace(/"/g,'""')}"`;
      return s;
    }).join(",")).join("\n");
    download(`stats-${scope}-${Date.now()}.csv`, csv, "text/csv;charset=utf-8");
  };

  return (
    <div style={card}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h3 style={{margin:0}}>📈 统计面板</h3>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <select value={scope} onChange={e=>setScope(e.target.value)} style={select}>
            <option value="day">今日</option>
            <option value="week">本周</option>
            <option value="month">本月</option>
            <option value="year">今年</option>
          </select>
          <button style={btn} onClick={exportJSON}>导出JSON</button>
          <button style={btn} onClick={exportCSV}>导出CSV</button>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12, marginTop:12}}>
        <div style={statCard}><div style={statNum}>{done}</div><div style={statLabel}>完成任务</div></div>
        <div style={statCard}><div style={statNum}>{total}</div><div style={statLabel}>总任务</div></div>
        <div style={statCard}><div style={statNum}>{rate}%</div><div style={statLabel}>完成率</div></div>
        <div style={statCard}><div style={statNum}>{minutesDone}</div><div style={statLabel}>完成分钟</div></div>
      </div>

      <div style={{marginTop:16}}>
        <h4 style={{margin:"8px 0"}}>模块完成分布</h4>
        {Object.keys(bySection).length === 0 ? (
          <div style={{color:"#666"}}>暂无数据</div>
        ) : (
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {Object.entries(bySection).map(([sec, num]) => (
              <span key={sec} style={badge}>
                {sec}：{num}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------ 计划面板（日/周/月/年） + 注入今日清单 ------------------ */
function PlannerPanel({ today, onInject }) {
  const [tab, setTab] = useState("day"); // day/week/month/year
  const keys = {
    day:   `plan-day-${dateKey(today)}`,
    week:  `plan-week-${getISOWeek(today)}`,
    month: `plan-month-${monthKey(today)}`,
    year:  `plan-year-${yearKey(today)}`,
  };
  const [data, setData] = useState({ top3:"", must:"", notes:"" });

  useEffect(()=> {
    const raw = localStorage.getItem(keys[tab]);
    if (raw) { try { setData(JSON.parse(raw)); return; } catch {} }
    setData({ top3:"", must:"", notes:"" });
  }, [tab, today]);

  useEffect(()=> { localStorage.setItem(keys[tab], JSON.stringify(data)); }, [tab, data]);

  const parseLines = (txt="") => txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const injectToToday = () => {
    const items = [...parseLines(data.top3), ...parseLines(data.must)];
    if (items.length === 0) return alert("没有可注入的内容（请先填写 Top3 或 Must-do）");
    onInject?.(items);
  };

  return (
    <div style={card}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h3 style={{margin:0}}>🗂 计划面板</h3>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <button style={tabBtn(tab==="day")}   onClick={()=>setTab("day")}>日计划</button>
          <button style={tabBtn(tab==="week")}  onClick={()=>setTab("week")}>周计划</button>
          <button style={tabBtn(tab==="month")} onClick={()=>setTab("month")}>月计划</button>
          <button style={tabBtn(tab==="year")}  onClick={()=>setTab("year")}>年计划</button>
          <button style={btnPrimary} onClick={injectToToday}>注入到今日清单</button>
        </div>
      </div>

      <div style={{marginTop:12, color:"#666"}}>键名：{keys[tab]}</div>

      <div style={{display:"grid", gap:12, marginTop:12}}>
        <div>
          <h4 style={{margin:"6px 0"}}>⭐ Top 3</h4>
          <textarea
            style={{...textarea, minHeight:80}}
            placeholder="每行一条，回车换行\n例如：发布视频1条\n例如：复盘A/B测试"
            value={data.top3}
            onChange={(e)=>setData(prev=>({...prev, top3:e.target.value}))}
          />
        </div>
        <div>
          <h4 style={{margin:"6px 0"}}>✅ Must-do</h4>
          <textarea
            style={{...textarea, minHeight:80}}
            placeholder="必须完成的事项（每行一条）"
            value={data.must}
            onChange={(e)=>setData(prev=>({...prev, must:e.target.value}))}
          />
        </div>
        <div>
          <h4 style={{margin:"6px 0"}}>📝 Notes / Not-to-do</h4>
          <textarea
            style={{...textarea, minHeight:100}}
            placeholder="复盘、边界、不要做的事等"
            value={data.notes}
            onChange={(e)=>setData(prev=>({...prev, notes:e.target.value}))}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------ 主组件：清单 + 番茄钟 + 统计 + 计划 ------------------ */
export default function DailyCheckin() {
  return (
    <ErrorBoundary>
      <InnerApp />
    </ErrorBoundary>
  );
}

function InnerApp(){
  const [today, setToday] = useState(() => new Date());
  const storageKey = useMemo(() => `dc-${dateKey(today)}`, [today]);
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState("");
  const [locked, setLocked] = useState(true); // ✅ 默认锁定

  // 规范化
  const normalizeTask = (t) => ({
    id: t.id ?? uid(),
    title: String(t.title ?? "未命名任务"),
    minutes: Number.isFinite(+t.minutes) && +t.minutes > 0 ? +t.minutes : spanMinutes(t.fixedWindow),
    section: t.section ?? "",
    done: !!t.done,
    remark: t.remark ?? "",
    fixedWindow: t.fixedWindow ?? "",
    output: t.output ?? "",
    altDays: !!t.altDays,
  });

  // 隔日任务：偶数日显示（改奇数：day % 2 === 1）
  const shouldShowToday = (task, d) => {
    if (!task.altDays) return true;
    const day = d.getDate();
    return day % 2 === 0;
  };

  // 读取（自动迁移：若多数任务没有 fixedWindow，用模板覆盖）
  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    try {
      if (raw) {
        const parsed = JSON.parse(raw);
        const base = Array.isArray(parsed?.tasks) ? parsed.tasks : DEFAULT_TASKS;
        const miss = base.filter(t => !t?.fixedWindow).length;
        const needMigrate = miss >= Math.ceil(base.length * 0.5);
        const finalTasks = (needMigrate ? DEFAULT_TASKS : base).map(normalizeTask);
        setTasks(finalTasks);
        setNotes(typeof parsed?.notes === "string" ? parsed.notes : "");
        if (needMigrate) localStorage.setItem(storageKey, JSON.stringify({ tasks: finalTasks, notes: parsed?.notes || "" }));
        return;
      }
    } catch (e) { console.warn("Parse local data failed:", e); }
    setTasks(DEFAULT_TASKS.map(normalizeTask));
    setNotes("");
  }, [storageKey]);

  // 保存
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ tasks, notes })); } catch (e) { console.warn("Save failed:", e); }
  }, [tasks, notes, storageKey]);

  const visibleTasks = [...tasks].filter(t => shouldShowToday(t, today)).sort(compareByFixedWindow);
  const doneCount = visibleTasks.filter(t=>t.done).length;
  const prog = visibleTasks.length ? Math.round(doneCount*100/visibleTasks.length) : 0;

  // 行为
  const toggleTask   = (id) => setTasks(arr => arr.map(t => t.id===id ? {...t, done:!t.done} : t));
  const autoComplete = (id) => setTasks(arr => arr.map(t => t.id===id ? {...t, done:true} : t));
  const addTask      = () => setTasks(arr => [...arr, normalizeTask({ title:"自定义任务", section:"核心产出", fixedWindow:"", output:"", done:false, remark:"" })]);
  const removeTask   = (id) => setTasks(arr => arr.filter(t => t.id!==id));
  const updateTask   = (id, patch) => setTasks(arr => arr.map(t => t.id===id ? normalizeTask({ ...t, ...patch }) : t));
  const shiftDay     = (delta) => { const d = new Date(today); d.setDate(d.getDate()+delta); setToday(d); };

  // 计划注入：根据文本行追加任务（去重：同标题不重复）
  const injectPlanItems = (lines=[]) => {
    const titles = new Set(tasks.map(t => t.title.trim()));
    const newOnes = lines
      .map(title => title.trim())
      .filter(Boolean)
      .filter(t => !titles.has(t))
      .map(title => normalizeTask({ title, section:"核心产出", fixedWindow:"", output:"" }));
    if (newOnes.length === 0) return alert("没有可注入的新任务（可能都已存在）");
    const merged = [...tasks, ...newOnes];
    setTasks(merged);
    localStorage.setItem(storageKey, JSON.stringify({ tasks: merged, notes }));
    alert(`已注入 ${newOnes.length} 条到今日清单`);
  };

  return (
    <div style={page}>
      <header style={header}>
        <div>
          <h1 style={{ margin: 0 }}>📅 每日执行打卡</h1>
          <div style={{ color: "#666" }}>{dateKey(today)}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap:"wrap" }}>
          <button style={btn} onClick={() => shiftDay(-1)}>← 前一天</button>
          <button style={btn} onClick={() => setToday(new Date())}>回到今天</button>
          <button style={btn} onClick={() => shiftDay(1)}>后一天 →</button>
          <button style={btn} onClick={() => setLocked(l => !l)}>{locked ? "解锁编辑" : "锁定"}</button>
          <button
            style={btn}
            onClick={() => {
              const ok = confirm("确定将【今日清单】重置为模板？（备注与勾选将清空，仅当日生效）");
              if (!ok) return;
              const fresh = DEFAULT_TASKS.map(normalizeTask);
              setTasks(fresh);
              localStorage.setItem(storageKey, JSON.stringify({ tasks: fresh, notes: "" }));
            }}
          >
            重置今日清单
          </button>
        </div>
      </header>

      {/* 进度条 */}
      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <div>今日进度</div>
          <div>{doneCount}/{visibleTasks.length}（{prog}%）</div>
        </div>
        <div style={barWrap}><div style={{ ...barFill, width: `${prog}%` }} /></div>
      </div>

      {/* 番茄钟 */}
      <Pomodoro tasks={visibleTasks} onAutoComplete={autoComplete} />

      {/* 任务清单（锁定=清单；解锁=编辑） */}
      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <h3 style={{ margin: 0 }}>✅ 今日任务（固定清单）</h3>
          {!locked && <button style={btnPrimary} onClick={addTask}>+ 新增任务</button>}
        </div>

        <div style={{ marginTop: 12 }}>
          {visibleTasks.map((t) => {
            const overdue = isOverdueNow(today, t);
            return (
              <div key={t.id} style={{...taskRow, ...(t.done? rowDone : null)}}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <input type="checkbox" checked={!!t.done} onChange={() => toggleTask(t.id)} style={{ marginTop: 4 }} title="完成勾选" />
                  <div style={{ flex: 1 }}>
                    {locked ? (
                      <>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
                          {t.fixedWindow && <span style={badgeTime}>{t.fixedWindow}</span>}
                          <span style={badge}>{t.section || "未分类"}</span>
                          <span style={{...titleText, ...(t.done? titleDone : null)}}>{t.title || "未命名任务"}</span>
                          {t.output && <span style={chip}>产出：{t.output}</span>}
                          {overdue && <span style={overdueTag}>已过时</span>}
                        </div>
                        <textarea
                          placeholder="备注/产出链接/要点…"
                          style={textarea}
                          value={t.remark ?? ""}
                          onChange={(e) => updateTask(t.id, { remark: e.target.value })}
                          title="备注"
                        />
                      </>
                    ) : (
                      <>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                          <input
                            style={textInput}
                            value={t.title ?? ""}
                            onChange={(e) => updateTask(t.id, { title: e.target.value })}
                            placeholder="任务标题"
                            title="任务"
                          />
                        </label>

                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                          <select
                            value={String(t.section ?? "")}
                            onChange={(e) => updateTask(t.id, { section: e.target.value })}
                            style={select}
                            title="模块"
                          >
                            <option>核心产出</option>
                            <option>热点捕捉</option>
                            <option>爆款拆解</option>
                            <option>对标学习</option>
                            <option>股票</option>
                            <option>学习升级</option>
                            <option>输入</option>
                            <option>扩展产出</option>
                            <option>微博维护</option>
                          </select>

                          <input
                            style={textInput}
                            value={t.fixedWindow || ""}
                            onChange={(e) => updateTask(t.id, { fixedWindow: e.target.value })}
                            placeholder="时间段 如 09:00-09:25"
                            title="时间段"
                          />

                          <input
                            style={{ ...textInput, maxWidth: 260 }}
                            value={t.output ?? ""}
                            onChange={(e) => updateTask(t.id, { output: e.target.value })}
                            placeholder="产出（如：500字草稿 / 成片30秒）"
                            title="产出"
                          />

                          <button style={btnDanger} onClick={() => removeTask(t.id)}>删除</button>
                        </div>

                        <textarea
                          placeholder="备注/产出链接/要点…"
                          style={textarea}
                          value={t.remark ?? ""}
                          onChange={(e) => updateTask(t.id, { remark: e.target.value })}
                          title="备注"
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 统计面板（含导出） */}
      <StatsPanel today={today} />

      {/* 计划面板（含注入今日清单） */}
      <PlannerPanel today={today} onInject={injectPlanItems} />

      {/* 复盘/杂记 */}
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>📝 今日复盘/杂记</h3>
        <textarea
          placeholder="1）我完成了什么？ 2）进展/困难？ 3）明天最先做什么？"
          style={{ ...textarea, minHeight: 120 }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <footer style={{ fontSize: 12, color: "#999", textAlign: "center", margin: "24px 0" }}>
        本地自动保存（localStorage，按日期区分）。锁定=清单展示；解锁=可编辑结构。对标学习为隔日任务（偶数日显示）。
      </footer>
    </div>
  );
}

/* ------------------ 样式 ------------------ */
const page = { maxWidth: 960, margin: "0 auto", padding: "24px 16px", fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif", color: "#111", background: "#fafafa" };
const header = { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 12 };
const card = { background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:16, marginTop:12, boxShadow:"0 1px 2px rgba(0,0,0,.03)" };
const barWrap = { height:10, background:"#f1f5f9", borderRadius:999, overflow:"hidden", marginTop:8 };
const barFill = { height:"100%", background:"linear-gradient(90deg,#22c55e,#3b82f6)" };
const btn = { padding:"8px 12px", border:"1px solid #e5e7eb", background:"#fff", borderRadius:8, cursor:"pointer" };
const btnPrimary = { ...btn, background:"#111", color:"#fff", borderColor:"#111" };
const btnDanger = { ...btn, borderColor:"#ef4444", color:"#ef4444", background:"#fff" };
const textInput = { flex:1, padding:"8px 10px", borderRadius:8, border:"1px solid #e5e7eb", outline:"none" };
const select = { padding:"8px 10px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff" };
const textarea = { width:"100%", marginTop:8, padding:10, border:"1px solid #e5e7eb", borderRadius:8, minHeight:64, outline:"none", resize:"vertical" };
const taskRow = { borderBottom: "1px solid #f1f5f9", padding: "12px 0", display: "flex", flexDirection: "column", gap: 6 };
/* 清单风格徽章/文字 */
const badgeTime = { fontFamily:"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize:12, padding:"2px 6px", borderRadius:6, background:"#eef2ff", color:"#3730a3", border:"1px solid #e0e7ff" };
const badge = { fontSize:12, padding:"2px 6px", borderRadius:6, background:"#f1f5f9", color:"#0f172a", border:"1px solid #e5e7eb" };
const titleText = { fontSize:15, fontWeight:600 };
const chip = { fontSize:12, padding:"2px 6px", borderRadius:999, background:"#ecfeff", color:"#155e75", border:"1px solid #cffafe" };
/* 完成/逾期样式 */
const rowDone = { opacity:.55 };
const titleDone = { textDecoration:"line-through" };
const overdueTag = { fontSize:12, padding:"2px 6px", borderRadius:6, background:"#fee2e2", color:"#991b1b", border:"1px solid #fecaca" };
/* 统计卡片样式 */
const statCard = { border:"1px solid #e5e7eb", borderRadius:12, padding:"12px 10px", background:"#fff", textAlign:"center" };
const statNum  = { fontSize:24, fontWeight:700 };
const statLabel= { fontSize:12, color:"#666" };
const tabBtn = (active)=> ({ ...btn, background: active ? "#111" : "#fff", color: active ? "#fff" : "#111", borderColor: active ? "#111" : "#e5e7eb" });

