import icons from '../../icons.js';

export function render(container) {
  container.innerHTML = `
    <div class="empty-state">
      ${icons.lock ? icons.lock() : ''}
      <h4>Nenhum módulo liberado</h4>
      <p>Solicite ao administrador a liberação das permissões necessárias.</p>
    </div>
  `;
}
