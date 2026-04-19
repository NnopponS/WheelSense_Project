import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:8000';

// Test credentials for each role
const TEST_USERS = {
  admin: { username: 'admin_test', password: 'admin123', role: 'admin' },
  head_nurse: { username: 'headnurse_test', password: 'nurse123', role: 'head_nurse' },
  supervisor: { username: 'supervisor_test', password: 'super123', role: 'supervisor' },
  observer: { username: 'observer_test', password: 'observer123', role: 'observer' },
  patient: { username: 'patient_test', password: 'patient123', role: 'patient' },
};

async function login(page: Page, username: string, password: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('input[name="username"]', { timeout: 10000 });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}

async function checkPageLoaded(page: Page, expectedPath: string, expectedText: string) {
  await expect(page).toHaveURL(new RegExp(expectedPath));
  const bodyText = await page.textContent('body');
  expect(bodyText).toContain(expectedText);
}

test.describe('Role-Based Access Tests', () => {
  
  test('Admin - Dashboard access', async ({ page }) => {
    await login(page, TEST_USERS.admin.username, TEST_USERS.admin.password);
    await checkPageLoaded(page, '/admin', 'Dashboard');
  });

  test('Admin - Users page', async ({ page }) => {
    await login(page, TEST_USERS.admin.username, TEST_USERS.admin.password);
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/users?|personnel|staff/);
  });

  test('Admin - Devices page', async ({ page }) => {
    await login(page, TEST_USERS.admin.username, TEST_USERS.admin.password);
    await page.goto(`${BASE_URL}/admin/devices`);
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/devices?|equipment/);
  });

  test('Admin - Patients page', async ({ page }) => {
    await login(page, TEST_USERS.admin.username, TEST_USERS.admin.password);
    await page.goto(`${BASE_URL}/admin/patients`);
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/patients?|residents?/);
  });

  test('Head Nurse - Dashboard access', async ({ page }) => {
    await login(page, TEST_USERS.head_nurse.username, TEST_USERS.head_nurse.password);
    await checkPageLoaded(page, '/head-nurse', 'Dashboard');
  });

  test('Head Nurse - Alerts page', async ({ page }) => {
    await login(page, TEST_USERS.head_nurse.username, TEST_USERS.head_nurse.password);
    await page.goto(`${BASE_URL}/head-nurse/alerts`);
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/alerts?|notifications?/);
  });

  test('Head Nurse - Tasks page', async ({ page }) => {
    await login(page, TEST_USERS.head_nurse.username, TEST_USERS.head_nurse.password);
    await page.goto(`${BASE_URL}/head-nurse/tasks`);
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/tasks?|workflows?/);
  });

  test('Supervisor - Dashboard access', async ({ page }) => {
    await login(page, TEST_USERS.supervisor.username, TEST_USERS.supervisor.password);
    await checkPageLoaded(page, '/supervisor', 'Dashboard');
  });

  test('Supervisor - Emergency page', async ({ page }) => {
    await login(page, TEST_USERS.supervisor.username, TEST_USERS.supervisor.password);
    await page.goto(`${BASE_URL}/supervisor/emergency`);
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/emergency|alerts?|critical/);
  });

  test('Supervisor - Monitoring page', async ({ page }) => {
    await login(page, TEST_USERS.supervisor.username, TEST_USERS.supervisor.password);
    await page.goto(`${BASE_URL}/supervisor/monitoring`);
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/monitor|overview|status/);
  });

  test('Observer - Dashboard access', async ({ page }) => {
    await login(page, TEST_USERS.observer.username, TEST_USERS.observer.password);
    await checkPageLoaded(page, '/observer', 'Dashboard');
  });

  test('Observer - Floorplan page', async ({ page }) => {
    await login(page, TEST_USERS.observer.username, TEST_USERS.observer.password);
    await page.goto(`${BASE_URL}/observer/floorplan`);
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/floorplan|map|layout/);
  });

  test('Patient - Dashboard access', async ({ page }) => {
    await login(page, TEST_USERS.patient.username, TEST_USERS.patient.password);
    await checkPageLoaded(page, '/patient', 'Dashboard');
  });

});

test.describe('Login Page Tests', () => {
  
  test('Login page loads correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page).toHaveTitle(/login|sign in/i);
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('Invalid credentials show error', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="username"]', 'invalid_user');
    await page.fill('input[name="password"]', 'wrong_password');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/invalid|error|incorrect|failed/);
  });

});

test.describe('API Health Tests', () => {
  
  test('API health endpoint', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('Auth session endpoint', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/auth/session`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('authenticated');
  });

});

test.describe('Cross-Role Access Control', () => {
  
  test('Observer cannot access admin pages', async ({ page }) => {
    await login(page, TEST_USERS.observer.username, TEST_USERS.observer.password);
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForTimeout(2000);
    // Should be redirected to observer home or show access denied
    const url = page.url();
    expect(url).not.toContain('/admin/users');
  });

  test('Patient cannot access head-nurse pages', async ({ page }) => {
    await login(page, TEST_USERS.patient.username, TEST_USERS.patient.password);
    await page.goto(`${BASE_URL}/head-nurse/alerts`);
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).not.toContain('/head-nurse');
  });

});
