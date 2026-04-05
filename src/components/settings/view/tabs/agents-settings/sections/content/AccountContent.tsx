import { LogIn } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button } from '../../../../../../../shared/view/ui';
import SessionProviderLogo from '../../../../../../llm-logo-provider/SessionProviderLogo';
import type { AgentProvider, AuthStatus } from '../../../../../types/types';
import { api } from '../../../../../../../utils/api';

type AccountContentProps = {
  agent: AgentProvider;
  authStatus: AuthStatus;
  onLogin: () => void;
};

type AgentVisualConfig = {
  name: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  subtextClass: string;
  buttonClass: string;
  description?: string;
};

const agentConfig: Record<AgentProvider, AgentVisualConfig> = {
  claude: {
    name: 'Claude',
    bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    borderClass: 'border-blue-200 dark:border-blue-800',
    textClass: 'text-blue-900 dark:text-blue-100',
    subtextClass: 'text-blue-700 dark:text-blue-300',
    buttonClass: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
  },
  cursor: {
    name: 'Cursor',
    bgClass: 'bg-purple-50 dark:bg-purple-900/20',
    borderClass: 'border-purple-200 dark:border-purple-800',
    textClass: 'text-purple-900 dark:text-purple-100',
    subtextClass: 'text-purple-700 dark:text-purple-300',
    buttonClass: 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800',
  },
  codex: {
    name: 'Codex',
    bgClass: 'bg-muted/50',
    borderClass: 'border-gray-300 dark:border-gray-600',
    textClass: 'text-gray-900 dark:text-gray-100',
    subtextClass: 'text-gray-700 dark:text-gray-300',
    buttonClass: 'bg-gray-800 hover:bg-gray-900 active:bg-gray-950 dark:bg-gray-700 dark:hover:bg-gray-600 dark:active:bg-gray-500',
  },
  gemini: {
    name: 'Gemini',
    description: 'Google Gemini AI assistant',
    bgClass: 'bg-indigo-50 dark:bg-indigo-900/20',
    borderClass: 'border-indigo-200 dark:border-indigo-800',
    textClass: 'text-indigo-900 dark:text-indigo-100',
    subtextClass: 'text-indigo-700 dark:text-indigo-300',
    buttonClass: 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800',
  },
};

type CopilotModel = {
  id: string;
  name: string;
  owner: string;
};

