/** Four goal rings (FR-13). Each ring has its goal's icon and a percentage, so colour is never the only cue. */
import { GOAL_KEYS, type GoalKey } from '@fastlane/content/keys';
import type { GoalValues } from '@fastlane/engine';
import { useTranslation } from 'react-i18next';
import { percent } from '../../i18n/format.ts';

export const GOAL_ICON: Record<GoalKey, string> = {
  wealth: '$',
  wellbeing: '♥',
  skills: '🎓',
  career: '💼',
};
const GOAL_COLOUR: Record<GoalKey, string> = {
  wealth: 'var(--color-teal)',
  wellbeing: 'var(--color-coral)',
  skills: 'var(--color-lilac)',
  career: 'var(--color-mustard)',
};

export function Ring({
  bp,
  colour,
  size = 44,
  children,
  label,
}: {
  bp: number;
  colour: string;
  size?: number;
  children?: React.ReactNode;
  label: string;
}) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, bp / 10_000));
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={6}
          className="stroke-ink/15 dark:stroke-cream/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${c * filled} ${c}`}
          className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-700"
        />
      </svg>
      <span className="absolute text-sm leading-none" aria-hidden="true">
        {children}
      </span>
    </span>
  );
}

export function GoalRings({ progress, size = 44 }: { progress: GoalValues; size?: number }) {
  const { t } = useTranslation();
  return (
    <span className="flex gap-1.5">
      {GOAL_KEYS.map((g) => (
        <span key={g} className="flex flex-col items-center">
          <Ring
            bp={progress[g]}
            colour={GOAL_COLOUR[g]}
            size={size}
            label={`${t(`goal.${g}`)} ${percent(progress[g])}`}
          >
            {GOAL_ICON[g]}
          </Ring>
          <span className="tabular text-[11px] text-fg-muted" aria-hidden="true">
            {percent(progress[g])}
          </span>
        </span>
      ))}
    </span>
  );
}
