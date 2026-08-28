// State/combat logic editor (backlog item 007): a structured editor over
// the parsed `.cns` model -- browse StateDefs and add/edit/remove/reorder
// their Controllers, including trigger expressions and parameters. A
// Controller's `type`/`triggers`/`parameters` are unevaluated data this
// app never interprets, only edits -- character/cns's own parser can never
// actually reject a controller (everything round-trips as raw strings),
// so the one real-world "unsupported" shape this editor can meaningfully
// flag is a controller whose `type` was already blank in the loaded data.
// See .vibe/decisions/006-state-editor-unsupported-controller-and-removal-scope.md
// for that definition, why it's frozen at load time rather than
// re-evaluated live, and why only removing a whole StateDef (not a single
// Controller) requires a confirm step.
import type { CharacterData, Controller, StateDef } from "../wasm/types.ts";

export interface StateEditorOptions {
  /** Called with a patch to merge into the loaded character on every committed edit. */
  onChange: (patch: Partial<CharacterData>) => void;
}

/** A Controller plus editor-only bookkeeping: a stable row id (list
 * identity survives reorder/remove) and whether it was blank-typed in the
 * originally loaded data -- computed once, never re-derived from the live
 * (possibly mid-edit) type value. */
interface ControllerRow {
  id: number;
  controller: Controller;
  unsupported: boolean;
}

interface TriggerRow {
  id: number;
  value: string;
}

interface ParameterRow {
  id: number;
  key: string;
  value: string;
}

/**
 * Renders the state/combat logic editor into `root`, replacing its
 * previous content, pre-filled from `character.stateDefs`. Edits are
 * committed to the caller (via `options.onChange`) immediately, the same
 * "editor screen never touches the document store directly" convention
 * `characteristics-editor.ts` established.
 */