export default function AccountContent({ agent, authStatus, onLogin }: AccountContentProps) {
  const { t } = useTranslation('settings');
  const config = agentConfig[agent];

  // Model selection state (Claude only)
  const [available_models, setAvailableModels] = useState<CopilotModel[]>([]);
  const [current_model, setCurrentModel] = useState('');
  const [current_small_model, setCurrentSmallModel] = useState('');
  const [models_loading, setModelsLoading] = useState(false);
  const [saving_model, setSavingModel] = useState(false);

  const FetchModels = useCallback(async () => {
    if (agent !== 'claude') return;
    setModelsLoading(true);
    try {
      const [models_res, settings_res] = await Promise.all([
        api.get('/settings/copilot-models'),
        api.get('/settings/claude-models'),
      ]);
      const models_data = await models_res.json();
      const settings_data = await settings_res.json();
      setAvailableModels(models_data.models || []);
      setCurrentModel(settings_data.model || '');
      setCurrentSmallModel(settings_data.smallModel || '');
    } catch (err) {
      console.error('Failed to fetch models:', err);
    } finally {
      setModelsLoading(false);
    }
  }, [agent]);

  useEffect(() => {
    FetchModels();
  }, [FetchModels]);

  const HandleModelChange = async (field: 'model' | 'smallModel', value: string) => {
    if (field === 'model') setCurrentModel(value);
    else setCurrentSmallModel(value);

    setSavingModel(true);
    try {
      await api.put('/settings/claude-models', {
        [field]: value,
      });
    } catch (err) {
      console.error('Failed to save model setting:', err);
    } finally {
      setSavingModel(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-4 flex items-center gap-3">
        <SessionProviderLogo provider={agent} className="h-6 w-6" />
        <div>
          <h3 className="text-lg font-medium text-foreground">{config.name}</h3>
          <p className="text-sm text-muted-foreground">{t(`agents.account.${agent}.description`)}</p>
        </div>
      </div>

      <div className={`${config.bgClass} border ${config.borderClass} rounded-lg p-4`}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className={`font-medium ${config.textClass}`}>
                {t('agents.connectionStatus')}
              </div>
              <div className={`text-sm ${config.subtextClass}`}>
                {authStatus.loading ? (
                  t('agents.authStatus.checkingAuth')
                ) : authStatus.authenticated ? (
                  t('agents.authStatus.loggedInAs', {
                    email: authStatus.email || t('agents.authStatus.authenticatedUser'),
                  })
                ) : (
                  t('agents.authStatus.notConnected')
                )}
              </div>
            </div>
            <div>
              {authStatus.loading ? (
                <Badge variant="secondary" className="bg-muted">
                  {t('agents.authStatus.checking')}
                </Badge>
              ) : authStatus.authenticated ? (
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  {t('agents.authStatus.connected')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                  {t('agents.authStatus.disconnected')}
                </Badge>
              )}
            </div>
          </div>

          {authStatus.method !== 'api_key' && (
            <div className="border-t border-border/50 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-medium ${config.textClass}`}>
                    {authStatus.authenticated ? t('agents.login.reAuthenticate') : t('agents.login.title')}
                  </div>
                  <div className={`text-sm ${config.subtextClass}`}>
                    {authStatus.authenticated
                      ? t('agents.login.reAuthDescription')
                      : t('agents.login.description', { agent: config.name })}
                  </div>
                </div>
                <Button
                  onClick={onLogin}
                  className={`${config.buttonClass} text-white`}
                  size="sm"
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  {authStatus.authenticated ? t('agents.login.reLoginButton') : t('agents.login.button')}
                </Button>
              </div>
            </div>
          )}

          {authStatus.error && (
            <div className="border-t border-border/50 pt-4">
              <div className="text-sm text-red-600 dark:text-red-400">
                {t('agents.error', { error: authStatus.error })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Model Selection (Claude only) */}
      {agent === 'claude' && (
        <div className="rounded-lg border border-border p-4">
          <div className="mb-4">
            <h4 className="text-sm font-medium text-foreground">
              {t('agents.models.title', { defaultValue: 'Model Configuration' })}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t('agents.models.description', { defaultValue: 'Select models from your copilot-api endpoint. Changes apply to new sessions.' })}
            </p>
          </div>

          {models_loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              <span>{t('agents.models.loading', { defaultValue: 'Loading models...' })}</span>
            </div>
          ) : available_models.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {t('agents.models.noModels', { defaultValue: 'No models available. Check your copilot-api configuration.' })}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Main Model */}
              <div>
                <label htmlFor="main-model" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t('agents.models.mainModel', { defaultValue: 'Main Model' })}
                  <span className="ml-1 text-xs text-muted-foreground">ANTHROPIC_MODEL</span>
                </label>
                <select
                  id="main-model"
                  value={current_model}
                  onChange={(e) => HandleModelChange('model', e.target.value)}
                  disabled={saving_model}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                >
                  <option value="">{t('agents.models.default', { defaultValue: '-- Default --' })}</option>
                  {available_models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.owner ? `(${m.owner})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Small/Fast Model */}
              <div>
                <label htmlFor="small-model" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t('agents.models.smallModel', { defaultValue: 'Lightweight Model' })}
                  <span className="ml-1 text-xs text-muted-foreground">ANTHROPIC_SMALL_FAST_MODEL</span>
                </label>
                <select
                  id="small-model"
                  value={current_small_model}
                  onChange={(e) => HandleModelChange('smallModel', e.target.value)}
                  disabled={saving_model}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                >
                  <option value="">{t('agents.models.default', { defaultValue: '-- Default --' })}</option>
                  {available_models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.owner ? `(${m.owner})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {saving_model && (
                <div className="text-xs text-muted-foreground">
                  {t('agents.models.saving', { defaultValue: 'Saving...' })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
