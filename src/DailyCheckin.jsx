import React, { useState } from "react";

export default function DailyCheckin() {
  const [tasks, setTasks] = useState([
    { id: 1, title: "核心产出：写公众号200字", done: false },
    { id: 2, title: "股票：早盘观察+操作", done: false },
    { id: 3, title: "深度阅读：文章5页", done: false },
  ]);

  const toggleDone = (id) =>
    setTasks(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>📅 每日执行打卡</h1>
      {tasks.map((t) => (
        <div key={t.id}>
          <label>
            <input
              type="checkbox"
              checked={t.done}
              onChange={() => toggleDone(t.id)}
            />
            {t.title}
          </label>
        </div>
      ))}
    </div>
  );
}
