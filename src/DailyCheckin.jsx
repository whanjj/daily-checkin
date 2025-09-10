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

/* ------------------ 固定任务模板（按你的表） ------------------ */
const DEFAULT_TASKS = [
  { fixedWindow: "09:00-09:50", section: "核心产出", title: "写公众号草稿500字",            output: "500字草稿" },
  { fixedWindow: "10:00-10:25", section: "核心产出", title: "改稿+排版",                    output: "可发布文章" },
  { fixedWindow: "10:30-10:55", section: "热点捕捉", title: "浏览热榜，记录3条热点",         output: "热点清单" },
  { fixedWindow: "11:00-11:15", section: "爆款拆解", title: "拆解1个爆款标题/开头",         output: "拆解笔记" },
  { fixedWindow: "11:15-11:30", section: "对标学习", title: "对比1个账号选题（隔日）",       output: "对标表", altDays: true }, // 隔日显示
  { fixedWindow: "11:30-12:00", section: "股票",     title: "查盘+写下1条操作逻辑",          output: "投资日志" },
  { fixedWindow: "14:00-14:30", section: "学习升级", title: "Coze/AI 短视频：做1个小案例",   output: "工作流/短视频demo" },
  { fixedWindow: "14:30-15:00", section: "输入",     title: "阅读10页+写3条灵感",            output: "灵感清单" },
  { fixedWindow: "15:00-15:30", section: "扩展产出", title: "剪辑1条短视频（视频号/小红书）", output: "成片30秒" },
  { fixedWindow: "15:30-15:45", section: "微博维护", title: "发1条+互动5条评论",             output: "微博动态" },
];

/* ------------------ 番茄钟（可与任意任务绑定） ------------------ */
function Pomodoro({ tasks, onAutoComplete }) {
  const MODES = { "25/5": { focus:1500, rest:300 }, "50/10": { focus:3000, rest:600 } };
  const [mode, setMode] = useState("25/5");
  const [phase, setPhase] = useState("focus");
  const [secondsLeft, setSecondsLeft] = useState(MODES[mode].focus);
  const [running, setRunning] = useState(false);
  const [bindTaskId, setBindTaskId] = useState(tasks[0]?.id ?? "");

  useEffect(() => {
    setSecondsLeft(phase === "focus" ? MODES[mode].focus : MODES[mode].rest);
  }, [mode, phase]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          if (phase === "focus" && bindTaskId) onAutoComplete?.(bindTaskId);
          const next = phase === "focus" ? "rest" : "focus";
          setPhase(next);
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
        {!running ? (
          <button style={btnPrimary} onClick={()=>setRunning(true)}>开始</button>
        ) : (
          <button style={btn} onClick={()=>setRunning(false)}>暂停</button>
        )}
        <button
          style={btn}
          onClick={()=>{
            setRunning(false);
            setPhase("focus");
            setSecondsLeft(MODES[mode].focus);
          }}
        >
          重置
        </button>
        <select value={bindTaskId} onChange={(e)=>setBindTaskId(e.target.value)} style={{...select,minWidth:220}}>
          <option value="">不绑定任务</option>
          {tasks.map(t => <option key={t.id} value={t.id}>绑定：{(t.title||"").slice(0,24)}</option>)}
        </select>
      </div>
      <div style={{fontSize:12,color:"#999",marginTop:8}}>专注结束时，若绑定任务，会自动勾选为完成。</div>
    </div>
  );
}

/* ------------------ 主组件：固定清单 + 锁定编辑 + 清单风格 ------------------ */
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

  // 规范化，避免字段缺失
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

  // “隔日任务”规则：偶数日显示（改成奇数：day % 2 === 1）
  const shouldShowToday = (task, d) => {
    if (!task.altDays) return true;
    const day = d.getDate();
    return day % 2 === 0;
  };

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const base = Array.isArray(parsed?.tasks) ? parsed.tasks : DEFAULT_TASKS;
        setTasks(base.map(normalizeTask));
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

  const visibleTasks = [...tasks].filter(t => shouldShowToday(t, today)).sort(compareByFixedWindow);

  const doneCount = visibleTasks.filter(t=>t.done).length;
  const prog = visibleTasks.length ? Math.round(doneCount*100/visibleTasks.length) : 0;

  // 行为
  const toggleTask   = (id) => setTasks(arr => arr.map(t => t.id===id ? {...t, done:!t.done} : t));
  const autoComplete = (id) => setTasks(arr => arr.map(t => t.id===id ? {...t, done:true} : t));
  const addTask      = () => setTasks(arr => [...arr, normalizeTask({ title:"自定义任务", section:"核心产出", fixedWindow:"", output:"", done:false, remark:"" })]);
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
        <div style={{ display: "flex", gap: 8, flexWrap:"wrap" }}>
          <button style={btn} onClick={() => shiftDay(-1)}>← 前一天</button>
          <button style={btn} onClick={() => setToday(new Date())}>回到今天</button>
          <button style={btn} onClick={() => shiftDay(1)}>后一天 →</button>
          <button style={btn} onClick={() => setLocked(l => !l)}>{locked ? "解锁编辑" : "锁定"}</button>
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

      {/* 任务清单（清单风格展示 / 解锁后可编辑） */}
      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <h3 style={{ margin: 0 }}>✅ 今日任务（固定清单）</h3>
          {!locked && <button style={btnPrimary} onClick={addTask}>+ 新增任务</button>}
        </div>

        <div style={{ marginTop: 12 }}>
          {visibleTasks.map((t) => (
            <div key={t.id} style={taskRow}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                {/* 左侧勾选 */}
                <input
                  type="checkbox"
                  checked={!!t.done}
                  onChange={() => toggleTask(t.id)}
                  style={{ marginTop: 4 }}
                  title="完成勾选"
                />

                {/* 右侧主体 */}
                <div style={{ flex: 1 }}>
                  {locked ? (
                    <>
                      {/* ✅ 清单样式（只读展示） */}
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
                        {t.fixedWindow && <span style={badgeTime}>{t.fixedWindow}</span>}
                        <span style={badge}>{t.section || "未分类"}</span>
                        <span style={titleText}>
                          {t.title || "未命名任务"}
                        </span>
                        {t.output && <span style={chip}>产出：{t.output}</span>}
                      </div>
                      {/* 备注始终可写 */}
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
                      {/* ✏️ 解锁时可编辑 */}
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
          ))}
        </div>
      </div>

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
const taskRow = {
  borderBottom: "1px solid #f1f5f9",
  padding: "12px 0",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};
/* 清单风格徽章/文字 */
const badgeTime = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  padding: "2px 6px",
  borderRadius: 6,
  background: "#eef2ff",
  color: "#3730a3",
  border: "1px solid #e0e7ff",
};
const badge = {
  fontSize: 12,
  padding: "2px 6px",
  borderRadius: 6,
  background: "#f1f5f9",
  color: "#0f172a",
  border: "1px solid #e5e7eb",
};
const titleText = {
  fontSize: 15,
  fontWeight: 600,
};
const chip = {
  fontSize: 12,
  padding: "2px 6px",
  borderRadius: 999,
  background: "#ecfeff",
  color: "#155e75",
  border: "1px solid #cffafe",
};
