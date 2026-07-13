/**
 * Reusable data table with search, sorting, actions, and pagination.
 */
import icons from '../icons.js';
import { escapeHtml } from '../utils.js';

/**
 * @param {HTMLElement} container – element to render into
 * @param {Object} opts
 * @param {Array<{key?,field?,label,render?,sortable?,width?}>} opts.columns
 * @param {Array<Object>} opts.data
 * @param {Array<{icon,label,title,onClick,class?,showLabel?}>} [opts.actions]
 * @param {boolean} [opts.searchable]
 * @param {string} [opts.searchPlaceholder]
 * @param {number} [opts.pageSize]
 * @param {Function} [opts.rowClass] – (row) => extra class string
 */
export function createTable(container, opts) {
  const {
    columns = [],
    data = [],
    actions = [],
    searchable = true,
    searchPlaceholder = 'Buscar...',
    pageSize = 15,
    rowClass,
  } = opts;

  let filteredData = [...data];
  let currentPage = 1;
  let sortKey = null;
  let sortDir = 'asc';
  let searchTerm = '';

  function getColumnKey(column) {
    return column.key ?? column.field;
  }

  function applyFilter() {
    if (!searchTerm) {
      filteredData = [...data];
    } else {
      const term = searchTerm.toLowerCase();
      filteredData = data.filter((row) =>
        columns.some((col) => {
          const val = row[getColumnKey(col)];
          return val != null && String(val).toLowerCase().includes(term);
        })
      );
    }
    if (sortKey) applySort();
    currentPage = 1;
  }

  function applySort() {
    filteredData.sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }

  function getPage() {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }

  function totalPages() {
    return Math.max(1, Math.ceil(filteredData.length / pageSize));
  }

  function renderTable() {
    const page = getPage();
    const tp = totalPages();

    let html = '';

    // Search bar
    if (searchable) {
      html += `
        <div class="search-bar">
          <div class="search-input-wrapper">
            ${icons.search()}
            <input type="text" class="search-input" id="table-search"
              placeholder="${escapeHtml(searchPlaceholder)}" value="${escapeHtml(searchTerm)}">
          </div>
        </div>`;
    }

    // Table
    html += '<div class="table-container"><table class="data-table"><thead><tr>';
    columns.forEach((col) => {
      const key = getColumnKey(col);
      const sortable = col.sortable !== false;
      const cls = sortable ? 'sortable' : '';
      let arrow = '';
      if (sortKey === key) arrow = sortDir === 'asc' ? ' ↑' : ' ↓';
      html += `<th class="${cls}" data-key="${key}">${col.label}${arrow}</th>`;
    });
    const hasActionLabels = actions.some((action) => action.showLabel);
    if (actions.length) {
      html += `<th style="width:${hasActionLabels ? '340px' : '100px'};">Ações</th>`;
    }
    html += '</tr></thead><tbody>';

    if (page.length === 0) {
      html += `<tr><td colspan="${columns.length + (actions.length ? 1 : 0)}" class="text-center text-muted" style="padding:40px;">Nenhum registro encontrado</td></tr>`;
    }

    page.forEach((row, idx) => {
      const extra = rowClass ? rowClass(row) : '';
      html += `<tr class="${extra}">`;
      columns.forEach((col) => {
        const key = getColumnKey(col);
        const val = col.render ? col.render(row[key], row) : escapeHtml(row[key] ?? '—');
        html += `<td>${val}</td>`;
      });
      if (actions.length) {
        html += '<td><div class="actions">';
        actions.forEach((action, ai) => {
          if (action.show && !action.show(row)) return;
          const cls = action.class || '';
          const iconFn = typeof action.icon === 'string' ? icons[action.icon] : null;
          const iconHtml = typeof action.icon === 'function'
            ? action.icon()
            : action.icon?.startsWith?.('<svg')
              ? action.icon
              : iconFn
                ? iconFn()
                : '';
          const label = action.label || action.title || 'Ação';
          const labelHtml = action.showLabel ? `<span>${escapeHtml(label)}</span>` : '';
          const actionClass = action.showLabel ? 'btn-action-label' : '';
          html += `<button class="btn-icon ${actionClass} ${cls}" data-action="${ai}" data-idx="${(currentPage - 1) * pageSize + idx}" title="${label}" aria-label="${label}">${iconHtml}${labelHtml}</button>`;
        });
        html += '</div></td>';
      }
      html += '</tr>';
    });

    html += '</tbody></table></div>';

    // Pagination
    if (tp > 1) {
      html += '<div class="pagination">';
      html += `<button class="pagination-btn" data-page="prev" ${currentPage === 1 ? 'disabled' : ''}>← Anterior</button>`;
      for (let p = 1; p <= tp; p++) {
        if (tp > 7 && Math.abs(p - currentPage) > 2 && p !== 1 && p !== tp) {
          if (p === currentPage - 3 || p === currentPage + 3) html += '<span class="pagination-info">…</span>';
          continue;
        }
        html += `<button class="pagination-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
      }
      html += `<button class="pagination-btn" data-page="next" ${currentPage === tp ? 'disabled' : ''}>Próximo →</button>`;
      html += '</div>';
    }

    container.innerHTML = html;
    bindEvents();
  }

  function bindEvents() {
    // Search
    const searchInput = container.querySelector('#table-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value;
        applyFilter();
        renderTable();
        // Re-focus and restore cursor
        const newInput = container.querySelector('#table-search');
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(newInput.value.length, newInput.value.length);
        }
      });
    }

    // Sort
    container.querySelectorAll('th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (sortKey === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          sortDir = 'asc';
        }
        applySort();
        renderTable();
      });
    });

    // Pagination
    container.querySelectorAll('.pagination-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.page;
        if (p === 'prev') currentPage = Math.max(1, currentPage - 1);
        else if (p === 'next') currentPage = Math.min(totalPages(), currentPage + 1);
        else currentPage = parseInt(p, 10);
        renderTable();
      });
    });

    // Actions
    container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ai = parseInt(btn.dataset.action, 10);
        const idx = parseInt(btn.dataset.idx, 10);
        const row = filteredData[idx];
        if (actions[ai]?.onClick && row) actions[ai].onClick(row);
      });
    });
  }

  // Initial render
  applyFilter();
  renderTable();

  // Return an update function
  return {
    update(newData) {
      opts.data = newData;
      data.length = 0;
      data.push(...newData);
      applyFilter();
      renderTable();
    },
  };
}
