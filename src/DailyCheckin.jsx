import React, { useEffect, useMemo, useRef, useState } from "react";

// ===== 工具函数 =====
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const uid = () => Math.random().toString(36).slice(2, 10);

// ===== 预置任务（可改） =====
const DEFAULT_TASKS = [
  { title: "核心产出：写公众号开头200字", minutes: 25, section: "核心产出" },
  { title: "股票：9:30 早盘观察+操作", minutes: 30, section: "股票（早盘）" },
  { title: "核心产出：完善剩余300字", minutes: 50, section: "核心产出" },
  { title: "热点研究：找3条热点+拆1个爆款", minutes: 25, section: "热点研究" },
  { title: "深度阅读：项目文章 5–10 页 + 2 条笔记", minutes: 25, section: "深度阅读" },
  { title: "实验尝试：AI 短视频/工具 demo", minutes: 30, section: "实验尝试" },
  { title: "学习升级：Coze 工作流 / AI 技能", minutes: 30, section: "学习升级" },
  { title: "股票：15:00 收盘复盘+记录", minutes: 15, section: "股票（收盘）" },
  { title: "扩展产出：剪 30s 短视频 1 条", minutes: 30, section: "扩展产出" },
  { title: "灵感输入：阅读 10 页 + 3 条灵感", minutes: 30, section: "灵感输入" },
];

