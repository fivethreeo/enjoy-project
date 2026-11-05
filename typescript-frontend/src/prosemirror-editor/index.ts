import { DOMParser } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import {
  mountEveryLayoutEditor,
  everyLayoutDocumentFromJSON,
} from './everylayout-editor';
import { richTextSchema } from './setup';
import { djangoMediaMenu } from './django-media';
import { djangoMediaSchema } from './django-media-schema';

export * from './everylayout-editor';

function isEditorStyleSheet(link: HTMLLinkElement): boolean {
  if (!link.relList.contains('stylesheet')) {
    return false;
  }

  return new URL(link.href, document.baseURI).pathname.split('/').includes('editor');
}

function installEditorStyleSheet(root: ShadowRoot): void {
  const source = Array.from(document.querySelectorAll<HTMLLinkElement>('link'))
    .find(isEditorStyleSheet);

  if (!source) {
    throw new Error('Unable to find the Every Layout editor stylesheet.');
  }

  root.append(source);
}

function initialDocument(element: HTMLTextAreaElement) {
  try {
    const stored = JSON.parse(element.value) as { version?: number; document?: unknown };
    if (stored.version === 1 && stored.document) {
      return everyLayoutDocumentFromJSON(stored.document, djangoMediaSchema);
    }
  } catch {
    // Existing Page content is HTML and becomes the first text block.
  }

  const content = document.createElement('div');
  content.innerHTML = element.value;
  const richDocument = DOMParser.fromSchema(richTextSchema).parse(content);
  return everyLayoutDocumentFromJSON(richDocument.toJSON(), djangoMediaSchema);
}

function save(editor: EditorView, element: HTMLTextAreaElement) {
  element.value = JSON.stringify({ version: 1, document: editor.state.doc.toJSON() });
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Mounts the default schema, plugins, and menu next to a Django textarea. */
export function setupEditor(element: HTMLTextAreaElement): EditorView {
  const host = document.createElement('section');
  const root = host.attachShadow({ mode: 'open' });
  const shell = document.createElement('section');
  installEditorStyleSheet(root);
  root.append(shell);
  element.insertAdjacentElement('afterend', host);
  element.hidden = true;
  return mountEveryLayoutEditor({
    mount: shell,
    schema: djangoMediaSchema,
    initialDocument: initialDocument(element),
    menu: ({ defaultGroups, view }) => {
      const endpoints = {
        list: element.dataset.filerListUrl,
        folders: element.dataset.filerFoldersUrl,
        upload: element.dataset.filerUploadUrl,
      };
      if (!endpoints.list || !endpoints.folders || !endpoints.upload) {
        return defaultGroups;
      }
      const firstToolbarLine = defaultGroups[0];
      const utilityActions = firstToolbarLine[firstToolbarLine.length - 1];
      return [
        [
          ...firstToolbarLine.slice(0, -1),
          djangoMediaMenu(view, endpoints as { list: string; folders: string; upload: string }),
          utilityActions,
        ],
        ...defaultGroups.slice(1),
      ];
    },
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
