/**
 * Modal component — imperative open/close API.
 */
import icons from '../icons.js';

let currentOverlay = null;
let currentEscHandler = null;

/**
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string|Node} opts.content   – HTML string or DOM node for the modal body
 * @param {Function} [opts.onConfirm]  – called when confirm button is clicked
 * @param {Function} [opts.onCancel]
 * @param {string} [opts.confirmText]  – default "Salvar"
 * @param {string} [opts.cancelText]   – default "Cancelar"
 * @param {string} [opts.size]         – 'lg' | 'xl' | default ''
 * @param {boolean} [opts.hideFooter]
 */
export function openModal(opts) {
  closeModal(); // ensure only one modal

  const {
    title = '',
    content = '',
    onConfirm,
    onCancel,
    confirmText = 'Salvar',
    cancelText = 'Cancelar',
    size = '',
    hideFooter = false,
  } = opts;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${size ? 'modal-' + size : ''}">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" id="modal-close-btn">${icons.x()}</button>
      </div>
      <div class="modal-body" id="modal-body"></div>
      ${!hideFooter ? `
        <div class="modal-footer">
          <button class="btn btn-secondary" id="modal-cancel-btn">${cancelText}</button>
          <button class="btn btn-primary" id="modal-confirm-btn">${confirmText}</button>
        </div>
      ` : ''}
    </div>
  `;

  document.body.appendChild(overlay);
  currentOverlay = overlay;

  const modalBody = overlay.querySelector('#modal-body');
  if (content instanceof Node) {
    modalBody.appendChild(content);
  } else {
    modalBody.innerHTML = content;
  }

  // Trigger animation
  requestAnimationFrame(() => overlay.classList.add('active'));

  // Bind events
  overlay.querySelector('#modal-close-btn').addEventListener('click', () => {
    if (onCancel) onCancel();
    closeModal();
  });

  const cancelBtn = overlay.querySelector('#modal-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (onCancel) onCancel();
      closeModal();
    });
  }

  const confirmBtn = overlay.querySelector('#modal-confirm-btn');
  if (confirmBtn && onConfirm) {
    confirmBtn.addEventListener('click', () => onConfirm());
  }

  // Backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      if (onCancel) onCancel();
      closeModal();
    }
  });

  // ESC key
  currentEscHandler = (e) => {
    if (e.key === 'Escape') {
      if (onCancel) onCancel();
      closeModal();
    }
  };
  document.addEventListener('keydown', currentEscHandler);

  return overlay;
}

export function closeModal() {
  if (currentOverlay) {
    const overlayToClose = currentOverlay;
    currentOverlay = null;
    overlayToClose.classList.remove('active');

    if (currentEscHandler) {
      document.removeEventListener('keydown', currentEscHandler);
      currentEscHandler = null;
    }

    setTimeout(() => {
      overlayToClose.remove();
    }, 250);
  }
}

/** Helper: get modal body element for custom DOM manipulation */
export function getModalBody() {
  return document.getElementById('modal-body');
}
