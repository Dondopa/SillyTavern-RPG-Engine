# SillyTavern RPG Engine v0.2

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

## LLM context (v0.2)

Before each normal SillyTavern generation (including regeneration, continuation, and swipes), the extension waits for pending RPG actions, reads the active chat’s state from the server, and attaches a system message near the end of the prompt. The RPG panel does not need to be open.

The snapshot includes name, HP, MP, stamina, inventory, equipment, conditions, and turn. The event ledger is excluded. This sends those RPG fields to the currently selected LLM provider as part of the usual generation request. The panel’s **LLM context → View attached state** shows the latest attached snapshot.

Chat changes clear the previous injection. Group chats use the group campaign rather than the current speaker. If the server fails, returns invalid state, or does not respond within 10 seconds, generation stops with a visible error instead of using stale stats. Restore the server connection and retry. Switching chats while a snapshot is loading cancels that generation.

This is **read-only context**: the model can account for the saved state, but cannot update SQLite. Continue using the panel to change resources, inventory, conditions, and turn. No automatic combat resolution, message parsing, or model-proposed state commits are implemented. Calls made directly to an LLM by other extensions may bypass SillyTavern’s generation hooks and are not covered.

### End-to-end check

1. In a character chat, rename the RPG character to Bunyon, lower MP to 5/100, add one `Cobalt brass key`, and add a `Hoarse voice` condition lasting 2 turns.
2. Send ordinary RP without naming any of those facts, for example: `I approach the practice-room door and ask the instructor what today's first exercise will be.`
3. Check **View attached state** and the generated message’s prompt inspector for the snapshot. The model should naturally respect low magic reserves, the carried key, and the voice condition where relevant. Model adherence can vary; the outgoing prompt is the direct check that the state was supplied.
4. Change MP and generate again to verify that a fresh snapshot replaces the old one. Switch chats to check isolation.

### Developer checks

Run `node --test tests/llm-context.test.mjs`. Tests cover fresh reads, pending action ordering, chat/group scope, stale response rejection, literal data escaping, and generation aborts on backend failure.

**Requirement:** the server plugin uses Node's built-in `node:sqlite` API, so the Node runtime must provide it.
