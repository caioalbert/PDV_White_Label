import { changePassword, getDefaultRoute, getUser } from '../../auth.js';
import icons from '../../icons.js';
import { showToast } from '../../components/toast.js';
import { getCompanyLogoAlt, getCompanyName } from '../../app-config.js';
import { escapeHtml } from '../../utils.js';

const MIN_PASSWORD_LENGTH = 8;

export function render(container) {
  const user = getUser();
  const companyName = getCompanyName();
  const logoAlt = getCompanyLogoAlt();

  container.innerHTML = `
    <main class="login-shell">
      <section class="login-form-panel" aria-labelledby="password-change-title">
        <div class="login-form-wrap">
          <div class="login-brand">
            <img src="/logo.png" alt="${logoAlt}">
            <div>
              <strong>${companyName}</strong>
              <span>Segurança da conta</span>
            </div>
          </div>

          <div class="login-heading">
            <h1 id="password-change-title">Defina uma nova senha</h1>
            <p>
              ${user?.nome ? `${escapeHtml(user.nome)}, sua` : 'Sua'} senha atual é temporária e precisa ser substituída.
            </p>
          </div>

          <form class="login-form" id="password-change-form" novalidate>
            <div class="login-field">
              <label for="current-password">Senha atual</label>
              <div class="login-input-wrap">
                ${icons.lock()}
                <input
                  id="current-password"
                  type="password"
                  required
                  autocomplete="current-password"
                  aria-describedby="password-change-error"
                >
              </div>
            </div>

            <div class="login-field">
              <label for="new-password">Nova senha</label>
              <div class="login-input-wrap">
                ${icons.lock()}
                <input
                  id="new-password"
                  type="password"
                  required
                  minlength="${MIN_PASSWORD_LENGTH}"
                  maxlength="72"
                  autocomplete="new-password"
                  aria-describedby="password-requirements password-change-error"
                >
              </div>
            </div>

            <div class="login-field">
              <label for="confirm-password">Confirme a nova senha</label>
              <div class="login-input-wrap">
                ${icons.lock()}
                <input
                  id="confirm-password"
                  type="password"
                  required
                  minlength="${MIN_PASSWORD_LENGTH}"
                  maxlength="72"
                  autocomplete="new-password"
                  aria-describedby="password-change-error"
                >
              </div>
            </div>

            <p class="password-requirements" id="password-requirements">
              Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.
            </p>
            <div
              class="login-error"
              id="password-change-error"
              role="alert"
              aria-live="polite"
            ></div>

            <button type="submit" class="btn-login" id="btn-change-password">
              <span>Salvar nova senha</span>
            </button>
          </form>
        </div>
      </section>

      <section class="login-visual-panel" aria-label="Proteção da conta">
        <img src="/login-warehouse.png" alt="" aria-hidden="true">
        <div class="login-visual-overlay"></div>
        <div class="login-visual-content">
          <span class="login-visual-eyebrow">Primeiro acesso seguro</span>
          <h2>Proteja sua conta</h2>
          <p>A nova senha encerra todas as sessões anteriores e libera o acesso ao sistema.</p>
        </div>
      </section>
    </main>
  `;

  const form = container.querySelector('#password-change-form');
  const currentPasswordInput = container.querySelector('#current-password');
  const newPasswordInput = container.querySelector('#new-password');
  const confirmPasswordInput = container.querySelector('#confirm-password');
  const errorDiv = container.querySelector('#password-change-error');
  const submitButton = container.querySelector('#btn-change-password');

  function clearError() {
    errorDiv.textContent = '';
    errorDiv.classList.remove('visible');
    [currentPasswordInput, newPasswordInput, confirmPasswordInput].forEach((input) => {
      input.removeAttribute('aria-invalid');
    });
  }

  function showError(message, input) {
    errorDiv.textContent = message;
    errorDiv.classList.add('visible');
    input?.setAttribute('aria-invalid', 'true');
    input?.focus();
  }

  [currentPasswordInput, newPasswordInput, confirmPasswordInput].forEach((input) => {
    input.addEventListener('input', clearError);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!currentPassword) {
      showError('Informe a senha atual.', currentPasswordInput);
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      showError(
        `A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
        newPasswordInput
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('A confirmação não corresponde à nova senha.', confirmPasswordInput);
      return;
    }
    if (newPassword === currentPassword) {
      showError('A nova senha deve ser diferente da senha atual.', newPasswordInput);
      return;
    }

    submitButton.disabled = true;
    submitButton.querySelector('span').textContent = 'Salvando...';

    try {
      await changePassword(currentPassword, newPassword);
      showToast('Senha alterada com sucesso.', 'success');
      window.location.hash = `#${getDefaultRoute()}`;
    } catch (error) {
      showError(error.message || 'Não foi possível alterar a senha.', currentPasswordInput);
    } finally {
      submitButton.disabled = false;
      submitButton.querySelector('span').textContent = 'Salvar nova senha';
    }
  });

  requestAnimationFrame(() => currentPasswordInput.focus());
}
