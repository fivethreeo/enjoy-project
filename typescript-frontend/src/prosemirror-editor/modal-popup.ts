import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export type ModalPopupRenderContext = {
  /** Closes this popup with a metadata-only transaction. */
  close: () => void;
  view: EditorView;
};

type ModalPopupLabel = {
  /** Visible dialog heading. */
  title: string;
  ariaLabel?: string;
} | {
  title?: undefined;
  /** Required when the popup has no visible heading. */
  ariaLabel: string;
};

/**
 * A popup is deliberately view state: render functions and their DOM never enter
 * the ProseMirror document or its history.
 */
export type ModalPopupSpec = ModalPopupLabel & {
  /** Stable identifier used to connect the dialog to its visible title. */
  id: string;
  /** Optional dialog class for a popup-specific layout. */
  className?: string;
  render: (context: ModalPopupRenderContext) => HTMLElement;
};

export type ModalPopupState = ModalPopupSpec | null;

export type ModalPopupAction =
  | { type: 'open' | 'replace'; spec: ModalPopupSpec }
  | { type: 'close' };

export const modalPopupPluginKey = new PluginKey<ModalPopupState>('modal-popup');

function popupTransaction(transaction: Transaction, action: ModalPopupAction): Transaction {
  return transaction
    .setMeta(modalPopupPluginKey, action)
    .setMeta('addToHistory', false);
}

/** Opens a popup, replacing any currently open popup in this editor. */
export function openModalPopup(view: EditorView, spec: ModalPopupSpec): void {
  view.dispatch(popupTransaction(view.state.tr, { type: 'open', spec }));
}

/** Explicitly replaces the currently open popup with another popup. */
export function replaceModalPopup(view: EditorView, spec: ModalPopupSpec): void {
  view.dispatch(popupTransaction(view.state.tr, { type: 'replace', spec }));
}

/** Closes the popup, if one is open. */
export function closeModalPopup(view: EditorView): void {
  if (modalPopupPluginKey.getState(view.state) !== null) {
    view.dispatch(popupTransaction(view.state.tr, { type: 'close' }));
  }
}

function dialogId(spec: ModalPopupSpec): string {
  return `prosemirror-modal-popup-${spec.id}`;
}

export function modalPopupPlugin(shell: HTMLElement): Plugin<ModalPopupState> {
  return new Plugin<ModalPopupState>({
    key: modalPopupPluginKey,
    state: {
      init: () => null,
      apply(transaction, state) {
        const action = transaction.getMeta(modalPopupPluginKey) as ModalPopupAction | undefined;

        if (action === undefined) {
          return state;
        }

        return action.type === 'close' ? null : action.spec;
      },
    },
    view(view) {
      if (!shell.contains(view.dom)) {
        return {};
      }

      let popup: HTMLElement | null = null;

      const restoreEditorFocus = () => {
        if (shell.contains(view.dom)) {
          view.focus();
        }
      };

      const removePopup = (restoreFocus: boolean) => {
        popup?.remove();
        popup = null;
        if (restoreFocus) {
          restoreEditorFocus();
        }
      };

      const renderPopup = (spec: ModalPopupSpec) => {
        const id = dialogId(spec);
        const backdrop = document.createElement('div');
        backdrop.className = 'prosemirror-modal-popup-backdrop';

        const dialog = document.createElement('section');
        dialog.className = 'prosemirror-modal-popup imposter contain';
        if (spec.className) {
          dialog.classList.add(spec.className);
        }
        dialog.id = id;
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.tabIndex = -1;

        if (spec.title !== undefined) {
          const title = document.createElement('h2');
          title.className = 'prosemirror-modal-popup__title';
          title.id = `${id}-title`;
          title.textContent = spec.title;
          dialog.setAttribute('aria-labelledby', title.id);
          dialog.append(title);
        } else {
          dialog.setAttribute('aria-label', spec.ariaLabel);
        }

        const closeButton = document.createElement('button');
        closeButton.className = 'prosemirror-modal-popup__close';
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', `Close ${spec.title ?? spec.ariaLabel}`);
        closeButton.textContent = '×';
        closeButton.addEventListener('click', () => closeModalPopup(view));
        dialog.append(closeButton);

        const body = document.createElement('div');
        body.className = 'prosemirror-modal-popup__body';
        body.append(spec.render({ close: () => closeModalPopup(view), view }));
        dialog.append(body);

        backdrop.addEventListener('click', (event) => {
          if (event.target === backdrop) {
            closeModalPopup(view);
          }
        });
        backdrop.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeModalPopup(view);
          }
        });

        backdrop.append(dialog);
        shell.append(backdrop);
        popup = backdrop;
        dialog.focus();
      };

      return {
        update(updatedView, previousState) {
          const previousPopup = modalPopupPluginKey.getState(previousState) ?? null;
          const nextPopup = modalPopupPluginKey.getState(updatedView.state) ?? null;

          if (previousPopup === nextPopup) {
            return;
          }

          if (popup !== null) {
            removePopup(nextPopup === null);
          }
          if (nextPopup !== null) {
            renderPopup(nextPopup);
          }
        },
        destroy() {
          removePopup(true);
        },
      };
    },
  });
}
