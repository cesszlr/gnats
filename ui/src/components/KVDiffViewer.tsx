import React, { useMemo } from 'react';
import { diffLines, diffChars } from 'diff';
import { useTranslation } from 'react-i18next';

interface KVDiffViewerProps {
  oldValue: string;
  newValue: string;
}

// 辅助函数：计算两行文本的相似度，避免不相干的行被强行做字符级比对，产生凌乱高亮
const areRowsSimilar = (str1: string, str2: string): boolean => {
  const s1 = str1.trim();
  const s2 = str2.trim();
  if (!s1 || !s2) return false;

  // 使用 diffChars 快速计算最长公共字符长度
  const charDiffs = diffChars(s1, s2);
  let commonLength = 0;
  for (const part of charDiffs) {
    if (!part.added && !part.removed) {
      commonLength += part.value.length;
    }
  }

  const maxLength = Math.max(s1.length, s2.length);
  return (commonLength / maxLength) >= 0.35; // 35% 相似度阈值
};

export const KVDiffViewer: React.FC<KVDiffViewerProps> = ({ oldValue, newValue }) => {
  const { t } = useTranslation();
  const { leftRows, rightRows } = useMemo(() => {
    const diffs = diffLines(oldValue || '', newValue || '');
    const left: { text: string; type: 'removed' | 'normal' | 'placeholder'; lineNum?: number }[] = [];
    const right: { text: string; type: 'added' | 'normal' | 'placeholder'; lineNum?: number }[] = [];

    let leftLineCounter = 1;
    let rightLineCounter = 1;

    let i = 0;
    while (i < diffs.length) {
      const current = diffs[i];
      const next = diffs[i + 1];

      // 检测“修改”块（一组 removed 后面紧跟 added）进行精确的对齐
      if (current.removed && next && next.added) {
        const leftLines = current.value.split('\n');
        const rightLines = next.value.split('\n');

        // 去除 split 的尾部空串（如果以 \n 结尾）
        if (leftLines.length > 1 && leftLines[leftLines.length - 1] === '') leftLines.pop();
        if (rightLines.length > 1 && rightLines[rightLines.length - 1] === '') rightLines.pop();

        const maxLen = Math.max(leftLines.length, rightLines.length);
        for (let j = 0; j < maxLen; j++) {
          if (j < leftLines.length) {
            left.push({ text: leftLines[j], type: 'removed', lineNum: leftLineCounter++ });
          } else {
            left.push({ text: '', type: 'placeholder' });
          }

          if (j < rightLines.length) {
            right.push({ text: rightLines[j], type: 'added', lineNum: rightLineCounter++ });
          } else {
            right.push({ text: '', type: 'placeholder' });
          }
        }
        i += 2;
      } else {
        const lines = current.value.split('\n');
        if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

        for (const line of lines) {
          if (current.removed) {
            left.push({ text: line, type: 'removed', lineNum: leftLineCounter++ });
            right.push({ text: '', type: 'placeholder' });
          } else if (current.added) {
            left.push({ text: '', type: 'placeholder' });
            right.push({ text: line, type: 'added', lineNum: rightLineCounter++ });
          } else {
            left.push({ text: line, type: 'normal', lineNum: leftLineCounter++ });
            right.push({ text: line, type: 'normal', lineNum: rightLineCounter++ });
          }
        }
        i++;
      }
    }

    return { leftRows: left, rightRows: right };
  }, [oldValue, newValue]);

  const renderRow = (
    row: { text: string; type: 'removed' | 'added' | 'normal' | 'placeholder'; lineNum?: number },
    oppositeText?: string
  ) => {
    let backgroundColor = 'transparent';
    let textColor = 'var(--text-primary)';
    let opacity = 1;
    let decoration = 'none';

    if (row.type === 'removed') {
      backgroundColor = 'rgba(239, 68, 68, 0.08)'; // 8% opacity error-color for line background
      textColor = 'var(--error-color)';
    } else if (row.type === 'added') {
      backgroundColor = 'rgba(16, 185, 129, 0.08)'; // 8% opacity success-color for line background
      textColor = 'var(--success-color)';
    } else if (row.type === 'placeholder') {
      backgroundColor = 'var(--bg-color)';
      opacity = 0.25;
      decoration = 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.03) 5px, rgba(0,0,0,0.03) 10px)';
    }

    const renderContent = () => {
      if (row.type === 'placeholder') return '';
      if (!oppositeText) return row.text;

      // 如果有对比行，我们进一步对比字符差异以突出重点
      const oldStr = row.type === 'removed' ? row.text : oppositeText;
      const newStr = row.type === 'added' ? row.text : oppositeText;
      const charDiffs = diffChars(oldStr, newStr);

      return (
        <>
          {charDiffs.map((part, idx) => {
            if (row.type === 'removed') {
              if (part.added) return null;
              if (part.removed) {
                return (
                  <span
                    key={idx}
                    style={{
                      background: 'rgba(239, 68, 68, 0.22)', // 更深背景标示字符级删除
                      borderRadius: '2px',
                    }}
                  >
                    {part.value}
                  </span>
                );
              }
              return <span key={idx}>{part.value}</span>;
            }

            if (row.type === 'added') {
              if (part.removed) return null;
              if (part.added) {
                return (
                  <span
                    key={idx}
                    style={{
                      background: 'rgba(16, 185, 129, 0.22)', // 更深背景标示字符级新增
                      borderRadius: '2px',
                    }}
                  >
                    {part.value}
                  </span>
                );
              }
              return <span key={idx}>{part.value}</span>;
            }

            return null;
          })}
        </>
      );
    };

    return (
      <div
        style={{
          display: 'flex',
          fontSize: '0.85rem',
          fontFamily: 'monospace',
          lineHeight: '1.5rem',
          backgroundColor,
          backgroundImage: row.type === 'placeholder' ? decoration : 'none',
          minHeight: '1.5rem',
        }}
      >
        {/* 行号 */}
        <div
          style={{
            width: '40px',
            minWidth: '40px',
            textAlign: 'right',
            paddingRight: '0.75rem',
            color: 'var(--text-secondary)',
            userSelect: 'none',
            borderRight: '1px solid var(--border-color)',
            marginRight: '0.75rem',
            opacity: row.type === 'placeholder' ? 0 : 0.5,
          }}
        >
          {row.lineNum}
        </div>
        {/* 文本内容 */}
        <div
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            color: textColor,
            opacity: opacity,
            flex: 1,
            paddingRight: '0.5rem',
          }}
        >
          {renderContent()}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1px',
        background: 'var(--border-color)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        maxHeight: '400px',
        overflowY: 'auto',
      }}
    >
      {/* 左栏 (旧版本) */}
      <div style={{ background: 'var(--card-bg)', overflowX: 'auto' }}>
        <div
          style={{
            padding: '0.5rem 0.75rem',
            borderBottom: '1px solid var(--border-color)',
            fontWeight: '600',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            background: 'var(--bg-color)',
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        >
          {t('original') || 'Original'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {leftRows.map((row, idx) => {
            const rightRow = rightRows[idx];
            const isOppositeValid = rightRow?.type === 'added' && areRowsSimilar(row.text, rightRow.text);
            const opposite = isOppositeValid ? rightRow.text : undefined;
            return <React.Fragment key={idx}>{renderRow(row, opposite)}</React.Fragment>;
          })}
        </div>
      </div>

      {/* 右栏 (新版本) */}
      <div style={{ background: 'var(--card-bg)', overflowX: 'auto' }}>
        <div
          style={{
            padding: '0.5rem 0.75rem',
            borderBottom: '1px solid var(--border-color)',
            fontWeight: '600',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            background: 'var(--bg-color)',
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        >
          {t('modified') || 'Modified'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rightRows.map((row, idx) => {
            const leftRow = leftRows[idx];
            const isOppositeValid = leftRow?.type === 'removed' && areRowsSimilar(leftRow.text, row.text);
            const opposite = isOppositeValid ? leftRow.text : undefined;
            return <React.Fragment key={idx}>{renderRow(row, opposite)}</React.Fragment>;
          })}
        </div>
      </div>
    </div>
  );
};
