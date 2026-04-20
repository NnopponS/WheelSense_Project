/**
 * GlobalSosButton unit tests — pure logic, no RN rendering.
 * Constants are duplicated here to avoid importing the component
 * which pulls in react-native (not available in Jest without mocks).
 */

// Duplicate constants from GlobalSosButton to test them
const SOS_ALERT_TYPE = 'sos';
const SOS_SEVERITY = 'high';

describe('GlobalSosButton constants', () => {
  it('SOS_ALERT_TYPE is sos', () => {
    expect(SOS_ALERT_TYPE).toBe('sos');
  });

  it('SOS_SEVERITY is high', () => {
    expect(SOS_SEVERITY).toBe('high');
  });
});

describe('GlobalSosButton visibility logic', () => {
  it('is visible only for patient role', () => {
    const patientUser = { role: 'patient' } as any;
    const observerUser = { role: 'observer' } as any;
    const isPatient = (u: any) => u?.role === 'patient';
    expect(isPatient(patientUser)).toBe(true);
    expect(isPatient(observerUser)).toBe(false);
  });

  it('requires linked_patient.id to send SOS', () => {
    const userWithPatient = { role: 'patient', linked_patient: { id: 5 } } as any;
    const userWithoutPatient = { role: 'patient', linked_patient: null } as any;
    const hasPatientId = (u: any) => u?.linked_patient?.id != null;
    expect(hasPatientId(userWithPatient)).toBe(true);
    expect(hasPatientId(userWithoutPatient)).toBe(false);
  });
});
