import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/api/hooks';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import type { CreatedApiKey } from '@/types';

const MCP_URL = `${window.location.origin}/mcp`;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard blocked (insecure context) — the text stays selectable
        }
      }}
      className="text-xs px-2 py-1 rounded bg-surface-light border border-border text-text-muted hover:text-text shrink-0"
    >
      {copied ? '✓' : label}
    </button>
  );
}

function Snippet({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <pre className="flex-1 text-[11px] leading-relaxed bg-surface-light border border-border rounded-md p-2 overflow-x-auto whitespace-pre text-text">
        {text}
      </pre>
      <CopyButton text={text} label="⧉" />
    </div>
  );
}

export default function McpKeys() {
  const { t } = useTranslation();
  const { data, isLoading } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [name, setName] = useState('');
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<number | null>(null);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = await createKey.mutateAsync({ name: trimmed });
    setCreated(key);
    setName('');
  };

  const cliCommand = created
    ? `claude mcp add --transport http pickme ${MCP_URL} \\\n  --header "Authorization: Bearer ${created.key}"`
    : '';

  const jsonConfig = created
    ? JSON.stringify(
        {
          mcpServers: {
            pickme: {
              type: 'http',
              url: MCP_URL,
              headers: { Authorization: `Bearer ${created.key}` },
            },
          },
        },
        null,
        2,
      )
    : '';

  return (
    <div>
      <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
        {t('mcp.title')}
      </h2>
      <p className="text-xs text-text-muted mb-3">{t('mcp.intro')}</p>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size={20} />
        </div>
      ) : (
        <>
          {data?.keys.length ? (
            <ul className="space-y-2 mb-3">
              {data.keys.map((key) => (
                <li
                  key={key.id}
                  className="flex items-center justify-between gap-2 bg-surface-light border border-border rounded-md px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text truncate">{key.name}</p>
                    <p className="text-[11px] text-text-muted font-mono truncate">
                      {key.keyPrefix}…
                    </p>
                    <p className="text-[11px] text-text-muted/70">
                      {key.lastUsedAt
                        ? t('mcp.lastUsed', { date: new Date(key.lastUsedAt).toLocaleDateString() })
                        : t('mcp.neverUsed')}
                    </p>
                  </div>
                  <button
                    onClick={() => setRevokeTarget(key.id)}
                    className="text-xs text-dislike hover:underline shrink-0"
                  >
                    {t('mcp.revoke')}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-text-muted/70 mb-3">{t('mcp.noKeys')}</p>
          )}

          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder={t('mcp.namePlaceholder')}
              maxLength={100}
              className="flex-1 px-3 py-2 text-sm bg-surface-light border border-border rounded-md text-text placeholder:text-text-muted/60"
            />
            <Button
              variant="secondary"
              onClick={handleCreate}
              disabled={!name.trim() || createKey.isPending}
            >
              {createKey.isPending ? <Spinner size={16} /> : t('mcp.generate')}
            </Button>
          </div>
          {createKey.isError && (
            <p className="text-xs text-dislike mt-2">{t('mcp.createFailed')}</p>
          )}
        </>
      )}

      {/* The key is readable exactly once, so the setup instructions live here
          with it already filled in */}
      <Modal open={created !== null} onClose={() => setCreated(null)} title={t('mcp.readyTitle')}>
        {created && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-text-muted mb-1">{t('mcp.keyOnce')}</p>
              <div className="flex items-start gap-2">
                <code className="flex-1 text-[11px] break-all bg-surface-light border border-accent/40 rounded-md p-2 text-accent">
                  {created.key}
                </code>
                <CopyButton text={created.key} label="⧉" />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-text mb-1">{t('mcp.stepCli')}</p>
              <Snippet text={cliCommand} />
            </div>

            <div>
              <p className="text-xs font-semibold text-text mb-1">{t('mcp.stepJson')}</p>
              <p className="text-[11px] text-text-muted mb-1">{t('mcp.stepJsonHint')}</p>
              <Snippet text={jsonConfig} />
            </div>

            <div>
              <p className="text-xs font-semibold text-text mb-1">{t('mcp.stepTry')}</p>
              <p className="text-[11px] text-text-muted italic">{t('mcp.tryExample')}</p>
            </div>

            <Button fullWidth onClick={() => setCreated(null)}>
              {t('mcp.done')}
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        title={t('mcp.revokeTitle')}
      >
        <p className="text-sm text-text-muted mb-4">{t('mcp.revokeConfirm')}</p>
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={() => setRevokeTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            fullWidth
            onClick={async () => {
              if (revokeTarget !== null) await revokeKey.mutateAsync(revokeTarget);
              setRevokeTarget(null);
            }}
          >
            {revokeKey.isPending ? <Spinner size={16} /> : t('mcp.revoke')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
