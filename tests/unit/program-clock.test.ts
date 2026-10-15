import { expect, it } from 'vitest';
import { demoEdition, registrationState } from '@ftu/shared';
it('uses inclusive opening and exclusive next-day closing in Vietnam time', () => {
  const edition = {
    ...demoEdition,
    registration_open_at: '2027-03-07T00:00:00+07:00',
    registration_close_at: '2027-03-22T00:00:00+07:00',
  };
  expect(registrationState(edition, Date.parse('2027-03-06T23:59:59+07:00'))).toBe('UPCOMING');
  expect(registrationState(edition, Date.parse(edition.registration_open_at))).toBe('OPEN');
  expect(registrationState(edition, Date.parse('2027-03-21T23:59:59+07:00'))).toBe('OPEN');
  expect(registrationState(edition, Date.parse(edition.registration_close_at))).toBe('CLOSED');
  expect(registrationState(null, Date.now())).toBe('UNCONFIGURED');
});
