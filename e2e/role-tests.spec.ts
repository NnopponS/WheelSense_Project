import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:8000';

// Test credentials for each role (usernames preserved from seed data;
// roles are canonical after the role-rename migration).
const TEST_USERS = {
  admin: { username: 'ada.m', password: 'ada.m', role: 'admin' },
  head_caregiver: { username: 'helen.b', password: 'helen.b', role: 'head_caregiver' },
  caregiver: { username: 'nina.p', password: 'nina.p', role: 'caregiver' },
  patient: { username: 'daniel.c', password: 'daniel.c', role: 'patient' },
};

async function login(page: Page, username: string, password: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByRole('textbox', { name: 'Username' }).fill(username);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

async function checkPageLoaded(page: Page, expectedPath: string) {
  await expect(page).toHaveURL(new RegExp(expectedPath));
  await expect(page.getByRole('main')).toBeVisible();
}

test.describe('Role-Based Access Tests', () => {

  test('Admin - Dashboard access', async ({ page }) => {
    await login(page, TEST_USERS.admin.username, TEST_USERS.admin.password);
    await checkPageLoaded(page, '/admin');
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

  test('Head Caregiver - Dashboard access', async ({ page }) => {
    await login(page, TEST_USERS.head_caregiver.username, TEST_USERS.head_caregiver.password);
    await checkPageLoaded(page, '/head-caregiver');
  });

  test('Head Caregiver - Emergency page', async ({ page }) => {
    await login(page, TEST_USERS.head_caregiver.username, TEST_USERS.head_caregiver.password);
    await page.goto(`${BASE_URL}/head-caregiver/emergency`);
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/emergency|alerts?|critical/);
  });

  test('Head Caregiver - Monitoring page', async ({ page }) => {
    await login(page, TEST_USERS.head_caregiver.username, TEST_USERS.head_caregiver.password);
    await page.goto(`${BASE_URL}/head-caregiver/floorplans`);
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/floor|map|location|zone/);
  });

  test('Caregiver - Dashboard access', async ({ page }) => {
    await login(page, TEST_USERS.caregiver.username, TEST_USERS.caregiver.password);
    await checkPageLoaded(page, '/caregiver');
  });

  test('Caregiver - Floorplan page', async ({ page }) => {
    await login(page, TEST_USERS.caregiver.username, TEST_USERS.caregiver.password);
    await page.goto(`${BASE_URL}/caregiver/floorplans`);
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/floorplan|map|layout/);
  });

  test('Patient - Dashboard access', async ({ page }) => {
    await login(page, TEST_USERS.patient.username, TEST_USERS.patient.password);
    await checkPageLoaded(page, '/patient');
  });

});

test.describe('Login Page Tests', () => {

  test('Login page loads correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page).toHaveTitle('Ease AI — Smart Wheelchair Care Platform');
    await expect(page.getByRole('textbox', { name: 'Username' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('Invalid credentials show error', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByRole('textbox', { name: 'Username' }).fill('invalid_user');
    await page.getByRole('textbox', { name: 'Password' }).fill('wrong_password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText(/invalid|error|incorrect|failed/i)).toBeVisible();
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

  test('Caregiver cannot access admin pages', async ({ page }) => {
    await login(page, TEST_USERS.caregiver.username, TEST_USERS.caregiver.password);
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForTimeout(2000);
    // Should be redirected to caregiver home or show access denied
    const url = page.url();
    expect(url).not.toContain('/admin/users');
  });

  test('Patient cannot access head-caregiver pages', async ({ page }) => {
    await login(page, TEST_USERS.patient.username, TEST_USERS.patient.password);
    await page.goto(`${BASE_URL}/head-caregiver/emergency`);
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).not.toContain('/head-caregiver');
  });

});
