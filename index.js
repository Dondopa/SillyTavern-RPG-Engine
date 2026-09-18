import { campaignKey, createContextBridge } from './llm-context.mjs';

const API = '/api/plugins/st-rpg-engine';
let state = null;

const C = () => SillyTavern.getContext();

const key = () => campaignKey(C());
let pendingActions = Promise.resolve();

const contextBridge = createContextBridge({
    getContext: C,
    readState: async campaign => (await api('/state?campaign=' + encodeURIComponent(campaign), {
        signal: AbortSignal.timeout(10000),
    })).state,
    waitForActions: () => pendingActions,
    onState: next => {
        state = next;
        $('#rpg-server-status').text('SQLite connected');
        render();
    },
    onStatus: (status, prompt) => {
        $('#rpg-context-status').text(status);
        $('#rpg-context-preview').text(prompt || 'A fresh snapshot is fetched before each generation.');
    },
    onError: error => {
        $('#rpg-server-status').text('RPG state unavailable');
        console.error('[RPG Engine] Context unavailable', error);
        toastr.error('RPG state could not be loaded. Generation stopped to avoid stale stats. Check the server plugin, then retry.');
    },
});

// Registered immediately, before asynchronous panel loading. SillyTavern awaits this hook.
globalThis.stRpgEngineInjectContext = contextBridge.inject;

async function api(p, o = {}) {
    const r = await fetch(API + p, {
        ...o,
        headers: {
            ...C().getRequestHeaders(),
            ...(o.headers || {}),
        },
    });

    const d = await r.json().catch(() => ({}));

    if (!r.ok) {
        throw Error(d.error || r.status);
    }

    return d;
}

const esc = (s) =>
    String(s ?? '').replace(
        /[&<>"']/g,
        (c) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[c],
    );

function render() {
    if (!state) return;

    $('#rpg-char-name').text(state.name);

    $('#rpg-resources').html(
        ['hp', 'mp', 'stamina']
            .map(
                (k) => `
        <div class="rpg-resource">
            <div class="rpg-row">
                <b>${k.toUpperCase()}</b>
                <span>${state[k].current} / ${state[k].max}</span>
            </div>

            <div class="rpg-meter">
                <i style="width:${
                    (state[k].current / state[k].max) * 100
                }%"></i>
            </div>

            <div class="rpg-buttons">
                ${[-10, -1, 1, 10]
                    .map(
                        (n) => `
                    <button
                        class="menu_button rpg-r"
                        data-k="${k}"
                        data-n="${n}"
                    >
                        ${n > 0 ? '+' : ''}${n}
                    </button>
                `,
                    )
                    .join('')}
            </div>
        </div>
    `,
            )
            .join(''),
    );

    $('.rpg-r').on('click', function () {
        act('resource_delta', {
            resource: $(this).data('k'),
            delta: Number($(this).data('n')),
        });
    });

    $('#rpg-conditions').html(
        state.conditions.length
            ? state.conditions
                  .map(
                      (x) =>
                          `<span class="rpg-chip">${esc(x.name)}${
                              x.turns != null ? ' (' + x.turns + ')' : ''
                          }</span>`,
                  )
                  .join('')
            : '<span class="rpg-muted">None</span>',
    );

    $('#rpg-inventory').html(
        state.inventory.length
            ? state.inventory
                  .map(
                      (x) =>
                          `<div class="rpg-row">
                              <span>${esc(x.name)}</span>
                              <b>×${x.qty}</b>
                          </div>`,
                  )
                  .join('')
            : '<span class="rpg-muted">Empty</span>',
    );

    $('#rpg-history').html(
        state.history.length
            ? state.history
                  .slice(0, 20)
                  .map(
                      (x) =>
                          `<div class="rpg-history">
                              <b>${esc(x.type)}</b> ${esc(x.detail)}
                          </div>`,
                  )
                  .join('')
            : '<span class="rpg-muted">No events yet</span>',
    );
}

async function load() {
    const campaign = key();
    try {
        const result = await api('/state?campaign=' + encodeURIComponent(campaign), {
            signal: AbortSignal.timeout(10000),
        });
        if (campaign !== key()) return;
        state = result.state;
        $('#rpg-server-status').text('SQLite connected');
        render();
    } catch (e) {
        if (campaign !== key()) return;
        $('#rpg-server-status').text('Server plugin offline');
        console.error('[RPG Engine]', e);
    }
}

async function act(action, payload = {}) {
    const campaign = key();
    contextBridge.clear();
    const operation = pendingActions.then(async () => {
        const result = await api('/action', {
            method: 'POST',
            signal: AbortSignal.timeout(10000),
            body: JSON.stringify({ campaign, action, payload }),
        });
        if (campaign === key()) {
            state = result.state;
            render();
        }
    });
    pendingActions = operation.catch(error => {
        console.error('[RPG Engine] Action failed', error);
        toastr.error('The RPG change could not be saved. Refresh the panel and try again.');
    });
    await pendingActions;
}

async function init() {
    if ($('#rpg-engine-panel').length) return;

    const panelUrl = new URL('./panel.html', import.meta.url).href;
    $('body').append(await $.get(panelUrl));

    $('#rpg-engine-fab').on('click', () => {
        $('#rpg-engine-panel').addClass('open');
        load();
    });

    $('#rpg-close').on('click', () =>
        $('#rpg-engine-panel').removeClass('open'),
    );

    $('#rpg-refresh').on('click', load);

    C().eventSource.on(C().eventTypes.CHAT_CHANGED, () => {
        contextBridge.clear();
        state = null;
        $('#rpg-char-name').text('Loading…');
        $('#rpg-resources, #rpg-conditions, #rpg-inventory, #rpg-history').empty();
        load();
    });
    contextBridge.clear();

    $('#rpg-next-turn').on('click', () => act('next_turn'));

    $('#rpg-reset').on('click', () => {
        if (confirm('Reset this chat RPG state?')) {
            act('reset');
        }
    });

    $('#rpg-set-name').on('click', async () => {
        try {
            const name = await C().Popup.show.input(
                'Character name',
                'Enter the name for this chat’s RPG character.',
                state?.name || 'Adventurer',
            );

            if (name?.trim()) {
                await act('set_name', {
                    name: name.trim(),
                });
            }
        } catch (error) {
            console.error('[RPG Engine] Rename failed', error);
            toastr.error('Could not save the character name. Refresh the RPG panel and try again.');
        }
    });

    $('#rpg-add-item').on('click', () => {
        const name = $('#rpg-item-name').val().trim();

        if (name) {
            act('inventory_add', {
                name,
                qty: Number($('#rpg-item-qty').val() || 1),
            });
        }
    });

    $('#rpg-add-condition').on('click', () => {
        const name = $('#rpg-condition-name').val().trim();
        const turns = $('#rpg-condition-turns').val();

        if (name) {
            act('condition_add', {
                name,
                turns: turns === '' ? null : Number(turns),
            });
        }
    });
}

jQuery(init);