export function renderStateEditor(
  root: HTMLElement,
  character: CharacterData,
  options: StateEditorOptions,
): void {
  root.replaceChildren();

  const container = document.createElement("div");
  container.className = "state-editor";

  const heading = document.createElement("h2");
  heading.textContent = "State/Combat Logic";
  container.appendChild(heading);

  const list = document.createElement("div");
  list.className = "state-editor__list";
  container.appendChild(list);

  const addStateDefButton = document.createElement("wuik-button");
  addStateDefButton.setAttribute("variant", "secondary");
  addStateDefButton.dataset.action = "add-statedef";
  addStateDefButton.textContent = "Add StateDef";
  container.appendChild(addStateDefButton);

  let stateDefs: StateDef[] = character.stateDefs;
  const expanded = new Set<number>();

  function commit(): void {
    options.onChange({ stateDefs });
  }

  function renderList(): void {
    if (stateDefs.length === 0) {
      list.replaceChildren(emptyState("No StateDefs yet."));
      return;
    }
    list.replaceChildren(
      ...stateDefs.map((stateDef) => renderStateDefPanel(stateDef)),
    );
  }

  function renderStateDefPanel(def: StateDef): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "state-editor__statedef";
    panel.dataset.statedef = String(def.number);

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "state-editor__statedef-toggle";
    const isExpanded = expanded.has(def.number);
    toggleButton.setAttribute("aria-expanded", String(isExpanded));
    toggleButton.textContent = `Statedef ${def.number} (type: ${def.type || "?"}, moveType: ${def.moveType || "?"}, physics: ${def.physics || "?"})`;

    const body = document.createElement("div");
    body.className = "state-editor__statedef-body";
    body.hidden = !isExpanded;
    renderStateDefBody(body, def);

    toggleButton.addEventListener("click", () => {
      const nowExpanded = body.hidden;
      body.hidden = !nowExpanded;
      toggleButton.setAttribute("aria-expanded", String(nowExpanded));
      if (nowExpanded) {
        expanded.add(def.number);
      } else {
        expanded.delete(def.number);
      }
    });

    panel.append(toggleButton, body);
    return panel;
  }

  function renderStateDefBody(body: HTMLElement, def: StateDef): void {
    let nextControllerRowId = 0;
    let rows: ControllerRow[] = def.controllers.map((controller) => ({
      id: nextControllerRowId++,
      controller,
      unsupported: controller.type.trim() === "",
    }));

    const controllersList = document.createElement("div");
    controllersList.className = "state-editor__controllers";

    const addControllerButton = document.createElement("wuik-button");
    addControllerButton.setAttribute("variant", "secondary");
    addControllerButton.dataset.action = "add-controller";
    addControllerButton.textContent = "Add controller";

    const removeStateDefButton = document.createElement("wuik-button");
    removeStateDefButton.dataset.action = "remove-statedef";
    removeStateDefButton.textContent = "Remove StateDef";

    const removeConfirmArea = document.createElement("div");
    removeConfirmArea.className = "state-editor__statedef-remove-confirm";

    function commitControllers(): void {
      def.controllers = rows.map((r) => r.controller);
      commit();
    }

    function renderControllers(): void {
      if (rows.length === 0) {
        controllersList.replaceChildren(emptyState("No controllers yet."));
        return;
      }
      controllersList.replaceChildren(
        ...rows.map((row, index) =>
          renderControllerRow(row, index, rows.length, {
            onMoveUp: () => {
              // Guarded here, not just via the button's `disabled`
              // attribute: a boundary row's handler must never run even if
              // somehow invoked anyway (found by real-browser runtime
              // verification -- a forced/synthetic click bypassing the
              // disabled state otherwise swaps in `undefined` and crashes
              // the next commit).
              if (index === 0) return;
              [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]];
              commitControllers();
              renderControllers();
            },
            onMoveDown: () => {
              if (index === rows.length - 1) return;
              [rows[index], rows[index + 1]] = [rows[index + 1], rows[index]];
              commitControllers();
              renderControllers();
            },
            onRemove: () => {
              rows = rows.filter((r) => r.id !== row.id);
              commitControllers();
              renderControllers();
            },
            onCommit: commitControllers,
          }),
        ),
      );
    }

    addControllerButton.addEventListener("click", () => {
      rows = [
        ...rows,
        {
          id: nextControllerRowId++,
          controller: { type: "", triggers: [], parameters: {} },
          // A freshly-added controller is never frozen into the
          // unsupported/read-only state just because it starts blank --
          // see .vibe/decisions/006.
          unsupported: false,
        },
      ];
      commitControllers();
      renderControllers();
    });

    removeStateDefButton.addEventListener("click", () => {
      removeConfirmArea.replaceChildren(
        renderRemoveStateDefConfirm(rows.length, {
          onConfirm: () => {
            stateDefs = stateDefs.filter((s) => s.number !== def.number);
            commit();
            renderList();
          },
          onCancel: () => {
            removeConfirmArea.replaceChildren();
          },
        }),
      );
    });

    renderControllers();
    body.replaceChildren(
      controllersList,
      addControllerButton,
      removeStateDefButton,
      removeConfirmArea,
    );
  }

  function renderControllerRow(
    row: ControllerRow,
    index: number,
    total: number,
    handlers: {
      onMoveUp: () => void;
      onMoveDown: () => void;
      onRemove: () => void;
      onCommit: () => void;
    },
  ): HTMLElement {
    const rowEl = document.createElement("div");
    rowEl.className = "state-editor__controller";

    if (row.unsupported) {
      const badge = document.createElement("span");
      badge.className = "state-editor__unsupported-badge";
      badge.textContent = "Unsupported (from file)";
      rowEl.appendChild(badge);

      const readOnly = document.createElement("p");
      readOnly.className = "state-editor__controller-readonly";
      readOnly.textContent = `triggers: ${row.controller.triggers.join(", ") || "(none)"}; parameters: ${
        Object.entries(row.controller.parameters)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ") || "(none)"
      }`;
      rowEl.appendChild(readOnly);
    } else {
      const typeInput = document.createElement("input");
      typeInput.type = "text";
      typeInput.dataset.field = "type";
      typeInput.value = row.controller.type;
      typeInput.addEventListener("blur", () => {
        row.controller = { ...row.controller, type: typeInput.value };
        handlers.onCommit();
      });
      rowEl.appendChild(typeInput);

      rowEl.appendChild(renderTriggers(row, handlers.onCommit));
      rowEl.appendChild(renderParameters(row, handlers.onCommit));
    }

    const moveUp = document.createElement("wuik-button");
    moveUp.setAttribute("variant", "secondary");
    moveUp.dataset.action = "move-up";
    moveUp.textContent = "Move up";
    if (index === 0) moveUp.setAttribute("disabled", "");
    moveUp.addEventListener("click", handlers.onMoveUp);

    const moveDown = document.createElement("wuik-button");
    moveDown.setAttribute("variant", "secondary");
    moveDown.dataset.action = "move-down";
    moveDown.textContent = "Move down";
    if (index === total - 1) moveDown.setAttribute("disabled", "");
    moveDown.addEventListener("click", handlers.onMoveDown);

    const remove = document.createElement("wuik-button");
    remove.dataset.action = "remove-controller";
    remove.textContent = "Remove";
    remove.addEventListener("click", handlers.onRemove);

    rowEl.append(moveUp, moveDown, remove);
    return rowEl;
  }

  function renderTriggers(
    row: ControllerRow,
    onCommit: () => void,
  ): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "state-editor__triggers";

    let nextId = 0;
    let triggerRows: TriggerRow[] = row.controller.triggers.map((value) => ({
      id: nextId++,
      value,
    }));

    function commitTriggers(): void {
      row.controller = {
        ...row.controller,
        triggers: triggerRows.map((t) => t.value),
      };
      onCommit();
    }

    const list = document.createElement("div");
    const addButton = document.createElement("wuik-button");
    addButton.setAttribute("variant", "secondary");
    addButton.dataset.action = "add-trigger";
    addButton.textContent = "Add trigger";

    function render(): void {
      list.replaceChildren(
        ...triggerRows.map((t, i) => {
          const rowEl = document.createElement("div");
          const input = document.createElement("input");
          input.type = "text";
          input.dataset.triggerIndex = String(i);
          input.value = t.value;
          input.addEventListener("blur", () => {
            t.value = input.value;
            commitTriggers();
          });

          const removeButton = document.createElement("wuik-button");
          removeButton.setAttribute("variant", "secondary");
          removeButton.dataset.action = "remove-trigger";
          removeButton.dataset.removeTriggerIndex = String(i);
          removeButton.setAttribute("aria-label", `Remove trigger #${i + 1}`);
          removeButton.textContent = "Remove trigger";
          removeButton.addEventListener("click", () => {
            triggerRows = triggerRows.filter((r) => r.id !== t.id);
            commitTriggers();
            render();
          });

          rowEl.append(input, removeButton);
          return rowEl;
        }),
      );
    }

    addButton.addEventListener("click", () => {
      triggerRows = [...triggerRows, { id: nextId++, value: "" }];
      commitTriggers();
      render();
    });

    render();
    wrapper.append(list, addButton);
    return wrapper;
  }

  function renderParameters(
    row: ControllerRow,
    onCommit: () => void,
  ): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "state-editor__parameters";

    let nextId = 0;
    let paramRows: ParameterRow[] = Object.entries(
      row.controller.parameters,
    ).map(([key, value]) => ({ id: nextId++, key, value }));

    function commitParameters(): void {
      // Duplicate keys collapse the normal JS way (last one wins) -- see
      // .vibe/decisions/006.
      row.controller = {
        ...row.controller,
        parameters: Object.fromEntries(paramRows.map((p) => [p.key, p.value])),
      };
      onCommit();
    }

    const list = document.createElement("div");
    const addButton = document.createElement("wuik-button");
    addButton.setAttribute("variant", "secondary");
    addButton.dataset.action = "add-parameter";
    addButton.textContent = "Add parameter";

    function render(): void {
      list.replaceChildren(
        ...paramRows.map((p, i) => {
          const rowEl = document.createElement("div");

          const keyInput = document.createElement("input");
          keyInput.type = "text";
          keyInput.dataset.parameterIndex = String(i);
          keyInput.dataset.parameterPart = "key";
          keyInput.value = p.key;
          keyInput.addEventListener("blur", () => {
            p.key = keyInput.value;
            commitParameters();
          });

          const valueInput = document.createElement("input");
          valueInput.type = "text";
          valueInput.dataset.parameterIndex = String(i);
          valueInput.dataset.parameterPart = "value";
          valueInput.value = p.value;
          valueInput.addEventListener("blur", () => {
            p.value = valueInput.value;
            commitParameters();
          });

          const removeButton = document.createElement("wuik-button");
          removeButton.setAttribute("variant", "secondary");
          removeButton.dataset.action = "remove-parameter";
          removeButton.dataset.removeParameterIndex = String(i);
          removeButton.setAttribute("aria-label", `Remove parameter #${i + 1}`);
          removeButton.textContent = "Remove parameter";
          removeButton.addEventListener("click", () => {
            paramRows = paramRows.filter((r) => r.id !== p.id);
            commitParameters();
            render();
          });

          rowEl.append(keyInput, valueInput, removeButton);
          return rowEl;
        }),
      );
    }

    addButton.addEventListener("click", () => {
      paramRows = [...paramRows, { id: nextId++, key: "", value: "" }];
      commitParameters();
      render();
    });

    render();
    wrapper.append(list, addButton);
    return wrapper;
  }

  function renderRemoveStateDefConfirm(
    controllerCount: number,
    handlers: { onConfirm: () => void; onCancel: () => void },
  ): HTMLElement {
    const wrapper = document.createElement("div");

    const warning = document.createElement("p");
    warning.setAttribute("role", "status");
    warning.textContent = `This state has ${controllerCount} controller${controllerCount === 1 ? "" : "s"}. Other controllers may target this state number.`;

    const confirmButton = document.createElement("wuik-button");
    confirmButton.dataset.action = "confirm-remove-statedef";
    confirmButton.textContent = `Confirm remove (${controllerCount} controller${controllerCount === 1 ? "" : "s"})`;
    confirmButton.addEventListener("click", handlers.onConfirm);

    const cancelButton = document.createElement("wuik-button");
    cancelButton.setAttribute("variant", "secondary");
    cancelButton.dataset.action = "cancel-remove-statedef";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", handlers.onCancel);

    wrapper.append(warning, confirmButton, cancelButton);
    return wrapper;
  }

  function nextStateDefNumber(): number {
    if (stateDefs.length === 0) return 0;
    return Math.max(...stateDefs.map((s) => s.number)) + 1;
  }

  addStateDefButton.addEventListener("click", () => {
    const number = nextStateDefNumber();
    stateDefs = [
      ...stateDefs,
      {
        number,
        type: "S",
        moveType: "I",
        physics: "S",
        anim: 0,
        ctrl: false,
        powerAdd: 0,
        juggle: 0,
        faceP2: false,
        hitDefPersist: false,
        moveHitPersist: false,
        hitCountPersist: false,
        sprPriority: 0,
        controllers: [],
      },
    ];
    expanded.add(number);
    commit();
    renderList();
  });

  function emptyState(text: string): HTMLElement {
    const el = document.createElement("p");
    el.className = "state-editor__empty";
    el.textContent = text;
    return el;
  }

  renderList();
  root.appendChild(container);
}
