import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  message: string;
  hint?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, message, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && <div className="mb-4 text-text-muted">{icon}</div>}
      <p className="text-base font-medium text-text mb-1">{message}</p>
      {hint && <p className="text-sm text-text-muted mb-4">{hint}</p>}
      {action}
    </div>
  );
}
