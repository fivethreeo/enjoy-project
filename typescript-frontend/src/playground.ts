import { mountEveryLayoutEditor, everyLayoutDocumentFromJSON } from './prosemirror-editor/everylayout-editor';
import { defaultPlaygroundDocument } from './playground-document';
import './customstyling.scss';

const mount = document.querySelector<HTMLElement>('#everylayout-editor');

if (!mount) {
  throw new Error('The playground page needs a #everylayout-editor mount element.');
}

const legacyVisibilityLinkDocument = {
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [{
      type: 'text',
      text: 'works',
      marks: [
        { type: 'link', attrs: { href: '#held-id', title: 'Held label' } },
        { type: 'visibility', attrs: { state: 'hidden' } },
      ],
    }],
  }],
};

const initialDocument = new URLSearchParams(window.location.search).has('legacy-visibility-link')
  ? legacyVisibilityLinkDocument
  : defaultPlaygroundDocument;

mountEveryLayoutEditor({
  mount,
  initialDocument: everyLayoutDocumentFromJSON(initialDocument),
});
