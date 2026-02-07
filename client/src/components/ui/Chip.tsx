interface ChipProps {
  label: string;
  emoji?: string;
  selected?: boolean;
  onClick?: () => void;
}

export default function Chip({ label, emoji, selected = false, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all
        ${
          selected
            ? 'bg-accent/15 text-accent border border-accent'
            : 'bg-surface-light text-text-muted border border-border hover:border-text-muted'
        }`}
    >
      {emoji && <span className="text-base">{emoji}</span>}
      {label}
    </button>
  );
}
