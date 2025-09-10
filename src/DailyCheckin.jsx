import React, { useEffect, useMemo, useRef, useState } from "react";

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
          <p style={{color:"#666"}}>你可以继续操作或刷新页面；把上面的红字发我，我来定位。</p>
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
const uid = () => Math.random().toString(36).slice(2, 10);

/* ------------------ 预置任务 ------------------ */
const DEFAULT_TASKS = [
  { title: "核心产出：写公众号开头200字", minutes: 25, section: "核心产出" },
  { title: "股票：9:30 早盘观察+操作",      minutes: 30, section: "股票（早盘）" },
  { title: "核心产出：完善剩余300字",        minutes: 50, section: "核心产出" },
  { title: "热点研究：3条热点+拆1爆款",      minutes: 25, section: "热点研究" },
  { title: "深度阅读：5–10页+2条笔记",       minutes: 25, section: "深度阅读" },
];

/* ------------------ 番茄钟 ------------------ */
function Pomodoro({ tasks, onAutoComplete }) {
  const MODES = { "25/5": { focus:1500, rest:300 }, "50/10": { focus:3000, rest:600 } };
  const [mode, setMode] = useState("25/5");
  const [phase, setPhase] = useState("focus");
  const [secondsLeft, setSecondsLeft] = useState(MODES[mode].focus);
  const [running, setRunning] = useState(false);
  const [bindTaskId, setBindTaskId] = useState(tasks[0]?.id ?? "");

  useEffect(() => { setSecondsLeft(phase === "focus" ? MODES[mode].focus : MODES[mode].rest); }, [mode]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          if (phase === "focus" && bindTaskId) onAutoComplete?.(bindTaskId);
          const nextPhase = phase === "focus" ? "rest" : "focus";
          setPhase(nextPhase);
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running, phase, mode, bindTaskId, onAutoComplete]);

  const mm = String(Math.floor(secondsLeft/60)).padStart(2,"0");
  const ss = String(secondsLeft%60).padStart(2,"0");

  return (
    <div style={card}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h3 style={{margin:0}}>⏱️ 番茄钟</h3>
        <select value={mode} onChange={(e)=>setMode(e.target.value)} style={select}>
          <option value="25/5">25/5</option>
          <option value="50/10">50/10</option>
        </select>
      </div>
      <div style={{marginTop:8,color:"#666"}}>当前阶段：{phase==="focus"?"专注":"休息"}</div>
      <div style={{fontSize:48,fontWeight:700,margin:"12px 0"}}>{mm}:{ss}</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {!running ? <button style={btnPrimary} onClick={()=>setRunning(true)}>开始</button>
                  : <button style={btn} onClick={()=>setRunning(false)}>暂停</button>}
        <button style={btn} onClick={()=>{
          setRunning(false); setPhase("focus"); setSecondsLeft(MODES[mode].focus);
        }}>重置</button>
        <select value={bindTaskId} onChange={(e)=>setBindTaskId(e.target.value)} style={{...select,minWidth:220}}>
          <option value="">不绑定任务</option>
          {tasks.map(t => <option key={t.id} value={t.id}>绑定：{(t.title||"").slice(0,24)}</option>)}
        </select>
      </div>
      <div style={{fontSize:12,color:"#999",marginTop:8}}>专注结束时，若绑定任务，会自动勾选为完成。</div>
    </div>
  );
}

