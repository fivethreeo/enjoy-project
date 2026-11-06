import { initEveryLayout } from './everylayout/init';
import './index.scss';
import './customstyling.scss';

initEveryLayout();

document.body.classList.add('with-js');

const docsNavToggle = document.querySelector<HTMLElement>('.docs-nav-toggle');
const docsNav = document.querySelector<HTMLElement>('.docs-nav');

if (docsNavToggle && docsNav) {
  docsNavToggle.addEventListener('click', () => {
    const expanded = docsNavToggle.getAttribute('aria-expanded') === 'true';
    docsNavToggle.setAttribute('aria-expanded', String(!expanded));
  });
}
