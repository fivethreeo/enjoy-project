import { mountEveryLayoutEditor, everyLayoutDocumentFromJSON } from './prosemirror-editor/everylayout-editor';
import { defaultPlaygroundDocument } from './playground-document';
import './customstyling.scss';

const mount = document.querySelector<HTMLElement>('#everylayout-editor');

if (!mount) {
  throw new Error('The playground page needs a #everylayout-editor mount element.');
}

mountEveryLayoutEditor({
  mount,
  initialDocument: everyLayoutDocumentFromJSON(defaultPlaygroundDocument),
});
