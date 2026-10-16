(function (root) {
  'use strict';
  root.createExchangeRateEditor = function ({ api, context, currencies, table, installSetupTypeTabs, showSetupTypeTab, syncRequiredMarkers }) {
    const $ = id => document.getElementById(id), form = $('exchange-rate-form');
    let rows = [], selected = null, epoch = 0, listSequence = 0, historySequence = 0, editorSequence = 0, loaded = false, opener = null, saving = false;
    const error = message => { $('exchange-rate-error').textContent = message; $('exchange-rate-error').hidden = !message; };
    const listError = message => { $('exchange-rate-list-error').textContent = message; $('exchange-rate-list-error').hidden = !message; };
    const active = (org, generation) => org === context().orgId && generation === epoch;
    function setupKeyboardTabs(tablist, buttons, panels, activate) {
      function select(index, focus = false) {
        buttons.forEach((button, i) => {
          button.id ||= `${tablist.id}-tab-${i}`;
          button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(i === index));
          button.tabIndex = i === index ? 0 : -1;
          panels[i].id ||= `${tablist.id}-panel-${i}`;
          button.setAttribute('aria-controls', panels[i].id);
          panels[i].setAttribute('role', 'tabpanel'); panels[i].setAttribute('aria-labelledby', button.id);
        });
        activate(index); if (focus) buttons[index].focus();
      }
      tablist.setAttribute('role', 'tablist');
      buttons.forEach((button, index) => {
        button.addEventListener('click', () => select(index));
        button.addEventListener('keydown', event => {
          const key = event.key;
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
          event.preventDefault();
          select(key === 'Home' ? 0 : key === 'End' ? buttons.length - 1 : (index + (key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length, true);
        });
      });
      select(0); return select;
    }
    installSetupTypeTabs({ formId: form.id, prefix: 'exchange-rate', tabs: [
      { name: 'details', label: 'Details', controlIds: ['exchange-rate-from', 'exchange-rate-to', 'exchange-rate-date', 'exchange-rate-value', 'exchange-rate-preview', 'exchange-rate-reason', 'exchange-rate-updated'] },
      { name: 'history', label: 'Change history', controlIds: ['exchange-rate-history'] }
    ] });
    const editorTabs = form.querySelector('[data-setup-type-tabs]'); editorTabs.id = 'exchange-rate-editor-tabs';
    const selectEditorTab = setupKeyboardTabs(editorTabs, [...editorTabs.querySelectorAll('button')], [...form.querySelectorAll('.setup-type-panel')], index => showSetupTypeTab('exchange-rate', index ? 'history' : 'details'));
    const listTabs = $('currency-tabs');
    const selectListTab = setupKeyboardTabs(listTabs, [...listTabs.querySelectorAll('button')], [$('currency-definition-panel'), $('exchange-rate-list-panel')], index => {
      $('currency-definition-panel').hidden = !!index; $('exchange-rate-list-panel').hidden = !index;
      [...listTabs.querySelectorAll('button')].forEach((button, i) => button.classList.toggle('active', i === index));
      close(false); $('currency-form').hidden = true;
      if (index) load().catch(e => listError(e.message));
    });
    function render() {
      const term = $('exchange-rate-search').value.trim().toLowerCase();
      table($('exchange-rate-list'), [
        ['From', r => r.from_currency_code], ['To', r => r.to_currency_code],
        ['Effective from', r => r.effective_from], ['Rate', r => r.rate]
      ], rows.filter(r => [r.from_currency_code, r.to_currency_code, r.effective_from, r.rate].join(' ').toLowerCase().includes(term)), open);
    }
    async function load(force = false) {
      const org = context().orgId, generation = epoch;
      if (!org || (loaded && !force)) return;
      const sequence = ++listSequence; listError('');
      $('exchange-rate-list').textContent = 'Loading exchange rates…';
      try {
        const response = await api(`exchange-rates/list?organisation_id=${encodeURIComponent(org)}`);
        if (!active(org, generation) || sequence !== listSequence) return;
        rows = response.exchange_rates || []; loaded = true; render();
      } catch (e) {
        if (active(org, generation) && sequence === listSequence) { $('exchange-rate-list').textContent = ''; listError(e.message); }
      }
    }
    function preview() {
      const input = $('exchange-rate-value'); input.setCustomValidity('');
      try {
        const rate = root.ExchangeRateMath.normalise(input.value);
        const from = $('exchange-rate-from').value, to = $('exchange-rate-to').value;
        $('exchange-rate-forward').textContent = from && to ? `1 ${from} = ${rate} ${to}` : 'Choose both currencies to preview conversion';
        $('exchange-rate-reverse').textContent = from && to ? `1 ${to} ≈ ${root.ExchangeRateMath.reciprocal(rate)} ${from}` : '';
      } catch (e) { input.setCustomValidity(input.value ? e.message : 'Enter an exchange rate'); $('exchange-rate-forward').textContent = 'Enter a rate to preview conversion'; $('exchange-rate-reverse').textContent = ''; }
      $('exchange-rate-to').setCustomValidity($('exchange-rate-from').value === $('exchange-rate-to').value ? 'Choose two different currencies' : '');
    }
    async function history(row) {
      const org = context().orgId, generation = epoch, sequence = ++historySequence;
      $('exchange-rate-history').textContent = row ? 'Loading change history…' : 'Change history will appear after the first save.';
      if (!row) return;
      try {
        const response = await api(`exchange-rates/history?organisation_id=${encodeURIComponent(org)}&exchange_rate_id=${encodeURIComponent(row.exchange_rate_id)}`);
        if (!active(org, generation) || sequence !== historySequence || selected?.exchange_rate_id !== row.exchange_rate_id) return;
        table($('exchange-rate-history'), [
          ['Revision', r => r.revision], ['Changed at', r => new Date(r.changed_at).toLocaleString()],
          ['Changed by', r => r.changed_by_email], ['Previous rate', r => r.previous_rate || '—'],
          ['Rate', r => r.rate], ['Reason', r => r.reason || 'Created']
        ], response.changes || []);
      } catch (e) { if (active(org, generation) && sequence === historySequence) $('exchange-rate-history').textContent = e.message; }
    }
    function open(row = null) {
      ++editorSequence; opener = document.activeElement; selected = row; saving = false;
      $('exchange-rate-save').disabled = false; form.reset(); error(''); selectEditorTab(0);
      for (const [id, value] of [['exchange-rate-from', row?.from_currency_code], ['exchange-rate-to', row?.to_currency_code]]) {
        const select = $(id); select.replaceChildren(new Option('Choose currency', ''));
        const options = currencies().filter(c => c.is_active !== false || c.currency_code === value);
        options.forEach(c => select.add(new Option(`${c.currency_code} — ${c.currency_name}`, c.currency_code)));
        select.value = value || ''; select.disabled = !!row;
      }
      $('exchange-rate-date').value = row?.effective_from || ''; $('exchange-rate-date').readOnly = !!row;
      $('exchange-rate-value').value = row?.rate || '';
      $('exchange-rate-reason').required = !!row; $('exchange-rate-reason').closest('label').hidden = !row;
      $('exchange-rate-updated').textContent = row ? `Last updated ${new Date(row.updated_at).toLocaleString()} by ${row.updated_by_email}` : '';
      syncRequiredMarkers(form); preview(); $('currency-form').hidden = true; form.hidden = false;
      history(row); $('exchange-rate-value').focus();
    }
    function close(restore = true) {
      form.hidden = true; selected = null; ++historySequence; ++editorSequence;
      if (restore && opener?.isConnected) opener.focus();
    }
    form.addEventListener('input', preview); form.addEventListener('change', preview);
    form.addEventListener('invalid', () => selectEditorTab(0), true);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (saving) return; preview();
      if (!form.reportValidity()) return;
      const org = context().orgId, generation = epoch, row = selected, sequence = editorSequence;
      saving = true; error(''); $('exchange-rate-save').disabled = true;
      try {
        await api('exchange-rates/save', { method: 'POST', body: JSON.stringify({ organisation_id: org,
          exchange_rate_id: row?.exchange_rate_id || null, revision: row?.revision,
          from_currency_code: $('exchange-rate-from').value, to_currency_code: $('exchange-rate-to').value,
          effective_from: $('exchange-rate-date').value, rate: $('exchange-rate-value').value,
          reason: $('exchange-rate-reason').value }) });
        if (!active(org, generation) || sequence !== editorSequence) return;
        close(); await load(true);
      } catch (e) { if (active(org, generation) && sequence === editorSequence) error(e.message); }
      finally { if (active(org, generation) && sequence === editorSequence) { saving = false; $('exchange-rate-save').disabled = false; } }
    });
    $('add-exchange-rate').addEventListener('click', () => open());
    $('exchange-rate-search').addEventListener('input', render);
    form.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
    // The shared panel-close helper hides the panel; invalidate pending history and restore focus.
    new MutationObserver(() => {
      if (form.hidden) { ++historySequence; ++editorSequence; selected = null; if (opener?.isConnected) opener.focus(); }
      else boundEditor();
    }).observe(form, { attributes: true, attributeFilter: ['hidden'] });
    function boundEditor() { requestAnimationFrame(() => { if (!form.hidden) form.style.maxHeight = `${Math.max(120, innerHeight - form.getBoundingClientRect().top - 12)}px`; }); }
    window.addEventListener('resize', boundEditor);
    function reset() {
      ++epoch; ++listSequence; ++historySequence; rows = []; selected = null; loaded = false; saving = false;
      form.hidden = true; form.reset(); $('exchange-rate-save').disabled = false;
      $('exchange-rate-search').value = ''; $('exchange-rate-history').replaceChildren();
      error(''); listError(''); render(); selectListTab(0);
    }
    root.erpSetupDeletion.install({form,kind:'exchange_rate',label:'Exchange rate',api,context,notify:message=>error(message),
      getRecord:()=>({id:selected?.exchange_rate_id,name:selected ? `${selected.from_currency_code}/${selected.to_currency_code} ${selected.effective_from}` : ''}),
      close:()=>close(),afterDelete:async()=>{await load(true);},
    });
    return { load, reset };
  };
})(window);
