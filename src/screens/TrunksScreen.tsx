import { useCallback, useEffect, useState } from 'react';
import type { AdminApi } from '../api/AdminApi';
import { isConflict } from '../api/errors';
import type { DtmfMode, Role, Trunk } from '../api/types';
import { DTMF_MODES, TRUNK_EXPIRES_MAX, TRUNK_EXPIRES_MIN } from '../api/types';
import { can } from '../auth/roles';
import { AttributesField } from '../components/AttributesField';
import { ConfirmModal, FormModal } from '../components/Modal';
import { Empty, ErrorMessage, Loading } from '../components/Status';
import { useEventRefresh } from '../hooks/useEvents';
import { useRefreshableAsync } from '../hooks/useRefreshableAsync';
import { useSubmit } from '../hooks/useSubmit';
import {
  DTMF_TEXT,
  describeFocusRealms,
  describeRegistration,
  focusOf,
  trunkForm,
  trunkWrite,
  type TrunkForm,
} from '../trunks/trunk';

/** Without the event stream, how often the list is read again so registration stays current. */
export const TRUNK_POLL_MS = 10_000;

/**
 * Adding or changing one trunk. The name is fixed once the trunk exists: the
 * node files everything under it.
 *
 * The conference focus and key press fields are keys of the same attributes
 * object as the JSON below them. The JSON holds every other key, and the
 * fields are written into it on save, so the node is always sent the whole
 * object it will keep.
 */