/* ------------------ 主组件 ------------------ */
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

  // 安全初始化：保证字段齐全，避免 undefined
  const normalizeTask = (t) => ({
    id: t.id ?? uid(),
    title: String(t.title ?? "未命名任务"),
    minutes: Number.isFinite(+t.minutes) && +t.minutes > 0 ? +t.minutes : 25,
    section: t.section ?? "",
    done: !!t.done,
    remark: t.remark ?? "",
  });

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setTasks(Array.isArray(parsed?.tasks) ? parsed.tasks.map(normalizeTask) : []);
        setNotes(typeof parsed?.notes === "string" ? parsed.notes : "");
        return;
      } catch (e) { console.warn("Parse local data failed:", e); }
    }
    setTasks(DEFAULT_TASKS.map(normalizeTask));
    setNotes("");
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ tasks, notes }));
    } catch (e) { console.warn("Save local data failed:", e); }
  }, [tasks, notes, storageKey]);

  const doneCount = tasks.filter(t=>t.done).length;
  const prog = tasks.length ? Math.round(doneCount*100/tasks.length) : 0;

  const toggleTask   = (id) => setTasks(arr => arr.map(t => t.id===id ? {...t, done:!t.done} : t));
  const autoComplete = (id) => setTasks(arr => arr.map(t => t.id===id ? {...t, done:true} : t));
  const addTask      = () => setTasks(arr => [...arr, normalizeTask({ title:"自定义任务", minutes:25, section:"核心产出", done:false, remark:"" })]);
  const removeTask   = (id) => setTasks(arr => arr.filter(t => t.id!==id));
  const updateTask   = (id, patch) => setTasks(arr => arr.map(t => t.id===id ? normalizeTask({ ...t, ...patch }) : t));

  const shiftDay = (delta) => { const d = new Date(today); d.setDate(d.getDate()+delta); setToday(d); };

  return (
    <div style={page}>
      <header style={header}>
        <div>
          <h1 style={{ margin: 0 }}>📅 每日执行打卡</h1>
          <div style={{ color: "#666" }}>{dateKey(today)}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn} onClick={() => shiftDay(-1)}>← 前一天</button>
          <button style={btn} onClick={() => setToday(new Date())}>回到今天</button>
          <button style={btn} onClick={() => shiftDay(1)}>后一天 →</button>
        </div>
      </header>

      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <div>今日进度</div>
          <div>{doneCount}/{tasks.length}（{prog}%）</div>
        </div>
        <div style={barWrap}><div style={{ ...barFill, width: `${prog}%` }} /></div>
      </div>

      <Pomodoro tasks={tasks} onAutoComplete={autoComplete} />

      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h3 style={{ margin: 0 }}>✅ 今日任务</h3>
          <button style={btnPrimary} onClick={addTask}>+ 新增任务</button>
        </div>

        <div style={{ marginTop: 12 }}>
          {tasks.map((t) => (
            <div key={t.id} style={taskRow}>
              <label style={{ display:"flex", alignItems:"center", gap: 8, flex: 1 }}>
                <input type="checkbox" checked={!!t.done} onChange={() => toggleTask(t.id)} />
                <input
                  style={textInput}
                  value={t.title ?? ""}
                  onChange={(e) => updateTask(t.id, { title: e.target.value })}
                  placeholder="任务标题"
                />
              </label>

              <input
                style={{ ...numInput, width: 72 }}
                type="number"
                min={5}
                step={5}
                value={Number.isFinite(+t.minutes) ? +t.minutes : 25}
                onChange={(e) => updateTask(t.id, { minutes: +e.target.value })}
                title="预计分钟数"
              />

              <select
                value={String(t.section ?? "")}
                onChange={(e) => updateTask(t.id, { section: e.target.value })}
                style={select}
                title="类别"
              >
                <option value="">未分类</option>
                <option>核心产出</option>
                <option>扩展产出</option>
                <option>热点研究</option>
                <option>深度阅读</option>
                <option>实验尝试</option>
                <option>学习升级</option>
                <option>股票（早盘）</option>
                <option>股票（收盘）</option>
                <option>灵感输入</option>
              </select>

              <button style={btnDanger} onClick={() => removeTask(t.id)}>删除</button>

              <div style={{ flexBasis:"100%" }} />
              <textarea
                placeholder="备注/产出链接/要点…"
                style={textarea}
                value={t.remark ?? ""}
                onChange={(e) => updateTask(t.id, { remark: e.target.value })}
              />
            </div>
          ))}
        </div>
      </div>

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
        本地自动保存（localStorage，按日期区分）。更换设备时可复制内容做备份。
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
const numInput = { ...textInput, textAlign:"right" };
const select = { padding:"8px 10px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff" };
const textarea = { width:"100%", marginTop:8, padding:10, border:"1px solid #e5e7eb", borderRadius:8, minHeight:64, outline:"none", resize:"vertical" };
