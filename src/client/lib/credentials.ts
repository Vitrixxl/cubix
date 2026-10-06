import { msg } from "../i18n/msg";
/** The server's rules (rust-api/src/api.rs): 3–24 letters, digits or underscores; ten characters of password or more. */
const USERNAME = /^[A-Za-z0-9_]{3,24}$/;
export const PASSWORD_MIN = 10;

export type CredentialError = { field: "username" | "password"; message: string };

/**
 * What is wrong with a sign-in or a new account before asking the API, most pressing first: a missing field, then
 * (creating an account) the server's rules. The username is trimmed by the caller. Empty when the form can be sent.
 */
export function credentialErrors(register: boolean, username: string, password: string): CredentialError[] {
  const errors: CredentialError[] = [];
  if (!username) errors.push({ field: "username", message: msg("Enter your username.") });
  if (!password) errors.push({ field: "password", message: msg("Enter your password.") });
  if (register && username && !USERNAME.test(username)) errors.push({ field: "username", message: msg("Use 3–24 letters, digits or underscores.") });
  if (register && password && password.length < PASSWORD_MIN) errors.push({ field: "password", message: msg("Use {0} characters or more.", { 0: PASSWORD_MIN }) });
  return errors;
}
