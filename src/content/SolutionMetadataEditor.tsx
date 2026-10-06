import { useT } from '../i18n/locale';
import { useId, useState } from 'react';
import type { SolutionMetadata, StoredSolution } from '../database/types';

export const sourceNames = { own: '我的代码', reference: '参考题解', template: '模板代码' };

export function SolutionMetadataEditor({ solution, busy, onSave, onCancel }: {
  solution: StoredSolution; busy: boolean; onSave: (metadata: SolutionMetadata) => void; onCancel: () => void;
}) {
  const t = useT();
  const id = useId();
  const [metadata, setMetadata] = useState<SolutionMetadata>({ name: solution.name, note: solution.note, source: solution.source, sourceUrl: solution.sourceUrl });
  return <form onSubmit={(event) => { event.preventDefault(); onSave(metadata); }}>
    <label htmlFor={`${id}-name`}>{t("修改名称")}</label>
    <input id={`${id}-name`} required maxLength={100} disabled={busy} value={metadata.name} onChange={(e) => setMetadata({ ...metadata, name: e.target.value })} />
    <label htmlFor={`${id}-note`}>{t("修改备注")}</label>
    <textarea id={`${id}-note`} maxLength={5000} disabled={busy} value={metadata.note} onChange={(e) => setMetadata({ ...metadata, note: e.target.value })} />
    <label htmlFor={`${id}-source`}>{t("来源类型")}</label>
    <select id={`${id}-source`} disabled={busy} value={metadata.source} onChange={(e) => setMetadata({ ...metadata, source: e.target.value as SolutionMetadata['source'] })}>
      {Object.entries(sourceNames).map(([value, name]) => <option key={value} value={value}>{t(name)}</option>)}
    </select>
    <label htmlFor={`${id}-url`}>{t("来源链接")}</label>
    <input id={`${id}-url`} type="url" required maxLength={2000} disabled={busy} value={metadata.sourceUrl} onChange={(e) => setMetadata({ ...metadata, sourceUrl: e.target.value })} />
    <p className="muted">{t("代码和语言保留原快照；修改代码请重新读取并保存新版本。")}</p>
    <div className="form-actions"><button className="retry" disabled={busy} type="submit">{t("保存修改")}</button><button className="secondary" disabled={busy} type="button" onClick={onCancel}>{t("取消修改")}</button></div>
  </form>;
}
