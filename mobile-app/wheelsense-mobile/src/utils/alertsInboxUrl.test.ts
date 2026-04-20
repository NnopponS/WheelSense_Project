import { alertsInboxUrl } from './alertsInboxUrl';
import type { UserRole } from '../types';

describe('alertsInboxUrl', () => {
  it('maps observer to /observer/alerts', () => {
    expect(alertsInboxUrl('observer')).toBe('/observer/alerts');
  });

  it('maps patient to /patient', () => {
    expect(alertsInboxUrl('patient')).toBe('/patient');
  });

  it('maps head_nurse to /head-nurse/alerts', () => {
    expect(alertsInboxUrl('head_nurse')).toBe('/head-nurse/alerts');
  });

  it('maps admin to /admin/monitoring', () => {
    expect(alertsInboxUrl('admin')).toBe('/admin/monitoring');
  });

  it('maps supervisor to /supervisor/monitoring', () => {
    expect(alertsInboxUrl('supervisor')).toBe('/supervisor/monitoring');
  });

  it('appends alert fragment when alertId provided', () => {
    expect(alertsInboxUrl('observer', 42)).toBe('/observer/alerts#alert-42');
  });

  it('appends alert fragment for patient', () => {
    expect(alertsInboxUrl('patient', 7)).toBe('/patient#alert-7');
  });
});
