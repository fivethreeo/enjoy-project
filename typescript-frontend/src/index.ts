import { initEveryLayout } from './everylayout/init';
import './index.scss';

initEveryLayout();

document.body.classList.add('with-js');

const docsNavToggle = document.querySelector<HTMLElement>('.docs-nav-toggle');
const docsNav = document.querySelector<HTMLElement>('.docs-nav');

if (docsNavToggle && docsNav) {
  docsNavToggle.hidden = false;
  docsNav.hidden = docsNavToggle.getAttribute('aria-expanded') !== 'true';
  docsNavToggle.addEventListener('click', () => {
    const expanded = docsNavToggle.getAttribute('aria-expanded') === 'true';
    docsNavToggle.setAttribute('aria-expanded', String(!expanded));
    docsNav.hidden = expanded;
  });
}
