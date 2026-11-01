import { DOMParser } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import {
  mountPageEditor,
  pageDocumentFromJSON,
} from './page-editor';
import { richTextSchema } from './setup';

export * from './page-editor';

function initialDocument(element: HTMLTextAreaElement) {
  try {
    const stored = JSON.parse(element.value) as { version?: number; document?: unknown };
    if (stored.version === 1 && stored.document) {
      return pageDocumentFromJSON(stored.document);
    }
  } catch {
    // Existing Page content is HTML and becomes the first text block.
  }

  const content = document.createElement('div');
  content.innerHTML = element.value;
  const richDocument = DOMParser.fromSchema(richTextSchema).parse(content);
  return pageDocumentFromJSON(richDocument.toJSON());
}

function save(editor: EditorView, element: HTMLTextAreaElement) {
  element.value = JSON.stringify({ version: 1, document: editor.state.doc.toJSON() });
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Mounts the default schema, plugins, and menu next to a Django textarea. */
export function setupEditor(element: HTMLTextAreaElement): EditorView {
  const shell = document.createElement('section');
  element.insertAdjacentElement('afterend', shell);
  element.hidden = true;
  return mountPageEditor({
    mount: shell,
    initialDocument: initialDocument(element),
    onChange: ({ view }) => save(view, element),
  }).view;
}

function initializeEditors() {
  document.querySelectorAll<HTMLTextAreaElement>('[data-prosemirror]').forEach(setupEditor);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeEditors);
} else {
  initializeEditors();
}
