(() => {
  'use strict';
  const filters = [...document.querySelectorAll('[data-filter]')];
  const search = document.querySelector('#archive-search');
  let filter = 'all';
  const normalise = text => text.toLowerCase().replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s]+/g,' ').trim();
  function updateArchive() {
    const term = normalise(search?.value || '');
    let count = 0;
    for (const experiment of document.querySelectorAll('.hub-experiment')) {
      const matches = normalise(experiment.dataset.search + ' ' + experiment.textContent).includes(term);
      let visible = 0;
      for (const doc of experiment.querySelectorAll('.hub-document')) {
        doc.hidden = !matches || (filter !== 'all' && doc.dataset.type !== filter);
        if (!doc.hidden) visible++;
      }
      experiment.hidden = !visible;
      count += visible;
    }
    const empty = document.querySelector('#no-results');
    if (empty) empty.hidden = count !== 0;
    const list = document.querySelector('#experiment-list');
    if (list) list.hidden = count === 0;
    const announcement = document.querySelector('#filter-announcement');
    if (announcement) announcement.textContent = count.toLocaleString('fa-IR') + ' مورد نمایش داده می‌شود.';
  }
  filters.forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    filters.forEach(item => {
      const selected = item === button;
      item.classList.toggle('is-active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    updateArchive();
  }));
  search?.addEventListener('input', updateArchive);
  document.addEventListener('click', event => {
    document.querySelectorAll('.hub-switch[open]').forEach(menu => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.querySelectorAll('.hub-switch[open]').forEach(menu => {menu.open=false;menu.querySelector('summary').focus();});
  });

})();
