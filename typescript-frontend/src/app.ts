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

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll<HTMLElement>('[data-item-count-demo]').forEach((demo, index) => {
    const items = Array.from(demo.children) as HTMLElement[];
    const minimum = Math.min(
      Math.max(Number(demo.dataset.minItems) || 1, 1),
      items.length - 1,
    );
    if (items.length <= minimum) {
      return;
    }

    let visibleCount = items.length;
    let removing = true;
    const anchors = items.map(() => document.createComment('item-count-demo'));
    const cycle = () => {
      if (visibleCount === minimum) {
        removing = false;
      } else if (visibleCount === items.length) {
        removing = true;
      }

      const itemIndex = removing ? visibleCount - 1 : visibleCount;
      const item = items[itemIndex];
      if (removing) {
        const animation = item.animate(
          [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.96)' }],
          { duration: 240, easing: 'ease-out', fill: 'both' },
        );
        animation.finished.then(() => {
          item.replaceWith(anchors[itemIndex]);
          animation.cancel();
        });
        visibleCount -= 1;
      } else {
        anchors[itemIndex].replaceWith(item);
        item.style.opacity = '0';
        item.style.transform = 'scale(0.96)';
        window.requestAnimationFrame(() => {
          const animation = item.animate(
            [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'scale(1)' }],
            { duration: 240, easing: 'ease-out' },
          );
          animation.finished.then(() => {
            item.style.opacity = '';
            item.style.transform = '';
          });
        });
        visibleCount += 1;
      }
    };

    window.setTimeout(() => {
      cycle();
      window.setInterval(cycle, 1600);
    }, index * 300);
  });
}
