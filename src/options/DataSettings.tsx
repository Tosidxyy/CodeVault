import { useT } from '../i18n/locale';
import { useRef, useState } from 'react';
import { exportBackup, importBackup } from '../database/backup';
import { maxBackupBytes, parseBackup } from '../database/backupFormat';
import type { Backup } from '../database/backupFormat';

export function DataSettings() {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<Backup>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function download() {
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await exportBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `CodeVault-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage(`备份文件已生成：${data.problems.length} 个题目、${data.solutions.length} 个解法、${data.notes.length} 份笔记。`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function preview(file?: File) {
    if (!file) return;
    setBusy(true); setBackup(undefined); setError(''); setMessage('');
    try {
      if (file.size > maxBackupBytes) throw new Error('备份文件不能超过64MB。');
      setBackup(parseBackup(await file.text()));
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!backup || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await importBackup(backup); setBackup(undefined);
      window.dispatchEvent(new Event('codevault-library-changed'));
      setMessage(`导入完成：新增 ${result.problems} 个题目、${result.solutions} 个解法、${result.notes} 份笔记；跳过 ${result.skipped} 条已有记录。刷新已打开的题目页面查看恢复内容。`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="data-settings" aria-label={t("数据备份")}>
    <h2>{t("数据备份")}</h2><p>{t("将题目（含回收站）、解法、图文笔记和已保存分析备份到本地文件，不包含 API Key 或 AI 配置。")}</p>
    <p>{t("导出前请确认笔记显示“已保存”。备份文件未加密，请妥善保管；单份最多64MB。")}</p>
    <div className="data-actions"><button disabled={busy || !!backup} onClick={() => void download()}>{t("导出备份")}</button><button disabled={busy} onClick={() => fileInput.current?.click()}>{t("选择备份文件")}</button></div>
    <input hidden ref={fileInput} type="file" accept=".json,application/json" aria-label={t("选择数据备份")} disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void preview(file); }} />
    {backup && <div className="import-preview" role="group" aria-label={t("导入确认")}><strong>{t("备份预览")}</strong><p>{backup.problems.length}{t(" 个题目 · ")}{backup.solutions.length}{t(" 个解法 · ")}{backup.notes.length}{t(" 份笔记")}</p>{backup.problems.some(row => row.deletedAt) && <p>{t("其中 ")}{backup.problems.filter(row => row.deletedAt).length}{t(" 个题目将保留回收站状态。")}</p>}<p>{t("仅导入缺失记录；同ID的现有内容优先保留，不会被旧备份覆盖。")}</p><div className="data-actions"><button disabled={busy} onClick={() => void restore()}>{t("确认合并导入")}</button><button disabled={busy} onClick={() => setBackup(undefined)}>{t("取消导入")}</button></div></div>}
    {busy && <p role="status">{t("正在处理备份…")}</p>}{t(message) && <p role="status">{t(message)}</p>}{t(error) && <p role="alert">{t(error)}</p>}
  </section>;
}
