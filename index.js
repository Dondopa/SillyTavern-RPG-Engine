const API = '/api/plugins/st-rpg-engine';
let state = null;

const C = () => SillyTavern.getContext();

const key = () =>
    `${C().characterId ?? C().groupId ?? 'global'}::${C().chatId ?? 'default'}`;

async function api(p, o = {}) {
    const r = await fetch(API + p, {
        ...o,
        headers: {
            'Content-Type': 'application/json',
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
    try {
        state = (
            await api('/state?campaign=' + encodeURIComponent(key()))
        ).state;

        $('#rpg-server-status').text('SQLite connected');

        render();
    } catch (e) {
        $('#rpg-server-status').text('Server plugin offline');
        console.error('[RPG Engine]', e);
    }
}

async function act(action, payload = {}) {
    state = (
        await api('/action', {
            method: 'POST',
            body: JSON.stringify({
                campaign: key(),
                action,
                payload,
            }),
        })
    ).state;

    render();
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

    $('#rpg-next-turn').on('click', () => act('next_turn'));

    $('#rpg-reset').on('click', () => {
        if (confirm('Reset this chat RPG state?')) {
            act('reset');
        }
    });

    $('#rpg-set-name').on('click', () => {
        const name = prompt(
            'Character name',
            state?.name || 'Adventurer',
        );

        if (name?.trim()) {
            act('set_name', {
                name: name.trim(),
            });
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
