import { Check } from 'lucide-react';
import { parseNote, type Run } from '../../lib/noteFormat';

function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, idx) => {
        let node: React.ReactNode = r.text;
        if (r.b) node = <strong>{node}</strong>;
        if (r.i) node = <em>{node}</em>;
        if (r.u) node = <u>{node}</u>;
        return <span key={idx}>{node}</span>;
      })}
    </>
  );
}

// Corpo da anotação já formatado. Sem HTML: só elementos React montados dos
// blocos — nada do que a equipe digita é executado.
export function NoteBody({
  content,
  onToggleCheck,
  textColor,
}: {
  content: string;
  onToggleCheck: (line: number) => void;
  textColor: string;
}) {
  if (!content.trim()) return <p className="opacity-60 italic text-sm">Anotação vazia — toque no lápis para escrever.</p>;
  return (
    <div className="text-sm leading-snug flex flex-col gap-1 break-words" style={{ overflowWrap: 'anywhere' }}>
      {parseNote(content).map((b) => {
        if (b.kind === 'blank') return <div key={b.line} className="h-2" />;
        if (b.kind === 'bullet')
          return (
            <div key={b.line} className="flex gap-2 pl-1">
              <span aria-hidden className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: textColor }} />
              <span>
                <Runs runs={b.runs} />
              </span>
            </div>
          );
        if (b.kind === 'check')
          return (
            <label key={b.line} className="flex items-start gap-2 pl-0.5 cursor-pointer select-none">
              <button
                type="button"
                role="checkbox"
                aria-checked={b.checked}
                onClick={() => onToggleCheck(b.line)}
                className="mt-[2px] w-4 h-4 rounded-[5px] border-[1.5px] shrink-0 flex items-center justify-center"
                style={{ borderColor: textColor, backgroundColor: b.checked ? textColor : 'transparent' }}
              >
                {b.checked && <Check size={11} strokeWidth={3} style={{ color: 'var(--note-bg)' }} />}
              </button>
              <span className={b.checked ? 'line-through opacity-55' : ''}>
                <Runs runs={b.runs} />
              </span>
            </label>
          );
        return (
          <p key={b.line}>
            <Runs runs={b.runs} />
          </p>
        );
      })}
    </div>
  );
}
