<div style={{ marginTop: 12 }}>
  {visibleTasks.map((t) => (
    <div key={t.id} style={taskRow}>
      {/* 左侧勾选 */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <input
          type="checkbox"
          checked={!!t.done}
          onChange={() => toggleTask(t.id)}
          style={{ marginTop: 4 }}
          title="完成勾选"
        />

        {/* 右侧主体：锁定=清单样式；解锁=可编辑 */}
        <div style={{ flex: 1 }}>
          {locked ? (
            <>
              {/* ✅ 清单样式（只读展示） */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
                {t.fixedWindow && <span style={badgeTime}>{t.fixedWindow}</span>}
                <span style={badge}>{t.section || "未分类"}</span>
                <span style={titleText}>{t.title || "未命名任务"}</span>
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
              {/* ✏️ 解锁时显示编辑控件（原来的输入框） */}
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

                {!locked && (
                  <button style={btnDanger} onClick={() => removeTask(t.id)}>
                    删除
                  </button>
                )}
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