function TrunkDialogue({ api, trunk, onClose, onSaved }: {
  api: AdminApi;
  /** The trunk being changed; absent when adding one. */
  trunk?: Trunk;
  onClose: () => void;
  onSaved: () => void;
}) {
  const creating = !trunk;
  const [form, setForm] = useState<TrunkForm>(() => trunkForm(trunk));
  const [problem, setProblem] = useState<string>();
  const { busy, error, failure, clearError, run } = useSubmit();
  const taken = creating && isConflict(failure);

  const set = <K extends keyof TrunkForm>(key: K, value: TrunkForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setProblem(undefined);
    if (key === 'name' && taken) clearError();
  };

  const submit = () => {
    const result = trunkWrite(form, creating);
    if ('problem' in result) {
      setProblem(result.problem);
      return;
    }
    const { write } = result;
    void run(() => (trunk
      ? api.updateTrunk(trunk.name, write)
      : api.createTrunk({ ...write, name: form.name.trim(), uri: form.uri.trim() }))).then((saved) => {
      if (!saved) return;
      onSaved();
      onClose();
    });
  };

  return (
    <FormModal
      open
      title={trunk ? `Change ${trunk.name}` : 'Add a trunk'}
      submitLabel={trunk ? 'Save trunk' : 'Add trunk'}
      busy={busy}
      submitDisabled={(creating && !form.name.trim()) || !form.uri.trim()}
      error={problem ?? (taken ? undefined : error)}
      onSubmit={submit}
      onCancel={() => { clearError(); onClose(); }}
    >
      {creating && (
        <>
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              value={form.name}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={taken || undefined}
              onChange={(event) => set('name', event.target.value)}
            />
            {taken && <span className="field-error" role="alert">There is already a trunk called {form.name.trim()}. Names ignore case.</span>}
          </label>
          <p className="field-hint">
            Letters, digits, dots, dashes and underscores, up to 64. Scripts and call records name the
            trunk by it, and it cannot be changed later.
          </p>
        </>
      )}
      <label className="field">
        <span>URI</span>
        <input type="text" value={form.uri} disabled={busy} spellCheck={false} placeholder="sip:sip.carrier.example;transport=tls" onChange={(event) => set('uri', event.target.value)} />
      </label>
      <p className="field-hint">Where calls and the REGISTER go, a sip: or sips: URI. The node locates it as any SIP address (RFC 3263).</p>
      <label className="field">
        <span>Outbound proxy</span>
        <input type="text" value={form.proxy} disabled={busy} spellCheck={false} placeholder="None" onChange={(event) => set('proxy', event.target.value)} />
      </label>
      <p className="field-hint">Where calls and the REGISTER are sent instead, if the carrier asks for one. Empty sends them where the URI says.</p>
      <label className="field">
        <span>Username</span>
        <input type="text" value={form.username} disabled={busy} autoComplete="off" spellCheck={false} onChange={(event) => set('username', event.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          value={form.password}
          disabled={busy}
          autoComplete="new-password"
          placeholder={trunk?.password_set ? 'Leave empty to keep the current one' : undefined}
          onChange={(event) => set('password', event.target.value)}
        />
      </label>
      <p className="field-hint">
        For the carrier&apos;s challenges. The node keeps it as given, since it has to answer with it,
        and never shows it again.{trunk && (trunk.password_set ? ' Leave it empty to keep the current one.' : ' None is held now.')}
      </p>

      <fieldset className="policy-fieldset">
        <legend>Registration</legend>
        <label className="checkbox-field">
          <input type="checkbox" checked={form.registerEnabled} disabled={busy} onChange={(event) => set('registerEnabled', event.target.checked)} />
          <span>Register to the trunk</span>
        </label>
        <p className="field-hint">For a carrier that sends calls to wherever it last heard a REGISTER from. A node registers on the cluster&apos;s behalf.</p>
        <label className="field">
          <span>Registration lasts (seconds)</span>
          <input
            type="number"
            min={TRUNK_EXPIRES_MIN}
            max={TRUNK_EXPIRES_MAX}
            value={form.expires}
            disabled={busy}
            placeholder="Server default"
            onChange={(event) => set('expires', event.target.value)}
          />
        </label>
        <label className="field">
          <span>Contact user</span>
          <input type="text" value={form.contactUser} disabled={busy} spellCheck={false} onChange={(event) => set('contactUser', event.target.value)} />
        </label>
        <p className="field-hint">The user part of the Contact registered, which the carrier sends its calls to. Often the username.</p>
      </fieldset>

      <label className="field">
        <span>Inbound addresses</span>
        <textarea value={form.inbound} rows={3} disabled={busy} spellCheck={false} placeholder="203.0.113.0/24" onChange={(event) => set('inbound', event.target.value)} />
      </label>
      <p className="field-hint">Addresses or CIDR ranges a call from the trunk comes from, one per line or comma separated. A request from one of them is the trunk&apos;s.</p>
      <label className="field">
        <span>TLS CA file</span>
        <input type="text" value={form.tlsCa} disabled={busy} spellCheck={false} placeholder="The system's store" onChange={(event) => set('tlsCa', event.target.value)} />
      </label>

      <fieldset className="policy-fieldset">
        <legend>Conference focus</legend>
        <label className="checkbox-field">
          <input type="checkbox" checked={form.focusEnabled} disabled={busy} onChange={(event) => set('focusEnabled', event.target.checked)} />
          <span>This trunk is a conference focus</span>
        </label>
        <p className="field-hint">
          A conference server such as FreeSWITCH. A call to a URI whose user part starts with the
          prefix, in one of the realms, goes to it as a room. Saved as <code>focus</code> in the
          attributes.
        </p>
        {form.focusEnabled && (
          <>
            <label className="field">
              <span>Room prefix</span>
              <input type="text" value={form.focusPrefix} disabled={busy} spellCheck={false} placeholder="conf-" onChange={(event) => set('focusPrefix', event.target.value)} />
            </label>
            <p className="field-hint">A numeric prefix such as 8 suits phones that cannot dial letters.</p>
            <label className="field">
              <span>Realms</span>
              <input type="text" value={form.focusRealms} disabled={busy} spellCheck={false} placeholder="Every realm" onChange={(event) => set('focusRealms', event.target.value)} />
            </label>
            <p className="field-hint">Comma separated. Empty serves every realm.</p>
            <label className="field">
              <span>Conference profile</span>
              <input type="text" value={form.focusProfile} disabled={busy} spellCheck={false} placeholder="None" onChange={(event) => set('focusProfile', event.target.value)} />
            </label>
            <p className="field-hint">Passed through to the focus, which decides what it means.</p>
          </>
        )}
      </fieldset>

      <label className="field">
        <span>Key presses</span>
        <select value={form.dtmf} disabled={busy} onChange={(event) => set('dtmf', event.target.value as DtmfMode | '')}>
          <option value="">Not set</option>
          {DTMF_MODES.map((mode) => <option key={mode} value={mode}>{DTMF_TEXT[mode]}</option>)}
        </select>
      </label>
      <p className="field-hint">How the carrier sends key presses, saved as <code>dtmf</code> in the attributes. Not set leaves it to the scripts, which take automatic.</p>

      <AttributesField
        value={form.attributes}
        busy={busy}
        onChange={(text) => set('attributes', text)}
        hint={<>
          What the standard scripts read: <code>prefixes</code>, <code>numbers</code>, <code>codes</code>,{' '}
          <code>caller_id</code> and the rest in the server&apos;s scripting guide. The focus and key
          presses above are added to these on save.
        </>}
      />
    </FormModal>
  );
}

function TrunkRow({ api, trunk, now, onChanged }: { api: AdminApi; trunk: Trunk; now: number; onChanged: () => void }) {
  const [dialogue, setDialogue] = useState<'change' | 'password' | 'delete'>();
  const { busy, error, clearError, run } = useSubmit();
  const close = () => { clearError(); setDialogue(undefined); };
  const act = (action: () => Promise<unknown>) => {
    void run(action).then((done) => {
      if (!done) return;
      onChanged();
      close();
    });
  };

  const registration = describeRegistration(trunk, now);
  const focus = focusOf(trunk.attributes);
  const inbound = trunk.inbound_addresses ?? [];

  return (
    <li className="record-row">
      <div className="record-main" role="group" aria-label={trunk.name}>
        <span className="record-name">
          {registration.tone !== 'idle' && <span className={`state-dot state-${registration.tone}`} aria-hidden="true" />}
          {trunk.name}
        </span>
        <span className="record-detail"><code>{trunk.uri}</code></span>
        {trunk.proxy && <span className="record-detail">By <code>{trunk.proxy}</code></span>}
        <span className="record-detail">
          {inbound.length > 0 ? <>From <code>{inbound.join(', ')}</code></> : 'No inbound addresses'}
        </span>
        <span className="record-detail">{trunk.password_set ? 'Password held' : 'No password'}</span>
        {focus && (
          <span className="record-detail">
            Rooms: <code>{focus.prefix}...</code> in {describeFocusRealms(focus)}
            {focus.profile && <>, profile {focus.profile}</>}
          </span>
        )}
        {registration.detail && <span className="record-detail">{registration.detail}</span>}
      </div>
      {focus && <span className="record-tag">Conference focus</span>}
      <span className={`record-tag${registration.tone === 'idle' ? '' : ` state-tag-${registration.tone}`}`}>{registration.label}</span>
      <div className="record-actions">
        <button className="secondary-button" type="button" aria-label={`Change ${trunk.name}`} onClick={() => setDialogue('change')}>
          Change
        </button>
        {trunk.password_set && (
          <button className="secondary-button" type="button" aria-label={`Remove the password of ${trunk.name}`} onClick={() => setDialogue('password')}>
            Remove password
          </button>
        )}
        <button className="secondary-button danger-button" type="button" aria-label={`Remove ${trunk.name}`} onClick={() => setDialogue('delete')}>
          Remove
        </button>
      </div>

      {/* Mounted only while open, so it starts from the trunk as last read. */}
      {dialogue === 'change' && <TrunkDialogue api={api} trunk={trunk} onClose={close} onSaved={onChanged} />}

      <ConfirmModal
        open={dialogue === 'password'}
        title={`Remove the password of ${trunk.name}?`}
        confirmLabel="Remove password"
        busy={busy}
        onCancel={close}
        onConfirm={() => act(() => api.updateTrunk(trunk.name, { password: '' }))}
      >
        <p>
          The node will answer {trunk.name}&apos;s challenges with no password, which a carrier that
          asks for one refuses. Set a new one with Change.
        </p>
        {error && <p className="error-message" role="alert">{error}</p>}
      </ConfirmModal>

      <ConfirmModal
        open={dialogue === 'delete'}
        title={`Remove ${trunk.name}?`}
        confirmLabel="Remove trunk"
        destructive
        busy={busy}
        onCancel={close}
        onConfirm={() => act(() => api.deleteTrunk(trunk.name))}
      >
        <p>
          <strong>{trunk.name}</strong> will be removed, and calls routed by it stop: nothing goes out
          by it, calls from its addresses are no longer taken as its
          {focus ? <>, and its rooms (<code>{focus.prefix}...</code>) can no longer be dialled</> : null}.
          {trunk.register?.enabled ? ' The node stops registering to it.' : ''} This cannot be undone.
        </p>
        {error && <p className="error-message" role="alert">{error}</p>}
      </ConfirmModal>
    </li>
  );
}

/**
 * The trunks, from `/trunks`: the SIP peers calls go out by and come in from,
 * a carrier or a conference focus.
 *
 * Registration is reported by the node doing it, so the list follows the
 * event stream when the user may read it and is read again every
 * `TRUNK_POLL_MS` when not.
 */
export function TrunksScreen({ api, roles }: { api: AdminApi; roles: readonly Role[] }) {
  const result = useRefreshableAsync((signal) => api.listTrunks(signal), [api]);
  const { refresh } = result;
  const onChanged = useCallback(() => refresh(), [refresh]);
  const [adding, setAdding] = useState(false);

  const live = useEventRefresh(api, ['trunks'], refresh, can(roles, 'view-cluster-status'));
  useEffect(() => {
    if (live) return undefined;
    const timer = window.setInterval(refresh, TRUNK_POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, refresh]);

  const now = Math.floor(Date.now() / 1000);

  return (
    <>
      <h1>Trunks</h1>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Trunks</h2>
            <p>
              A trunk is a SIP peer the cluster sends calls to and takes calls from: a carrier that
              brings numbers in and takes them out, or a conference focus that holds rooms. What
              the routing scripts do with one comes from its attributes. A trunk&apos;s password is
              sent here and never shown again.
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={refresh} disabled={result.refreshing}>
            {result.refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <p className="field-hint">
          A conference room exists when someone dials a URI that starts with a focus&apos;s prefix and
          the focus accepts the call; there is no creating rooms here. Rooms are routed only by a node
          running the standard Lua scripts (<code>lua://</code>); <code>builtin://</code> does not route
          them.
        </p>

        {result.error && <ErrorMessage error={result.error} />}

        {result.loading ? <Loading /> : !result.value ? null : (
          <>
            <div className="panel-actions">
              <button className="primary-button" type="button" onClick={() => setAdding(true)}>Add a trunk</button>
            </div>
            {adding && <TrunkDialogue api={api} onClose={() => setAdding(false)} onSaved={onChanged} />}
            {result.value.length === 0 ? (
              <Empty>There are no trunks. Calls stay within the cluster&apos;s realms until one is added.</Empty>
            ) : (
              <ul className="record-list">
                {result.value.map((trunk) => <TrunkRow key={trunk.name} api={api} trunk={trunk} now={now} onChanged={onChanged} />)}
              </ul>
            )}
          </>
        )}
      </section>
    </>
  );
}
