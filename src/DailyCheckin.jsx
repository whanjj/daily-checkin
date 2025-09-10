import React, { useState } from "react";

export default function DailyCheckin() {
  const [tasks, setTasks] = useState([
    { id: 1, title: "核心产出：写公众号200字", done: false },
    { id: 2, title: "股票：早盘观察+操作", done: false },
    { id: 3, title: "深度阅读：文章5页", done: false }
  ]);

  const toggle = (id) => setTasks(ts => ts.map(t => (t.id === id ? { ...t, done: !t.done } : t)));

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif", color: "#111", background: "#fff" }}>
      <h1 style={{ fontSize: 28 }}>📅 每日执行打卡（测试版本）</h1>
      {tasks.map(t => (
        <div key={t.id} style={{ margin: "10px 0" }}>
          <label>
            <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />{" "}
            {t.done ? <s>{t.title}</s> : t.title}
          </label>
        </div>
      ))}
    </div>
  );
}
