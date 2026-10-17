// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AccountSecurity from '../../apps/web/src/components/AccountSecurity';
const state = vi.hoisted(() => ({
  auth: {
    updateUser: vi.fn(),
    reauthenticate: vi.fn(),
    signOut: vi.fn(),
    mfa: {
      listFactors: vi.fn(),
      getAuthenticatorAssuranceLevel: vi.fn(),
      enroll: vi.fn(),
      challengeAndVerify: vi.fn(),
      unenroll: vi.fn(),
    },
  },
  verifier: { signInWithPassword: vi.fn(), signOut: vi.fn() },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: state.verifier }) }));
vi.mock('../../apps/web/src/lib/api', () => ({ supabase: { auth: state.auth } }));
vi.mock('../../apps/web/src/lib/auth', () => ({
  useAuth: () => ({ user: { email: 'test@example.test' } }),
}));
vi.mock('../../apps/web/src/components/Turnstile', () => ({
  Turnstile: ({ onToken }: { onToken: (v: string) => void }) =>
    React.createElement(
      'button',
      { type: 'button', onClick: () => onToken('test') },
      'Xác minh thử',
    ),
}));
beforeEach(() => {
  vi.resetAllMocks();
  state.auth.mfa.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
  state.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
    error: null,
  });
  state.auth.updateUser.mockResolvedValue({ error: null });
  state.auth.signOut.mockResolvedValue({ error: null });
  state.verifier.signInWithPassword.mockResolvedValue({ error: null });
  state.verifier.signOut.mockResolvedValue({ error: null });
});
afterEach(cleanup);
function open() {
  render(React.createElement(MemoryRouter, null, React.createElement(AccountSecurity)));
}
function fill() {
  fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), {
    target: { value: 'Current password 2026' },
  });
  fireEvent.change(screen.getByLabelText('Mật khẩu mới', { exact: true }), {
    target: { value: 'New passphrase 2026' },
  });
  fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu mới'), {
    target: { value: 'New passphrase 2026' },
  });
  fireEvent.click(screen.getByText('Xác minh thử'));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu' }));
}
describe('sensitive account actions with fake provider', () => {
  it('does not update password when the current password is incorrect', async () => {
    state.verifier.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials' } });
    open();
    fill();
    expect(await screen.findByText('Mật khẩu hiện tại hoặc xác minh chưa đúng.')).toBeTruthy();
    expect(state.auth.updateUser).not.toHaveBeenCalled();
    expect(state.auth.signOut).not.toHaveBeenCalled();
  });
  it('requires MFA before a password change when the account has an enrolled factor', async () => {
    state.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });
    open();
    fill();
    expect(await screen.findByText('Xác minh MFA trước khi đổi mật khẩu.')).toBeTruthy();
    expect(state.verifier.signInWithPassword).not.toHaveBeenCalled();
    expect(state.auth.updateUser).not.toHaveBeenCalled();
  });
  it('verifies the old password, revokes sessions, and removes password fields after a successful change', async () => {
    open();
    fill();
    await waitFor(() => expect(state.auth.signOut).toHaveBeenCalledWith({ scope: 'global' }));
    expect(state.auth.updateUser).toHaveBeenCalledWith({
      password: 'New passphrase 2026',
      current_password: 'Current password 2026',
    });
    expect(state.verifier.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect((screen.getByLabelText('Mật khẩu mới', { exact: true }) as HTMLInputElement).value).toBe(
      '',
    );
  });
  it('requests the provider reauthentication nonce instead of claiming success', async () => {
    state.auth.updateUser.mockResolvedValue({ error: { code: 'reauthentication_needed' } });
    state.auth.reauthenticate.mockResolvedValue({ error: null });
    open();
    fill();
    expect(await screen.findByLabelText('Mã xác nhận trong email')).toBeTruthy();
    expect(state.auth.reauthenticate).toHaveBeenCalledOnce();
    expect(state.auth.signOut).not.toHaveBeenCalled();
  });
  it('does not expose logout actions in account security', () => {
    open();
    expect(screen.queryByRole('button', { name: /^Đăng xuất/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Đăng xuất/ })).toBeNull();
    expect(state.auth.signOut).not.toHaveBeenCalled();
  });
});
