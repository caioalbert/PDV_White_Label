/**
 * Toast notification component
 */
export function showToast(message, type = 'success', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const iconMap = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-icon">${iconMap[type] || 'ℹ'}</span>
      <span class="toast-message"></span>
    </div>
    <button class="toast-close">✕</button>
  `;
  toast.querySelector('.toast-message').textContent = String(message ?? '');

  container.appendChild(toast);

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  });

  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
}
