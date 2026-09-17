# SillyTavern RPG Engine v0.1

The repository root is the **installable SillyTavern UI extension**. `server-plugin/` is the Node-side SQLite component.

## GitHub install

1. Extract this package and upload the **contents**, not the outer folder/ZIP, to a GitHub repository.
2. In SillyTavern: **Extensions → Install Extension**.
3. Paste the Git repository URL and install it.
4. On the machine running the SillyTavern server, copy `server-plugin/` to `SillyTavern/plugins/st-rpg-engine/`.
5. In the root SillyTavern `config.yaml`, set `enableServerPlugins: true`.
6. Restart the SillyTavern server, then reload the browser.

Expected server layout:

    SillyTavern/plugins/st-rpg-engine/index.js
    SillyTavern/plugins/st-rpg-engine/package.json

## Test

Open a character chat → tap ⚔️ → panel should say **SQLite connected**.
Rename Adventurer, reduce MP, add an item, add a 2-turn condition, advance one turn, reload ST, and verify the state survived. Advance another turn and verify the condition expires.

The SQLite file is created at `SillyTavern/plugins/st-rpg-engine/data/rpg-engine.sqlite`.

v0.1 deliberately does not yet interpret natural-language RP or resolve combat. It proves persistent authoritative state first.

**Requirement:** the server plugin uses Node's built-in `node:sqlite` API, so the Node runtime must provide it.
