export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

export function validatePassword(password) {
  if (typeof password !== 'string') {
    return 'Senha inválida';
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }

  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return `A senha deve ter no máximo ${MAX_PASSWORD_BYTES} bytes`;
  }

  return null;
}
