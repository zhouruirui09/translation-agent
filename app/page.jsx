'use client';
import { useEffect, useState } from 'react';
import { diffChars } from 'diff';

const SAMPLE = `It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.
However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.
"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"`;

export default function Page() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [research, setResearch] = useState(null);
  const [decisions, setDecisions] = useState({ audience: '', style: '', naming: '', difficulties: {} });
  const [chat, setChat] = useState([]);
  const [question, setQuestion] = useState('');
  const [brief, setBrief] = useState('');
  const [openQuestions, setOpenQuestions] = useState([]);
  const [result, setResult] = useState(null);
  const [translateProg, setTranslateProg] = useState(null);
  const [compare, setCompare] = useState(null);
  const [hl, setHl] = useState(false);
  const [finalMap, setFinalMap] = useState({});
  const [qe, setQe] = useState(null);
  const [judgeId, setJudgeId] = useState('deepseek');
  const [savedId, setSavedId] = useState(null);
  const [savedSig, setSavedSig] = useState('');
  const [dbList, setDbList] = useState([]);
  const [dbQuery, setDbQuery] = useState('');
  const [dbResults, setDbResults] = useState(null);
  const [dbDetail, setDbDetail] = useState(null);
  const [error, setError] = useState('');
  const [extraInst, setExtraInst] = useState('');
  const [flow, setFlow] = useState({ s1: true, s2: true, s3: true, s4: true, s5: true });
  const [versionMode, setVersionMode] = useState('random'); // random | manual
  const [numVersions, setNumVersions] = useState(3);
  const [manualModels, setManualModels] = useState({}); // 未出现=默认勾选
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState('');
  const [taskMode, setTaskMode] = useState('translate'); // translate | evaluate
  const [targetText, setTargetText] = useState('');
  const [evalTextType, setEvalTextType] = useState('文学/人文');
  const [alignInfo, setAlignInfo] = useState(null);

  function toggleFlow(k, v) {
    setFlow((f) => {
      const n = { ...f, [k]: v };
      if (k === 's1' && !v) n.s2 = false; // ②依赖①报告
      if (k === 's2' && v) n.s1 = true;
      return n;
    });
  }

  function toggleAllFlow(v) {
    setFlow({ s1: v, s2: v, s3: v, s4: v, s5: v });
  }

  function resetAll() {
    setText(''); setTargetText(''); setResearch(null); setBrief(''); setResult(null); setChat([]);
    setCompare(null); setQe(null); setFinalMap({}); setSavedId(null); setSavedSig('');
    setExtraInst(''); setParseMsg(''); setAlignInfo(null);
    setFlow({ s1: true, s2: true, s3: true, s4: true, s5: true });
    setVersionMode('random'); setNumVersions(3); setManualModels({});
  }

  async function uploadDoc(e, kind) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const isSource = kind !== 'target';
    if (isSource && text.trim() && !window.confirm('上传文档的解析结果将替换文本框中的现有原文，继续？')) return;
    if (!isSource && targetText.trim() && !window.confirm('上传文档的解析结果将替换现有译文，继续？')) return;
    setParsing(true); setParseMsg('');
    try {
      const fd = new FormData();
      fd.append('file', f);
      const r = await fetch('/api/parse', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '解析失败');
      if (isSource) setText(d.text); else setTargetText(d.text);
      setParseMsg(`已解析 ${f.name}（${d.chars} 字符）填入${isSource ? '原文' : '译文'}框${/\.(pdf|docx)$/i.test(f.name) ? '；文档为机器解析，建议先校对文字与分段' : ''}`);
    } catch (err) {
      setParseMsg(String(err.message || err));
    } finally { setParsing(false); }
  }

  async function refreshDb() {
    try {
      const r = await fetch('/api/db/list');
      const d = await r.json();
      setDbList(d.items || []);
    } catch {}
  }

  useEffect(() => {
    fetch('/api/status').then((r) => r.json()).then(setStatus).catch(() => {});
    refreshDb();
  }, []);

  async function call(url, body, label) {
    setBusy(label); setError('');
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      return data;
    } catch (e) { setError(String(e.message || e)); return null; }
    finally { setBusy(''); }
  }

  async function runResearch() {
    const data = await call('/api/research', { text, instructions: extraInst }, 'research');
    if (data) { setResearch(data); setBrief(''); setResult(null); setOpenQuestions([]); }
  }

  async function ask() {
    if (!question.trim()) return;
    const q = question; setQuestion('');
    setChat((c) => [...c, { role: 'user', content: q }]);
    const data = await call('/api/chat', { text, report: research?.report, question: q, history: chat }, 'chat');
    if (data) setChat((c) => [...c, { role: 'assistant', content: data.answer }]);
  }

  async function makeBrief() {
    const chatLog = chat.map((m) => `${m.role === 'user' ? '译员' : '顾问'}：${m.content}`).join('\n');
    const data = await call('/api/brief', { text, report: research?.report, decisions, chatLog, instructions: extraInst }, 'brief');
    if (data) { setBrief(data.brief_md || ''); setOpenQuestions(data.open_questions || []); }
  }

  // 送入翻译/评估的指令 = ②的 brief + 本次附加指令
  const effBrief = [brief.trim(), extraInst.trim() ? `【译员本次附加指令】\n${extraInst.trim()}` : ''].filter(Boolean).join('\n\n');

  // ③ 可参与的模型池（真实模式=已配置模型；mock 模式=全部）
  const pool = (() => {
    const real = (status?.providers || []).filter((p) => !p.mock);
    return real.length ? real : (status?.providers || []);
  })();
  const manualIds = pool.filter((p) => manualModels[p.id] !== false).map((p) => p.id);
  const pickedCount = versionMode === 'manual' ? manualIds.length : Math.min(numVersions, pool.length);
  const versionLabel = `生成 ${pickedCount} 版译文`;

  function pickProviderIds() {
    if (versionMode === 'manual') return manualIds;
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, Math.min(numVersions, arr.length)).map((p) => p.id);
  }

  async function runTranslate() {
    if (versionMode === 'manual' && !manualIds.length) { setError('手动模式下请至少勾选一个模型'); return; }
    const jobId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    setTranslateProg(null);
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/translate/progress?id=${jobId}`);
        const j = await r.json();
        if (j?.providers && Object.keys(j.providers).length) setTranslateProg(j);
      } catch {}
    }, 5000);
    const data = await call('/api/translate', { text, brief: effBrief, providerIds: pickProviderIds(), jobId }, 'translate');
    clearInterval(timer);
    setTranslateProg(null);
    if (data) { setResult(data); setCompare(null); setQe(null); setFinalMap({}); setSavedId(null); setSavedSig(''); }
  }

  const translateProgText = translateProg
    ? Object.values(translateProg.providers).map((p) => `${p.label} ${p.done}/${p.total}块`).join(' · ')
    : '';

  async function runAlign() {
    const data = await call('/api/align', { sourceText: text, targetText, judgeId }, 'align');
    if (data) {
      setResult({
        segments: data.segments,
        results: [{ provider: 'given', label: '指定译文', mock: false, error: null, translations: data.aligned.map((t, i) => `${i + 1}\t${t}`) }],
        briefApplied: false,
      });
      setCompare(null); setQe(null); setFinalMap({}); setSavedId(null); setSavedSig(''); setAlignInfo(data);
    }
  }

  async function runCompare() {
    if (!result) return;
    const data = await call('/api/compare', { segments: result.segments, results: result.results, brief: effBrief, judgeId }, 'compare');
    if (data) setCompare(data);
  }

  const transMaps = (result?.results || []).map((r) => {
    const map = {};
    (r.translations || []).forEach((line) => {
      const m = line.match(/^(\d+)\t([\s\S]*)$/);
      if (m) map[Number(m[1])] = m[2];
    });
    return { ...r, map };
  });

  function defaultFinal(n) {
    const c = compare?.comparisons?.[n - 1];
    const of = (pid) => transMaps.find((r) => r.provider === pid)?.map[n] || '';
    if (c?.baseProvider && of(c.baseProvider)) return of(c.baseProvider);
    return of('kimi') || (transMaps.find((r) => !r.error)?.map[n] || '');
  }
  const finalOf = (n) => finalMap[n] ?? defaultFinal(n);

  async function runQE() {
    if (!result) return;
    const finalArr = result.segments.map((_, i) => finalOf(i + 1));
    const data = await call('/api/qe', {
      segments: result.segments,
      final: finalArr,
      brief: effBrief,
      textType: taskMode === 'evaluate' ? evalTextType : (research?.report?.text_type || ''),
      judgeId,
    }, 'qe');
    if (data) { setQe(data); setSavedId(null); setSavedSig(''); }
  }

  // 定稿内容指纹：与 savedSig 相同说明入库后内容未变，禁止重复入库
  const finalSig = result ? JSON.stringify([text, effBrief, result.segments.map((_, i) => finalOf(i + 1))]) : '';

  async function saveToDb() {
    if (!result) return;
    const finalArr = result.segments.map((_, i) => finalOf(i + 1));
    const data = await call('/api/db/save', {
      textType: taskMode === 'evaluate' ? evalTextType : (research?.report?.text_type || ''),
      models: taskMode === 'evaluate' ? '指定译文（外部供稿）' : transMaps.filter((r) => !r.error).map((r) => r.label).join(' + '),
      source_text: text,
      segments: result.segments,
      final: finalArr,
      brief: effBrief,
      report: research,
      compare,
      qe,
      parent_id: savedId && finalSig !== savedSig ? savedId : null,
    }, 'save');
    if (data) { setSavedId(data.id); setSavedSig(finalSig); refreshDb(); }
  }

  async function searchDb() {
    const q = dbQuery.trim();
    if (!q) { setDbResults(null); return; }
    try {
      const r = await fetch(`/api/db/search?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      setDbResults(d.items || []);
    } catch {}
  }

  async function openDb(id) {
    try {
      const r = await fetch(`/api/db/get?id=${id}`);
      const d = await r.json();
      if (!r.ok) { setError(String(d.error || '记录不存在')); return; }
      setDbDetail(d);
    } catch {}
  }

  async function deleteFromDb(id, preview) {
    if (!window.confirm(`确定删除记录 #${id}？\n「${String(preview).slice(0, 30)}…」\n删除后不可恢复。`)) return;
    try {
      const r = await fetch('/api/db/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '删除失败');
      if (dbDetail?.id === id) setDbDetail(null);
      refreshDb();
    } catch (e) { setError(String(e.message || e)); }
  }

  const setDiff = (i, v) => setDecisions((d) => ({ ...d, difficulties: { ...d.difficulties, [i]: v } }));

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22 }}>英译汉翻译工作台</h1>
      <div style={{ marginBottom: 12, fontSize: 13, color: status?.mode === 'mock' ? '#b45309' : '#15803d' }}>
        模型状态：{status ? status.providers.map((p) => p.label).join(' · ') + (status.mode === 'mock' ? '（模拟）' : '（已就绪）') : '检测中…'}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 12px', padding: '8px 12px', background: '#fefce8', border: '1px solid #fde047', borderRadius: 8, fontSize: 14 }}>
        <b>任务类型：</b>
        <label><input type="radio" name="taskmode" checked={taskMode === 'translate'} onChange={() => setTaskMode('translate')} /> 翻译文本（完整工作流）</label>
        <label><input type="radio" name="taskmode" checked={taskMode === 'evaluate'} onChange={() => setTaskMode('evaluate')} /> 评估指定译文（原文 + 现成译文 → 对齐 → 质检）</label>
      </div>

      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={taskMode === 'evaluate' ? '在此粘贴（或上传）英文原文…' : '在此粘贴英文文本，或上传文档自动解析填入…'}
        style={{ width: '100%', height: 120, padding: 12, fontSize: 14, border: '1px solid #ccc', borderRadius: 8, boxSizing: 'border-box' }} />

      <div style={{ margin: '8px 0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="doc-upload" style={{ ...btn('#0f766e', parsing), display: 'inline-block' }}>{parsing ? '解析中…' : '📄 上传原文（.txt / .docx / .PDF）'}</label>
        <input id="doc-upload" type="file" accept=".txt,.md,.docx,.pdf" onChange={(e) => uploadDoc(e, 'source')} disabled={parsing} style={{ display: 'none' }} />
        {parseMsg && <span style={{ fontSize: 13, color: parseMsg.startsWith('已解析') ? '#15803d' : '#b91c1c' }}>{parseMsg}</span>}
      </div>

      {taskMode === 'evaluate' && (
        <>
          <textarea value={targetText} onChange={(e) => setTargetText(e.target.value)} placeholder="在此粘贴（或上传）待评估的中文译文，整篇即可，系统会自动与原文逐句对齐…"
            style={{ width: '100%', height: 100, padding: 12, fontSize: 14, border: '1px solid #fbbf24', borderRadius: 8, boxSizing: 'border-box', background: '#fffbeb' }} />
          <div style={{ margin: '8px 0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label htmlFor="doc-upload-target" style={{ ...btn('#b45309', parsing), display: 'inline-block' }}>{parsing ? '解析中…' : '📄 上传译文（.txt / .docx / .PDF）'}</label>
            <input id="doc-upload-target" type="file" accept=".txt,.md,.docx,.pdf" onChange={(e) => uploadDoc(e, 'target')} disabled={parsing} style={{ display: 'none' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280' }}>
              文本类型（决定评估权重）
              <select value={evalTextType} onChange={(e) => setEvalTextType(e.target.value)}
                style={{ padding: '6px 8px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, background: '#fff' }}>
                {['文学/人文', '新闻/时政', '科技/工程', '商务/法律'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
        </>
      )}

      <textarea value={extraInst} onChange={(e) => setExtraInst(e.target.value)} rows={2}
        placeholder="本次附加指令（可选）：任何特殊翻译要求都写这里，例如 人名保留英文、通篇用「您」、课堂作业读者是翻译课老师、本段出自小说《XXX」…"
        style={{ width: '100%', minHeight: 44, padding: 10, fontSize: 13, border: '1px solid #99f6e4', borderRadius: 8, boxSizing: 'border-box', background: '#f0fdfa', fontFamily: 'inherit' }} />
      <div style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 10px' }}>附加指令会注入 ① 检索、② brief、③ 翻译与 ⑤ 评估，无需再往原文里临时插备注。</div>

      {taskMode === 'translate' ? (<>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, color: '#374151', margin: '0 0 10px', padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <b>本次执行流程：</b>
        <label style={{ fontWeight: 600 }}><input type="checkbox" checked={flow.s1 && flow.s2 && flow.s3 && flow.s4 && flow.s5} onChange={(e) => toggleAllFlow(e.target.checked)} /> 全选</label>
        <label><input type="checkbox" checked={flow.s1} onChange={(e) => toggleFlow('s1', e.target.checked)} /> ① 译前检索报告</label>
        <label style={{ opacity: flow.s1 ? 1 : 0.4 }}><input type="checkbox" checked={flow.s2} disabled={!flow.s1} onChange={(e) => toggleFlow('s2', e.target.checked)} /> ② 对齐 + brief</label>
        <label><input type="checkbox" checked={flow.s3} onChange={(e) => toggleFlow('s3', e.target.checked)} /> ③ 译文版本</label>
        {flow.s3 && (
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '2px 8px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 6 }}>
            <label><input type="radio" name="vmode" checked={versionMode === 'random'} onChange={() => setVersionMode('random')} /> 随机</label>
            {versionMode === 'random' && (
              <select value={numVersions} onChange={(e) => setNumVersions(Number(e.target.value))} disabled={!pool.length}
                style={{ padding: '2px 4px', fontSize: 13, border: '1px solid #c7d2fe', borderRadius: 4, background: '#fff' }}>
                {Array.from({ length: Math.max(pool.length, 1) }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} 版</option>)}
              </select>
            )}
            <label><input type="radio" name="vmode" checked={versionMode === 'manual'} onChange={() => setVersionMode('manual')} /> 手动</label>
            {versionMode === 'manual' && pool.map((p) => (
              <label key={p.id}><input type="checkbox" checked={manualModels[p.id] !== false}
                onChange={(e) => setManualModels((m) => ({ ...m, [p.id]: e.target.checked }))} /> {p.label}</label>
            ))}
          </span>
        )}
        <label><input type="checkbox" checked={flow.s4} onChange={(e) => toggleFlow('s4', e.target.checked)} /> ④ 逐句比较</label>
        <label><input type="checkbox" checked={flow.s5} onChange={(e) => toggleFlow('s5', e.target.checked)} /> ⑤ 质量评估{flow.s5 ? '' : '（关=可跳过评估直接入库）'}</label>
      </div>

      <div style={{ margin: '12px 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {flow.s1 && (
          <StepBtn n="①" label={busy === 'research' ? '联网检索中（约数分钟）…' : '生成译前报告'} color="#7c3aed"
            onClick={runResearch} active={!busy && text.trim()} done={!!research} />
        )}
        {flow.s2 && research && (
          <StepBtn n="②" label={busy === 'brief' ? '汇总中…' : brief ? '重新生成 brief' : '生成 translation brief'} color="#0891b2"
            onClick={makeBrief} active={!busy} done={!!brief} />
        )}
        {flow.s3 && (
          <StepBtn n="③" label={busy === 'translate' ? (translateProgText ? `翻译中… ${translateProgText}` : '分块翻译中…') : versionLabel} color="#2563eb"
            onClick={runTranslate} active={!busy && text.trim() && pickedCount > 0}
            hint={versionMode === 'manual' && !manualIds.length ? '手动模式下请至少勾选一个模型' : effBrief ? '将带上 brief/附加指令' : flow.s2 ? '未生成 brief（可跳过②）' : '②未勾选，仅按默认约束翻译'} />
        )}
        {flow.s4 && result && transMaps.filter((r) => !r.error).length >= 2 && (
          <StepBtn n="④" label={busy === 'compare' ? '裁判逐句分析中…' : compare ? '重新生成整合意见' : '逐句比较 + 整合意见'} color="#ea580c"
            onClick={runCompare} active={!busy} done={!!compare} hint="匿名多版，裁判逐句给差异与整合建议" />
        )}
        {result && (flow.s4 || flow.s5) && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280' }}>
            裁判模型
            <select value={judgeId} onChange={(e) => setJudgeId(e.target.value)} disabled={!!busy}
              style={{ padding: '6px 8px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, background: '#fff' }}>
              {(status?.providers || []).filter((p) => !p.mock).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <span title="④ 逐句比较与 ⑤ 质量评估都用它当裁判；裁判是三版译者之一时留意自评偏袒">④⑤ 共用</span>
          </label>
        )}
        <button onClick={() => setText(SAMPLE)} style={btnGhost}>示例</button>
        <button onClick={resetAll} style={btnGhost}>清空</button>
      </div>
      </>) : (
      <div style={{ margin: '12px 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <StepBtn n="⚭" label={busy === 'align' ? '逐句对齐中…' : alignInfo ? '重新对齐原文与译文' : '逐句对齐原文与译文'} color="#7c3aed"
          onClick={runAlign} active={!busy && text.trim() && targetText.trim()} hint="用模型智能配对合句/拆句，结果可人工修正" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280' }}>
          评估裁判
          <select value={judgeId} onChange={(e) => setJudgeId(e.target.value)} disabled={!!busy}
            style={{ padding: '6px 8px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, background: '#fff' }}>
            {(status?.providers || []).filter((p) => !p.mock).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <button onClick={resetAll} style={btnGhost}>清空</button>
      </div>
      )}

      {alignInfo && taskMode === 'evaluate' && (
        <div style={{ fontSize: 13, color: '#374151', margin: '0 0 10px', padding: '6px 10px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6 }}>
          对齐完成：原文 {alignInfo.enCount} 句 ↔ 译文片段 {alignInfo.zhCount} 个（方式：{alignInfo.method === 'equal' ? '句数相同，直接 1:1' : alignInfo.method === 'llm' ? '模型智能对齐' : '按位置比例切分'}）。
          请在下方核对，发现错位可直接在定稿行修正，再运行评估。
          {alignInfo.warnings?.length > 0 && <ul style={{ margin: '4px 0 0', color: '#b45309' }}>{alignInfo.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </div>
      )}

      {error && <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>}

      {research && <ResearchPanel research={research} />}

      {flow.s2 && research && (
        <section style={panel('#ecfeff', '#a5f3fc')}>
          <h2 style={{ ...h2, color: '#0e7490' }}>② 译前对齐</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Choice label="目标读者与用途" value={decisions.audience} onChange={(v) => setDecisions((d) => ({ ...d, audience: v }))}
              options={['出版/大众读者', '学术研究者', '新闻通稿读者', '内部参考/自阅']} />
            <Choice label="文体倾向" value={decisions.style} onChange={(v) => setDecisions((d) => ({ ...d, style: v }))}
              options={['归化：中文自然流畅优先', '异化：保留原文句法与异域感', '贴近报告提到的经典出版译本风格']} />
            <div style={{ gridColumn: '1 / -1' }}>
              <Choice label="人名/地名/机构名策略" value={decisions.naming} onChange={(v) => setDecisions((d) => ({ ...d, naming: v }))}
                options={['采用报告引用的通行既有译法', '统一音译（不沿用旧译）', '首次出现附原文括注', '术语表逐条人工定夺']} />
            </div>
          </div>

          {research.report?.difficulties?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <b style={labelStyle}>难点逐条定夺（留空 = 采纳报告建议）</b>
              {research.report.difficulties.map((d, i) => (
                <div key={i} style={{ margin: '6px 0', padding: 8, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                  <div style={{ fontSize: 13 }}><b>{d.item}</b> — 建议：{d.suggestion}</div>
                  <input style={inputStyle} placeholder="你的决定（可选）" value={decisions.difficulties[i] || ''} onChange={(e) => setDiff(i, e.target.value)} />
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: 8 }}><b style={labelStyle}>自由问答（针对文本/报告的任何问题）</b></div>
          <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 8 }}>
            {chat.map((m, i) => (
              <div key={i} style={{ fontSize: 14, margin: '6px 0', padding: 8, borderRadius: 8, background: m.role === 'user' ? '#e0f2fe' : '#f3f4f6' }}>
                <b>{m.role === 'user' ? '译员' : '顾问'}：</b>{m.content}
              </div>
            ))}
            {busy === 'chat' && <div style={{ color: '#6b7280' }}>顾问思考中…</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inputStyle, flex: 1 }} placeholder="例如：这个双关怎么翻？旧译本如何处理这个人名？"
              value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} />
            <button onClick={ask} disabled={!!busy || !question.trim()} style={btn('#0891b2', !!busy)}>提问</button>
          </div>
        </section>
      )}

      {brief && (
        <section style={panel('#f0fdf4', '#bbf7d0')}>
          <h2 style={{ ...h2, color: '#15803d' }}>Translation Brief（可直接编辑，③ 翻译将严格执行）</h2>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)}
            style={{ width: '100%', minHeight: 260, padding: 12, fontSize: 13, fontFamily: 'ui-monospace, monospace', border: '1px solid #bbf7d0', borderRadius: 8, boxSizing: 'border-box' }} />
          {openQuestions.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 13, color: '#b45309' }}>
              <b>遗留问题（建议人工定夺）：</b><ul style={{ margin: 4 }}>{openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {result && <TranslateTable result={result} transMaps={transMaps} compare={compare} hl={hl} setHl={setHl} evaluateMode={taskMode === 'evaluate'} />}

      {result && (
        <section style={panel('#fff7ed', '#fed7aa')}>
          <h2 style={{ ...h2, color: '#c2410c' }}>
            {taskMode === 'evaluate' ? '⑤ 逐句核对与质量评估（指定译文）' : flow.s5 ? '⑤ 定稿（逐句）与质量评估' : '定稿（逐句）· 本次未勾选 ⑤ 评估'}
          </h2>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
            {taskMode === 'evaluate'
              ? '每行是对齐后的译文，可先修正错位/漏句（也可直接合并两行内容）。评估 = 规则校验（英文残留/术语/数字/漏译）+ 裁判五维评分。附加指令会作为术语与约束依据参与规则校验。'
              : flow.s5
              ? '每行初值取 ④ 的推荐底本（未做④则取第一个可用版本）。可直接编辑，或点"▸ 查看各版译文对照"就地比较并一键采用，不必翻回 ③。评估 = 规则校验（英文残留/术语对照 brief/数字/漏译）+ 裁判五维评分。'
              : '每行初值取第一个可用版本（未做④）。可直接编辑，或用"▸ 查看各版译文对照"一键采用任一版本；导出与入库不需要评估报告。'}
          </div>
          {result.segments.map((seg, i) => {
            const n = i + 1;
            return (
              <div key={n} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '6px 0', padding: 8, background: '#fff', border: '1px solid #fed7aa', borderRadius: 6 }}>
                <div style={{ minWidth: 26, fontSize: 13, color: '#9a3412', fontWeight: 600 }}>{n}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{seg}</div>
                  <textarea value={finalOf(n)} onChange={(e) => setFinalMap((m) => ({ ...m, [n]: e.target.value }))}
                    style={{ width: '100%', minHeight: 44, fontSize: 14, padding: 6, border: '1px solid #e5e7eb', borderRadius: 4, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  <VersionPeek
                    rows={transMaps.filter((r) => !r.error && r.map[n]).map((r) => ({ label: r.label, text: r.map[n] }))}
                    current={finalOf(n)}
                    onUse={(t) => setFinalMap((m) => ({ ...m, [n]: t }))}
                  />
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {(flow.s5 || taskMode === 'evaluate') && (
              <StepBtn n="▶" label={busy === 'qe' ? '评估中（规则 + 裁判）…' : '运行质量评估'} color="#c2410c" onClick={runQE} active={!busy} done={!!qe} />
            )}
            <StepBtn n="⑥" label={busy === 'save' ? '入库中…' : savedId ? (finalSig === savedSig ? `已存入译文库 #${savedId}` : `内容已改，存为新版本（上次 #${savedId}）`) : '确认定稿，存入译文库'} color="#16a34a"
              onClick={saveToDb} active={!busy && (taskMode === 'evaluate' || !flow.s5 || !!qe) && finalSig !== savedSig}
              hint={taskMode === 'evaluate' ? '评估报告与译文一并存档' : !flow.s5 ? '本次未勾选⑤，将直接入库（无评估分）' : qe ? (savedId && finalSig === savedSig ? '入库后修改定稿/brief 才会重新开放' : '原文+定稿+brief+报告全链路存档') : '需先完成质量评估'} />
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 13, color: '#6b7280', marginRight: 6 }}>导出定稿：</span>
            <ExportBar getData={() => ({ segments: result.segments, final: result.segments.map((_, i) => finalOf(i + 1)), source_text: text, defaultTitle: '译文定稿' })} />
          </div>
          {flow.s5 && qe && <QEPanel qe={qe} />}
        </section>
      )}

      <section style={panel('#f1f5f9', '#cbd5e1')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <h2 style={{ ...h2, color: '#334155', margin: 0 }}>⑦ 译文数据库（{dbList.length} 条）</h2>
          <button onClick={() => { refreshDb(); setDbResults(null); }} style={btnGhost}>刷新</button>
          <a href="/api/db/backup" download style={{ ...btnGhost, textDecoration: 'none' }}>⬇ 备份数据库</a>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>定期下载备份；恢复=把备份文件覆盖到 data/translations.db</span>
          <input style={{ ...inputStyle, flex: 1, minWidth: 220 }} placeholder="全文检索原文/译文，回车查询"
            value={dbQuery} onChange={(e) => setDbQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchDb()} />
          <button onClick={searchDb} disabled={!dbQuery.trim()} style={btn('#334155', !dbQuery.trim())}>检索</button>
          {dbResults && <button onClick={() => setDbResults(null)} style={btnGhost}>收起结果（{dbResults.length} 条命中）</button>}
        </div>
        <DbTable rows={dbResults ?? dbList} onOpen={openDb} onDelete={deleteFromDb} highlight={!!dbResults} />
        {dbDetail && <DbDetail rec={dbDetail} onClose={() => setDbDetail(null)} onChanged={(r) => { setDbDetail(r); refreshDb(); }} providers={pool} onOpen={openDb} />}
      </section>
    </main>
  );
}

function DbTable({ rows, onOpen, onDelete, highlight }) {
  if (!rows || rows.length === 0) {
    return <div style={{ color: '#6b7280', fontSize: 13 }}>{highlight ? '没有命中记录。' : '还没有已入库的译文。走完 ①→⑥ 流程后，定稿会自动存入这里。'}</div>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #cbd5e1' }}>
          <th style={{ padding: '4px 6px' }}>#</th><th style={{ padding: '4px 6px' }}>日期</th><th style={{ padding: '4px 6px' }}>类型</th>
          <th style={{ padding: '4px 6px' }}>模型</th><th style={{ padding: '4px 6px' }}>总分</th><th style={{ padding: '4px 6px' }}>原文首句</th>
          <th style={{ padding: '4px 6px' }}>定稿首句</th><th style={{ padding: '4px 6px' }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '4px 6px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{r.id}{r.parent_id != null && <span style={{ color: '#c4b5fd', marginLeft: 4 }} title={`本版本继承自 #${r.parent_id}`}>←#{r.parent_id}</span>}</td>
            <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{r.created_at}</td>
            <td style={{ padding: '4px 6px' }}>{(r.text_type || '').slice(0, 12)}</td>
            <td style={{ padding: '4px 6px' }}>{r.models}</td>
            <td style={{ padding: '4px 6px', fontWeight: 700, color: r.qe_total >= 85 ? '#15803d' : r.qe_total >= 70 ? '#b45309' : '#b91c1c' }}>{r.qe_total ?? '—'}</td>
            <td style={{ padding: '4px 6px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.source_preview}</td>
            <td style={{ padding: '4px 6px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.target_preview}</td>
            <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
              <button onClick={() => onOpen(r.id)} style={btnTiny}>查看</button>{' '}
              <button onClick={() => onDelete(r.id, r.source_preview)} style={{ ...btnTiny, color: '#b91c1c', borderColor: '#fca5a5' }}>删除</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DbDetail({ rec, onClose, onChanged, providers = [], onOpen }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const [evalMsg, setEvalMsg] = useState('');
  const [reevalJudge, setReevalJudge] = useState('deepseek');
  const [err, setErr] = useState('');
  const qeJudge = rec.qe?.judge;

  function startEdit() { setDraft([...(rec.final || [])]); setErr(''); setEvalMsg(''); setEditing(true); }
  async function saveEdit(withEval) {
    setSaving(true); setErr(''); setEvalMsg('');
    try {
      const r = await fetch('/api/db/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rec.id, final: draft, reEval: !!withEval, judgeId: reevalJudge }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '保存失败');
      if (withEval && d.evalError) setEvalMsg(d.evalError);
      if (withEval && !d.evalError) setEvalMsg(`已重新评估，新总分 ${d.qe_total ?? '—'}`);
      const rr = await fetch(`/api/db/get?id=${rec.id}`);
      onChanged(await rr.json());
      if (!withEval) setEditing(false);
    } catch (e) { setErr(String(e.message || e)); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ marginTop: 12, padding: 12, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <b style={{ fontSize: 15 }}>记录 #{rec.id} · {rec.created_at} · {rec.text_type} · 模型：{rec.models}{rec.qe_total != null ? ` · 总分 ${rec.qe_total}` : ''}</b>
        <span>
          {rec.parent_id != null && (
            <button onClick={() => onOpen(rec.parent_id)} style={btnTiny} title="本记录由该版本修改后再入库而来">← 上一版本 #{rec.parent_id}</button>
          )}{' '}
          {editing ? (
            <>
              <select value={reevalJudge} onChange={(e) => setReevalJudge(e.target.value)} style={{ ...inputStyle, padding: '4px 6px', fontSize: 12 }} title="重评使用的裁判模型">
                {(providers.length ? providers : [{ id: 'deepseek', label: 'DeepSeek' }]).map((p) => <option key={p.id} value={p.id}>裁判：{p.label}</option>)}
              </select>{' '}
              <button onClick={() => saveEdit(false)} disabled={saving} style={btn('#16a34a', saving)}>{saving ? '保存中…' : '保存修改'}</button>{' '}
              <button onClick={() => saveEdit(true)} disabled={saving} style={btn('#6d28d9', saving)}>{saving ? '处理中…' : '保存并重新评估'}</button>{' '}
              <button onClick={() => setEditing(false)} disabled={saving} style={btnGhost}>取消</button>
            </>
          ) : (
            <button onClick={startEdit} style={btn('#0891b2', false)}>编辑定稿</button>
          )}{' '}
          <button onClick={onClose} style={btnGhost}>关闭</button>
        </span>
      </div>
      {editing && <div style={{ fontSize: 12, color: '#92400e', marginBottom: 6 }}>修改后可"保存修改"（评估报告保留为旧快照）或"保存并重新评估"（用新定稿重跑 ⑤，覆盖本条的评估报告与总分；句数多时需要等几分钟）。</div>}
      {err && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 6 }}>{err}</div>}
      {evalMsg && <div style={{ color: '#6d28d9', fontSize: 13, marginBottom: 6 }}>{evalMsg}</div>}
      {!editing && (
        <div style={{ marginBottom: 8 }}>
          <ExportBar getData={() => ({ segments: rec.segments, final: rec.final, source_text: rec.source_text, defaultTitle: `译文记录#${rec.id}` })} />
        </div>
      )}
      {qeJudge?.summary && !editing && <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}><b>评估总评：</b>{qeJudge.summary}</div>}
      {rec.brief && (
        <details style={{ marginBottom: 8 }}>
          <summary style={{ fontSize: 13, color: '#334155', cursor: 'pointer' }}>Translation Brief</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#f8fafc', padding: 8, borderRadius: 6 }}>{rec.brief}</pre>
        </details>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #cbd5e1' }}>
            <th style={{ padding: '4px 6px', width: 30 }}>#</th><th style={{ padding: '4px 6px' }}>英文原文</th><th style={{ padding: '4px 6px', width: '45%' }}>中文定稿</th>
          </tr>
        </thead>
        <tbody>
          {(rec.segments || []).map((seg, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
              <td style={{ padding: '4px 6px', color: '#94a3b8' }}>{i + 1}</td>
              <td style={{ padding: '4px 6px', color: '#6b7280' }}>{seg}</td>
              <td style={{ padding: '4px 6px' }}>
                {editing ? (
                  <textarea value={draft[i] ?? ''} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? e.target.value : x)))}
                    style={{ width: '100%', minHeight: 44, fontSize: 13, padding: 6, border: '1px solid #0891b2', borderRadius: 4, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                ) : ((rec.final || [])[i] || '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ⑤ 定稿行内的就地版本对照：不用翻回 ③ 即可看到各版该句译文，一键采用
function VersionPeek({ rows = [], current, onUse }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  if (rows.length === 1) {
    return (
      <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => onUse(rows[0].text)} style={btnTiny}>复制 {rows[0].label}</button>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 4 }}>
      <button onClick={() => setOpen((o) => !o)} style={btnTiny}>{open ? '▾ 收起各版译文' : `▸ 查看 ${rows.length} 版译文对照`}</button>
      {open && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r) => {
            const used = r.text === current;
            return (
              <div key={r.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#f8fafc', border: used ? '1px solid #86efac' : '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px' }}>
                <div style={{ flex: 1, fontSize: 13 }}>
                  <b style={{ color: '#0f766e' }}>{r.label}</b>
                  {used && <span style={{ marginLeft: 6, fontSize: 11, color: '#15803d' }}>✓ 当前定稿采用</span>}
                  <div style={{ marginTop: 2, color: '#334155' }}>{r.text}</div>
                </div>
                {!used && <button onClick={() => onUse(r.text)} style={btnTiny}>用到此行</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StepBtn({ n, label, color, onClick, active, done, hint }) {  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button onClick={onClick} disabled={!active}
        style={{ ...btn(color, !active), textDecoration: done ? 'underline' : 'none' }}>
        {n} {label}
      </button>
      {hint && <span style={{ fontSize: 12, color: '#6b7280' }}>{hint}</span>}
    </span>
  );
}

function Choice({ label, value, onChange, options }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {options.map((o) => (
        <label key={o} style={{ fontSize: 13, marginRight: 12, whiteSpace: 'nowrap', display: 'inline-block', margin: '2px 10px 2px 0' }}>
          <input type="radio" checked={value === o} onChange={() => onChange(o)} /> {o}
        </label>
      ))}
    </div>
  );
}

function ResearchPanel({ research }) {
  const [open, setOpen] = useState(false);
  const r = research.report || {};
  return (
    <section style={{ border: '1px solid #ddd6fe', background: '#faf5ff', borderRadius: 10, padding: 16, marginBottom: 20 }}>
      <h2 style={{ ...h2, color: '#6d28d9', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        ① 译前准备报告 {open ? '▾ 收起' : '▸ 展开'}
      </h2>
      <div style={{ fontSize: 13, color: '#6b7280' }}>{research.identify} ｜ 置信度 {r.confidence} ｜ 来源 {research.sources?.length} 个</div>
      {open && <>
        <Field label="文本类型" value={r.text_type} />
        <Field label="出处" value={r.source} />
        <Field label="作者及背景" value={r.author} />
        <Field label="写作背景" value={r.writing_context} />
        <Field label="公开译本" value={r.public_translations} />
        {r.notes?.length > 0 && <Block title="翻译注意事项"><ul>{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></Block>}
        {r.glossary?.length > 0 && (
          <Block title={`术语表草案（${r.glossary.length}）`}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>{r.glossary.map((g, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '4px 8px', fontWeight: 600 }}>{g.en}</td>
                  <td style={{ padding: '4px 8px' }}>{g.zh}</td>
                  <td style={{ padding: '4px 8px', color: '#6b7280' }}>{g.note}</td>
                </tr>
              ))}</tbody>
            </table>
          </Block>
        )}
        {research.sources?.length > 0 && (
          <Block title="检索来源">
            <ul style={{ fontSize: 13 }}>{research.sources.map((s, i) => (
              <li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> — {s.site} · {s.date}</li>
            ))}</ul>
          </Block>
        )}
      </>}
    </section>
  );
}

function TranslateTable({ result, transMaps, compare, hl, setHl, evaluateMode }) {
  const compByN = {};
  (compare?.comparisons || []).forEach((c) => { compByN[c.n] = c; });
  const baseMapOf = (n) => {
    const c = compByN[n];
    if (!c?.baseProvider) return null;
    return transMaps.find((r) => r.provider === c.baseProvider)?.map[n] || null;
  };
  return (
    <section style={{ marginTop: 8 }}>
      <h2 style={h2}>{evaluateMode ? `⚭ 原文 ↔ 译文对齐结果（${transMaps.length} 版供核对）` : `③ 译文逐句对照（${transMaps.length} 版）`}{!evaluateMode && result.briefApplied && <span style={{ fontSize: 12, color: '#15803d' }}>（已应用 brief）</span>}</h2>
      {!evaluateMode && result.chunks > 1 && (
        <div style={{ margin: '4px 0', fontSize: 12, color: '#6b7280' }}>本次分 {result.chunks} 块并行翻译{result.results?.some((r) => r.chunkErrors?.length) ? '' : '，全部块成功'}</div>
      )}
      {!evaluateMode && result.results?.some((r) => r.chunkErrors?.length) && (
        <div style={{ margin: '6px 0', fontSize: 13, color: '#b45309' }}>
          部分块重试后仍失败（对应句子是占位符，建议在⑤人工补译）：
          {result.results.filter((r) => r.chunkErrors?.length).map((r) => `${r.label} ${r.chunkErrors.join('；')}`).join(' ｜ ')}
        </div>
      )}
      {compare && (
        <div style={{ margin: '6px 0', fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <label><input type="checkbox" checked={hl} onChange={(e) => setHl(e.target.checked)} /> 高亮与推荐底本的差异（黄色=该版新增，红色删除线=该版缺少的底本内容）</label>
          <span style={{ color: '#6b7280' }}>裁判：{compare.judgeLabel} ｜ 本轮匿名对应：{compare.mapping.map((m) => `${m.tag}=${m.label}`).join('，')}</span>
        </div>
      )}
      {compare?.errors?.length > 0 && (
        <div style={{ margin: '6px 0', fontSize: 13, color: '#b45309' }}>部分批次失败：{compare.errors.join('；')}</div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr>
            <th style={th}>#</th><th style={th}>原文</th>
            {transMaps.map((r) => <th key={r.provider} style={th}>{r.label}{r.mock ? ' (mock)' : ''}{r.error ? ' ✗' : ''}</th>)}
            {compare && <th style={{ ...th, minWidth: 220 }}>④ 差异与整合意见</th>}
          </tr></thead>
          <tbody>{result.segments.map((seg, i) => {
            const c = compByN[i + 1];
            const baseText = baseMapOf(i + 1);
            return (
            <tr key={i} style={{ verticalAlign: 'top' }}>
              <td style={td}>{i + 1}</td><td style={td}>{seg}</td>
              {transMaps.map((r) => {
                const showDiff = hl && baseText && c && r.provider !== c.baseProvider && !r.error;
                return (
                  <td key={r.provider} style={{ ...td, color: r.error ? '#b91c1c' : 'inherit' }}>
                    {r.error ? r.error : showDiff
                      ? <DiffVs base={baseText} text={r.map[i + 1] ?? '—'} />
                      : r.map[i + 1] ?? '—'}
                  </td>
                );
              })}
              {compare && (
                <td style={{ ...td, fontSize: 13, maxWidth: 360 }}>
                  {!c ? '—' : (
                    <>
                      {c.base && <div style={{ marginBottom: 4 }}><span style={{ background: '#ffedd5', borderRadius: 4, padding: '2px 6px', fontSize: 12 }}>底本 {c.base} · {c.baseLabel}</span></div>}
                      {c.diffs && <div style={{ color: '#6b7280', marginBottom: 4 }}><b>差异：</b>{c.diffs}</div>}
                      {c.advice && <div><b>整合：</b>{c.advice}</div>}
                    </>
                  )}
                </td>
              )}
            </tr>
            );
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

function DiffVs({ base, text }) {
  return (
    <span>
      {diffChars(base, text).map((p, i) =>
        p.added ? <mark key={i} style={{ background: '#fef08a' }}>{p.value}</mark>
        : p.removed ? <span key={i} style={{ color: '#dc2626', textDecoration: 'line-through', opacity: 0.55 }}>{p.value}</span>
        : <span key={i}>{p.value}</span>
      )}
    </span>
  );
}

function QEPanel({ qe }) {
  const { rules, judge } = qe;
  const kindLabel = { english: '英文残留', term: '术语', number: '数字', missing: '漏译' };
  const verdictColor = { pass: '#15803d', minor: '#b45309', major: '#b91c1c', unknown: '#6b7280', unjudged: '#6b7280' };
  const problemRows = judge.per_sentence.filter((p) => p.verdict !== 'pass' && (p.problems?.length || p.verdict === 'major' || p.verdict === 'minor'));
  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 15, color: '#c2410c' }}>质量评估报告（裁判：{judge.judgeLabel} ｜ 权重 profile：{judge.profile.label}）</h3>
      {judge.errors?.length > 0 && <div style={{ color: '#b45309', fontSize: 13 }}>部分批次失败：{judge.errors.join('；')}</div>}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '10px 0', alignItems: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: judge.weighted_total >= 85 ? '#15803d' : judge.weighted_total >= 70 ? '#b45309' : '#b91c1c' }}>
          加权总分 {judge.weighted_total ?? '—'}
        </div>
        <div style={{ flex: 1, minWidth: 280 }}>
          {Object.entries(judge.scores).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '2px 0' }}>
              <span style={{ width: 96 }}>{judge.dimLabels[k]}（{Math.round(judge.profile.weights[k] * 100)}%）</span>
              <div style={{ flex: 1, background: '#eee', borderRadius: 4, height: 10 }}>
                <div style={{ width: `${v || 0}%`, background: v >= 85 ? '#22c55e' : v >= 70 ? '#f59e0b' : '#ef4444', height: 10, borderRadius: 4 }} />
              </div>
              <span style={{ width: 30, textAlign: 'right' }}>{v ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>
      {judge.summary && (
        <div style={{ fontSize: 14, padding: 10, background: '#fff', border: '1px solid #fed7aa', borderRadius: 6, marginBottom: 10 }}>
          <b>总评：</b>{judge.summary}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <h4 style={{ fontSize: 14, margin: '0 0 6px' }}>规则校验（{rules.issues.length} 条{rules.glossarySize ? `，已对照 ${rules.glossarySize} 组 brief 术语` : '，未提供 brief 术语表'}）</h4>
          {rules.issues.length === 0 ? (
            <div style={{ color: '#15803d', fontSize: 13 }}>全部通过：无英文残留、数字有对应、术语合规、无空句。</div>
          ) : rules.issues.map((it, i) => (
            <div key={i} style={{ fontSize: 13, margin: '3px 0', padding: 6, background: '#fff', border: '1px solid #fee2e2', borderRadius: 4 }}>
              <b style={{ color: '#b91c1c' }}>第{it.n}句［{kindLabel[it.kind] || it.kind}］</b>{' '}{it.detail}
            </div>
          ))}
        </div>
        <div>
          <h4 style={{ fontSize: 14, margin: '0 0 6px' }}>裁判逐句问题（major {judge.majors_count} 处）</h4>
          {problemRows.length === 0 ? (
            <div style={{ color: '#15803d', fontSize: 13 }}>裁判未发现问题。</div>
          ) : problemRows.map((p) => (
            <div key={p.n} style={{ fontSize: 13, margin: '3px 0', padding: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 4 }}>
              <b style={{ color: verdictColor[p.verdict] }}>第{p.n}句 {p.verdict}</b>
              {(p.problems || []).map((pr, i) => (
                <div key={i} style={{ marginLeft: 8, color: '#374151' }}>［{pr.dim}］{pr.desc}{pr.fix ? ` → 建议：${pr.fix}` : ''}</div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, value }) => value ? (
  <div style={{ marginBottom: 8 }}><b style={{ fontSize: 13, color: '#6d28d9' }}>{label}：</b><span style={{ fontSize: 14 }}>{value}</span></div>
) : null;
const Block = ({ title, children }) => (
  <div style={{ marginTop: 12 }}><h3 style={{ fontSize: 14, margin: '0 0 6px', color: '#5b21b6' }}>{title}</h3>{children}</div>
);
const panel = (bg, border) => ({ border: `1px solid ${border}`, background: bg, borderRadius: 10, padding: 16, marginBottom: 20 });
const h2 = { fontSize: 16, margin: '0 0 8px' };
const labelStyle = { fontSize: 13 };
const inputStyle = { width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' };
const btn = (color, disabled) => ({ padding: '8px 16px', fontSize: 14, border: 'none', borderRadius: 8, background: disabled ? '#9ca3af' : color, color: '#fff', cursor: disabled ? 'not-allowed' : 'pointer' });
const btnGhost = { padding: '8px 16px', fontSize: 14, border: '1px solid #ccc', borderRadius: 8, background: '#fff', color: '#333', cursor: 'pointer' };
const btnTiny = { padding: '2px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', color: '#374151', cursor: 'pointer' };
const th = { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #ddd', background: '#f8fafc' };
const td = { padding: '8px 10px', borderBottom: '1px solid #eee', minWidth: 140 };

const EXPORT_MODES = [
  ['translation', '纯译文'],
  ['line', '逐句对照'],
  ['table', '表格式对照'],
  ['para', '按段交替对照'],
];

function ExportBar({ getData }) {
  const [mode, setMode] = useState('translation');
  const [format, setFormat] = useState('docx');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const sel = { padding: '5px 6px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, background: '#fff' };

  async function go() {
    setBusy(true); setMsg('');
    try {
      const data = getData();
      const t = (title.trim() || data.defaultTitle || '译文导出').slice(0, 60);
      const r = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, mode, format, title: t }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `导出失败 ${r.status}`); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${t}.${format === 'docx' ? 'docx' : 'md'}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setMsg(`已下载 ${t}.${format === 'docx' ? 'docx' : 'md'}`);
    } catch (e) { setMsg(String(e.message || e)); }
    finally { setBusy(false); }
  }

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <input style={{ ...sel, width: 170 }} placeholder="文档标题（用作文件名）" value={title} onChange={(e) => setTitle(e.target.value)} />
      <select style={sel} value={mode} onChange={(e) => setMode(e.target.value)}>
        {EXPORT_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select style={sel} value={format} onChange={(e) => setFormat(e.target.value)}>
        <option value="docx">Word (.docx)</option>
        <option value="md">Markdown (.md)</option>
      </select>
      <button onClick={go} disabled={busy} style={btn('#0f766e', busy)}>{busy ? '生成中…' : '⬇ 下载'}</button>
      {msg && <span style={{ fontSize: 12, color: msg.startsWith('已下载') ? '#15803d' : '#b91c1c' }}>{msg}</span>}
    </span>
  );
}
