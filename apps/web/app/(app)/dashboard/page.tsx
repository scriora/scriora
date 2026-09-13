'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { type ApiEnvelope, apiClient, getApiErrorMessage } from '../../../lib/api-client';

type User = { id: string; email: string; name: string };
type Workspace = {
  id: string;
  name: string;
  role: string;
  defaultOperatingMode: string;
  requiresApproval: boolean;
};
type SocialAccount = { id: string; platform: string; accountName: string; status: string };
type Publication = {
  id: string;
  status: string;
  createdAt: string;
  socialAccount: { platform: string; accountName: string };
  contentVariant: { content: { body: string } };
};

const SESSION_KEY = 'scriora.web.session';
const authHeaders = (token: string, workspaceId?: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
  ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
});

export default function DashboardPage() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const workspace = workspaces.find((item) => item.id === workspaceId);
  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.status === 'ACTIVE'),
    [accounts]
  );

  const loadWorkspace = useCallback(async (accessToken: string, id: string) => {
    if (!id) return;
    const headers = authHeaders(accessToken, id);
    const [accountResult, publicationResult] = await Promise.all([
      apiClient<ApiEnvelope<SocialAccount[]>>('/v1/social-accounts', { headers }),
      apiClient<ApiEnvelope<Publication[]>>('/v1/posts?limit=8', { headers }),
    ]);
    setAccounts(accountResult.data);
    setPublications(publicationResult.data);
    setSelectedAccounts((current) =>
      current.filter((accountId) => accountResult.data.some(({ id }) => id === accountId))
    );
  }, []);

  const openSession = useCallback(
    async (accessToken: string, sessionUser: User, preferredWorkspaceId?: string) => {
      setBusy(true);
      setMessage(null);
      try {
        const result = await apiClient<ApiEnvelope<Workspace[]>>('/v1/workspaces', {
          headers: authHeaders(accessToken),
        });
        const nextId =
          result.data.find(({ id }) => id === preferredWorkspaceId)?.id ?? result.data[0]?.id ?? '';
        setToken(accessToken);
        setUser(sessionUser);
        setWorkspaces(result.data);
        setWorkspaceId(nextId);
        if (nextId) await loadWorkspace(accessToken, nextId);
      } catch (error) {
        sessionStorage.removeItem(SESSION_KEY);
        setToken('');
        setUser(null);
        setMessage({
          kind: 'error',
          text: getApiErrorMessage(error, 'Your session could not be restored. Sign in again.'),
        });
      } finally {
        setBusy(false);
      }
    },
    [loadWorkspace]
  );

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return;
    try {
      const session = JSON.parse(saved) as { token: string; user: User; workspaceId?: string };
      void openSession(session.token, session.user, session.workspaceId);
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [openSession]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const result = await apiClient<ApiEnvelope<{ accessToken: string; user: User }>>(
        '/v1/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
        }
      );
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ token: result.data.accessToken, user: result.data.user })
      );
      await openSession(result.data.accessToken, result.data.user);
    } catch (error) {
      setMessage({
        kind: 'error',
        text: getApiErrorMessage(error, 'Sign in failed. Check your credentials and API URL.'),
      });
      setBusy(false);
    }
  }

  async function changeWorkspace(id: string) {
    setWorkspaceId(id);
    setBusy(true);
    setMessage(null);
    try {
      await loadWorkspace(token, id);
      if (user)
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, user, workspaceId: id }));
    } catch (error) {
      setMessage({
        kind: 'error',
        text: getApiErrorMessage(error, 'Workspace data failed to load.'),
      });
    } finally {
      setBusy(false);
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !body.trim() || selectedAccounts.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const targets = selectedAccounts.map((id) => ({
        socialAccountId: id,
        platform: accounts.find((account) => account.id === id)?.platform,
      }));
      const result = await apiClient<ApiEnvelope<{ message: string }>>('/v1/posts', {
        method: 'POST',
        headers: { ...authHeaders(token, workspaceId), 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          body: body.trim(),
          targets,
          ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
        }),
      });
      setMessage({ kind: 'success', text: result.data.message || 'Publication accepted.' });
      setBody('');
      setScheduledAt('');
      await loadWorkspace(token, workspaceId);
    } catch (error) {
      setMessage({
        kind: 'error',
        text: getApiErrorMessage(error, 'The publication could not be created.'),
      });
    } finally {
      setBusy(false);
    }
  }

  function toggleAccount(id: string) {
    setSelectedAccounts((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function signOut() {
    sessionStorage.removeItem(SESSION_KEY);
    setToken('');
    setUser(null);
    setWorkspaces([]);
    setWorkspaceId('');
    setAccounts([]);
    setPublications([]);
    setMessage(null);
  }

  if (!user) {
    return (
      <main className="shell login-shell">
        <section className="login-story" aria-labelledby="login-title">
          <p className="eyebrow">Scriora / operations</p>
          <h1 id="login-title">One dispatch desk. Every channel.</h1>
          <p className="lede">
            Move from draft to verified delivery without losing the human line.
          </p>
          <div className="route-map">
            {['Draft', 'Approval', 'Dispatch', 'Verify'].map((step, index) => (
              <div className="route-stop" key={step}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="login-panel" aria-label="Sign in">
          <div>
            <p className="utility-label">Secure workspace access</p>
            <h2>Enter the control room</h2>
          </div>
          <form onSubmit={signIn} className="stack">
            <label>
              Work email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            {message ? <p className={`message ${message.kind}`}>{message.text}</p> : null}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Opening workspace…' : 'Sign in'}
            </button>
          </form>
          <p className="fine-print">The access token stays in this browser session.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Scriora / dispatch desk</p>
          <h1>Control room</h1>
        </div>
        <div className="session-controls">
          <label className="workspace-picker">
            Workspace
            <select
              value={workspaceId}
              onChange={(event) => void changeWorkspace(event.target.value)}
              disabled={busy}
            >
              {workspaces.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="identity">
            <span>{user.name}</span>
            <small>{user.email}</small>
          </div>
          <button type="button" className="quiet-button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <section className="status-rail" aria-label="Workspace status">
        <div>
          <span>Mode</span>
          <strong>{workspace?.defaultOperatingMode ?? '—'}</strong>
        </div>
        <div>
          <span>Approval gate</span>
          <strong>{workspace?.requiresApproval ? 'Required' : 'Direct'}</strong>
        </div>
        <div>
          <span>Live destinations</span>
          <strong>{activeAccounts.length}</strong>
        </div>
        <div>
          <span>Recent queue</span>
          <strong>{publications.length}</strong>
        </div>
      </section>

      {workspaces.length === 0 ? (
        <section className="empty-state">
          <p className="utility-label">No workspace</p>
          <h2>Create a workspace through the API or CLI to begin.</h2>
        </section>
      ) : (
        <div className="workspace-grid">
          <section className="composer" aria-labelledby="composer-title">
            <div className="section-heading">
              <div>
                <p className="utility-label">New dispatch</p>
                <h2 id="composer-title">Compose once</h2>
              </div>
              <span>{body.length} / 10,000</span>
            </div>
            <form onSubmit={publish} className="stack">
              <label>
                Message
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={10000}
                  rows={8}
                  placeholder="Write the source message for this dispatch…"
                  required
                />
              </label>
              <fieldset>
                <legend>Destinations</legend>
                {activeAccounts.length ? (
                  <div className="account-grid">
                    {activeAccounts.map((account) => (
                      <label className="account-card" key={account.id}>
                        <input
                          type="checkbox"
                          checked={selectedAccounts.includes(account.id)}
                          onChange={() => toggleAccount(account.id)}
                        />
                        <span className="platform-mark">{account.platform.slice(0, 2)}</span>
                        <span>
                          <strong>{account.accountName}</strong>
                          <small>{account.platform}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="inline-empty">Connect a social account before dispatching.</p>
                )}
              </fieldset>
              <div className="dispatch-row">
                <label>
                  Schedule (optional)
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                  />
                </label>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={busy || !body.trim() || !selectedAccounts.length}
                >
                  {busy ? 'Dispatching…' : scheduledAt ? 'Schedule dispatch' : 'Publish now'}
                </button>
              </div>
              {message ? <p className={`message ${message.kind}`}>{message.text}</p> : null}
            </form>
          </section>

          <aside className="queue" aria-labelledby="queue-title">
            <div className="section-heading">
              <div>
                <p className="utility-label">Delivery ledger</p>
                <h2 id="queue-title">Recent queue</h2>
              </div>
              <span className={`live-dot${busy ? ' is-busy' : ''}`}>
                {busy ? 'Syncing' : 'Live'}
              </span>
            </div>
            {publications.length ? (
              <ol className="publication-list">
                {publications.map((publication) => (
                  <li key={publication.id}>
                    <div className="publication-line">
                      <span className="platform-mark">
                        {publication.socialAccount.platform.slice(0, 2)}
                      </span>
                      <div>
                        <strong>{publication.socialAccount.accountName}</strong>
                        <p>{publication.contentVariant.content.body}</p>
                      </div>
                    </div>
                    <div className="publication-meta">
                      <span className="status">{publication.status.replaceAll('_', ' ')}</span>
                      <time dateTime={publication.createdAt}>
                        {new Date(publication.createdAt).toLocaleString()}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="inline-empty queue-empty">
                <span>00</span>
                <p>Your first dispatch will appear here with its delivery status.</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