// ===== 番茄钟组件 =====
function Pomodoro({ tasks, onAutoComplete }) {
  // 模式：25/5 或 50/10
  const MODES = {
    "25/5": { focus: 25 * 60, rest: 5 * 60 },
    "50/10": { focus: 50 * 60, rest: 10 * 60 },
  };
  const [mode, setMode] = useState("25/5");
  const [phase, setPhase] = useState("focus"); // focus 或 rest
  const [secondsLeft, setSecondsLeft] = useState(MODES[mode].focus);
  const [running, setRunning] = useState(false);
  const [bindTaskId, setBindTaskId] = useState(tasks[0]?.id || null);

  const tickRef = useRef(null);

  // 模式切换
  useEffect(() => {
    const next = phase === "focus" ? MODES[mode].focus : MODES[mode].rest;
    setSecondsLeft(next);
  }, [mode]);

  // 计时器
  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(tickRef.current);
          // 一个阶段结束
          if (phase === "focus") {
            // 专注阶段完成：如果绑定了任务，自动打勾
            if (bindTaskId) onAutoComplete(bindTaskId);
            setPhase("rest");
            setSecondsLeft(MODES[mode].rest);
            setRunning(false);
          } else {
            setPhase("focus");
            setSecondsLeft(MODES[mode].focus);
            setRunning(false);
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [running, phase, mode, bindTaskId, onAutoComplete]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  const start = () => setRunning(true);
  const pause = () => setRunning(false);
  const reset = () => {
    setRunning(false);
    setPhase("focus");
    setSecondsLeft(MODES[mode].focus);
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>⏱️ 番茄钟</h3>
        <select value={mode} onChange={(e) => setMode(e.target.value)} style={select}>
          <option value="25/5">25/5</option>
          <option value="50/10">50/10</option>
        </select>
      </div>

      <div style={{ marginTop: 8, color: "#666" }}>
        当前阶段：{phase === "focus" ? "专注" : "休息"}
      </div>

      <div style={{ fontSize: 48, fontWeight: 700, margin: "12px 0" }}>
        {mm}:{ss}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!running ? (
          <button style={btnPrimary} onClick={start}>开始</button>
        ) : (
          <button style={btn} onClick={pause}>暂停</button>
        )}
        <button style={btn} onClick={reset}>重置</button>

        <select
          value={bindTaskId ?? ""}
          onChange={(e) => setBindTaskId(e.target.value || null)}
          style={{ ...select, minWidth: 220 }}
        >
          <option value="">不绑定任务</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              绑定：{t.title.slice(0, 24)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>
        专注阶段结束时，若绑定了任务，会自动将该任务勾选为完成。
      </div>
    </div>
  );
}

// ===== 主组件 =====
export default function DailyCheckin() {
  const [today, setToday] = useState(() => new Date());
  const storageKey = useMemo(() => `dc-${dateKey(today)}`, [today]);

  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState("");

  // 加载当日数据
  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.tasks) setTasks(parsed.tasks);
        if (typeof parsed?.notes === "string") setNotes(parsed.notes);
        return;
      } catch {}
    }
    // 初始化
    setTasks(DEFAULT_TASKS.map((t) => ({ id: uid(), done: false, section: "", ...t, remark: "" })));
    setNotes("");
  }, [storageKey]);

  // 保存当日数据
  useEffect(() => {
    const payload = { tasks, notes };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [tasks, notes, storageKey]);

  // 进度
  const doneCount = tasks.filter((t) => t.done).length;
  const prog = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  // 切换完成
  const toggleTask = (id) =>
    setTasks((arr) => arr.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  // 自动完成（番茄钟用）
  const autoComplete = (id) =>
    setTasks((arr) => arr.map((t) => (t.id === id ? { ...t, done: true } : t)));

  // 新增/删除/编辑
  const addTask = () =>
    setTasks((arr) => [
      ...arr,
      { id: uid(), title: "自定义任务", minutes: 25, section: "核心产出", done: false, remark: "" },
    ]);
  const removeTask = (id) => setTasks((arr) => arr.filter((t) => t.id !== id));
  const updateTask = (id, patch) =>
    setTasks((arr) => arr.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  // 日期
  const shiftDay = (delta) => {
    const d = new Date(today);
    d.setDate(d.getDate() + delta);
    setToday(d);
  };

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

      {/* 进度条 */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>今日进度</div>
          <div>{doneCount}/{tasks.length}（{prog}%）</div>
        </div>
        <div style={barWrap}>
          <div style={{ ...barFill, width: `${prog}%` }} />
        </div>
      </div>

      {/* 番茄钟 */}
      <Pomodoro tasks={tasks} onAutoComplete={autoComplete} />

      {/* 任务清单 */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>✅ 今日任务</h3>
          <button style={btnPrimary} onClick={addTask}>+ 新增任务</button>
        </div>

        <div style={{ marginTop: 12 }}>
          {tasks.map((t) => (
            <div key={t.id} style={taskRow}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => toggleTask(t.id)}
                />
                <input
                  style={textInput}
                  value={t.title}
                  onChange={(e) => updateTask(t.id, { title: e.target.value })}
                />
              </label>

              <input
                style={{ ...numInput, width: 72 }}
                type="number"
                min={5}
                step={5}
                value={t.minutes || 25}
                onChange={(e) => updateTask(t.id, { minutes: Number(e.target.value || 25) })}
                title="预计分钟数"
              />

              <select
                value={t.section || ""}
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

              <div style={{ flexBasis: "100%" }} />
              <textarea
                placeholder="备注/产出链接/要点…"
                style={textarea}
                value={t.remark || ""}
                onChange={(e) => updateTask(t.id, { remark: e.target.value })}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 笔记区 */}
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

// ===== 简单样式（不依赖外部库） =====
const page = {
  maxWidth: 960,
  margin: "0 auto",
  padding: "24px 16px",
  fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
  color: "#111",
  background: "#fafafa",
};
const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
};
const card = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  marginTop: 12,
  boxShadow: "0 1px 2px rgba(0,0,0,.03)",
};
const barWrap = {
  height: 10,
  background: "#f1f5f9",
  borderRadius: 999,
  overflow: "hidden",
  marginTop: 8,
};
const barFill = {
  height: "100%",
  background: "linear-gradient(90deg,#22c55e,#3b82f6)",
};
const btn = {
  padding: "8px 12px",
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 8,
  cursor: "pointer",
};
const btnPrimary = {
  ...btn,
  background: "#111",
  color: "#fff",
  borderColor: "#111",
};
const btnDanger = {
  ...btn,
  borderColor: "#ef4444",
  color: "#ef4444",
  background: "#fff",
};
const textInput = {
  flex: 1,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  outline: "none",
};
const numInput = { ...textInput, textAlign: "right" };
const select = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
};
const textarea = {
  width: "100%",
  marginTop: 8,
  padding: 10,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  minHeight: 64,
  outline: "none",
  resize: "vertical",
};


