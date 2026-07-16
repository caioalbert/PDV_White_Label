import { getDefaultRoute, login } from '../../auth.js';
import icons from '../../icons.js';
import { getCompanyLogoAlt, getCompanyName } from '../../app-config.js';

export function render(container) {
  const companyName = getCompanyName();
  const logoAlt = getCompanyLogoAlt();

  container.innerHTML = `
    <main class="login-shell">
      <section class="login-form-panel" aria-labelledby="login-title">
        <div class="login-form-wrap">
          <div class="login-brand">
            <img src="/logo.png" alt="${logoAlt}">
            <div>
              <strong>${companyName}</strong>
              <span>Sistema de Gestão</span>
            </div>
          </div>

          <div class="login-heading">
            <h1 id="login-title">Bem-vindo de volta</h1>
            <p>Entre com suas credenciais para acessar o sistema</p>
          </div>

          <form class="login-form" id="login-form" novalidate>
            <div class="login-field">
              <label for="login-usuario">Usuário</label>
              <div class="login-input-wrap">
                ${icons.mail()}
                <input
                  id="login-usuario"
                  type="text"
                  placeholder="seu usuário"
                  required
                  autocomplete="username"
                  aria-describedby="login-error"
                >
              </div>
            </div>

            <div class="login-field">
              <label for="login-senha">Senha</label>
              <div class="login-input-wrap">
                ${icons.lock()}
                <input
                  id="login-senha"
                  type="password"
                  placeholder="••••••••"
                  required
                  autocomplete="current-password"
                  aria-describedby="login-error"
                >
                <button
                  class="login-password-toggle"
                  id="login-password-toggle"
                  type="button"
                  aria-label="Mostrar senha"
                  title="Mostrar senha"
                >
                  ${icons.eye()}
                </button>
              </div>
            </div>

            <div class="login-error" id="login-error" role="alert" aria-live="polite"></div>

            <button type="submit" class="btn-login" id="btn-login">
              <span>Entrar</span>
            </button>
          </form>

        </div>
      </section>

      <section class="login-visual-panel" aria-label="Apresentação do sistema">
        <img src="/login-warehouse.png" alt="" aria-hidden="true">
        <div class="login-visual-overlay"></div>
        <div class="login-visual-content">
          <span class="login-visual-eyebrow">Gestão integrada para 3 lojas</span>
          <h2>Sistema ERP Completo</h2>
          <p>Gerencie compras, estoque, produção, vendas e financeiro das 3 lojas em um só lugar.</p>
        </div>
      </section>
    </main>
  `;

  const form = container.querySelector('#login-form');
  const errorDiv = container.querySelector('#login-error');
  const btnLogin = container.querySelector('#btn-login');
  const usuarioInput = container.querySelector('#login-usuario');
  const senhaInput = container.querySelector('#login-senha');
  const passwordToggle = container.querySelector('#login-password-toggle');

  function clearError() {
    errorDiv.textContent = '';
    errorDiv.classList.remove('visible');
    usuarioInput.removeAttribute('aria-invalid');
    senhaInput.removeAttribute('aria-invalid');
  }

  function showError(message) {
    errorDiv.textContent = message;
    errorDiv.classList.add('visible');
    usuarioInput.setAttribute('aria-invalid', 'true');
    senhaInput.setAttribute('aria-invalid', 'true');
  }

  passwordToggle.addEventListener('click', () => {
    const showPassword = senhaInput.type === 'password';
    senhaInput.type = showPassword ? 'text' : 'password';
    passwordToggle.innerHTML = showPassword ? icons.eyeOff() : icons.eye();
    passwordToggle.setAttribute('aria-label', showPassword ? 'Ocultar senha' : 'Mostrar senha');
    passwordToggle.title = showPassword ? 'Ocultar senha' : 'Mostrar senha';
    senhaInput.focus();
  });

  [usuarioInput, senhaInput].forEach((input) => {
    input.addEventListener('input', clearError);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const credential = usuarioInput.value.trim();
    const password = senhaInput.value;
    if (!credential || !password) {
      showError('Preencha o usuário e a senha.');
      (!credential ? usuarioInput : senhaInput).focus();
      return;
    }

    btnLogin.disabled = true;
    usuarioInput.disabled = true;
    senhaInput.disabled = true;
    btnLogin.querySelector('span').textContent = 'Entrando...';
    let authenticationFailed = false;

    try {
      const user = await login(credential, password);
      window.location.hash = user?.deve_trocar_senha
        ? '#/alterar-senha'
        : `#${getDefaultRoute()}`;
    } catch (error) {
      authenticationFailed = true;
      showError(error.message || 'Usuário ou senha inválidos.');
    } finally {
      btnLogin.disabled = false;
      usuarioInput.disabled = false;
      senhaInput.disabled = false;
      btnLogin.querySelector('span').textContent = 'Entrar';
      if (authenticationFailed) senhaInput.focus();
    }
  });

  requestAnimationFrame(() => usuarioInput.focus());
}
