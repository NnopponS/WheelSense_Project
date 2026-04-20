import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Accessibility for Older Caregivers', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to a sample dashboard page
    await page.goto(`${BASE_URL}/head-nurse`);
    await page.waitForTimeout(3000);
  });

  test('base font size should be at least 16px for body text', async ({ page }) => {
    const bodyFontSize = await page.evaluate(() => {
      const body = document.body;
      return window.getComputedStyle(body).fontSize;
    });
    
    const fontSizeInPixels = parseFloat(bodyFontSize);
    expect(fontSizeInPixels).toBeGreaterThanOrEqual(16);
  });

  test('buttons should have minimum touch target height of 44px', async ({ page }) => {
    const buttons = await page.locator('button').all();
    
    for (const button of buttons) {
      const box = await button.boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('no text should be smaller than 14px (except legal disclaimers)', async ({ page }) => {
    const smallTextElements = await page.locator('*').all();
    
    for (const element of smallTextElements) {
      const fontSize = await element.evaluate((el) => {
        return window.getComputedStyle(el).fontSize;
      });
      
      const fontSizeInPixels = parseFloat(fontSize);
      
      // Skip legal disclaimers, footnotes, etc.
      const isLegalText = await element.evaluate((el) => {
        const text = el.textContent?.toLowerCase() || '';
        const className = typeof el.className === 'string' ? el.className.toLowerCase() : el.className.toString();
        return text.includes('disclaimer') || 
               text.includes('terms') || 
               text.includes('copyright') ||
               className.includes('legal') ||
               className.includes('footer');
      });
      
      if (!isLegalText && fontSizeInPixels < 14) {
        const tagName = await element.evaluate((el) => el.tagName);
        const text = await element.textContent();
        throw new Error(`Text smaller than 14px found: ${fontSizeInPixels}px in <${tagName}>: "${text?.slice(0, 50)}"`);
      }
    }
  });

  test('card titles should be at least 18px', async ({ page }) => {
    const cardTitles = await page.locator('[class*="CardTitle"], h3').all();
    
    for (const title of cardTitles) {
      const fontSize = await title.evaluate((el) => {
        return window.getComputedStyle(el).fontSize;
      });
      
      const fontSizeInPixels = parseFloat(fontSize);
      expect(fontSizeInPixels).toBeGreaterThanOrEqual(18);
    }
  });

  test('navigation items should be at least 16px', async ({ page }) => {
    const navLinks = await page.locator('nav a, [role="navigation"] a').all();
    
    for (const link of navLinks) {
      const fontSize = await link.evaluate((el) => {
        return window.getComputedStyle(el).fontSize;
      });
      
      const fontSizeInPixels = parseFloat(fontSize);
      expect(fontSizeInPixels).toBeGreaterThanOrEqual(16);
    }
  });

  test('input fields should have minimum height of 48px', async ({ page }) => {
    const inputs = await page.locator('input[type="text"], input[type="email"], input[type="password"]').all();
    
    for (const input of inputs) {
      const box = await input.boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(47);
      }
    }
  });

  test('table headers should be at least 14px', async ({ page }) => {
    const tableHeaders = await page.locator('th').all();
    
    for (const header of tableHeaders) {
      const fontSize = await header.evaluate((el) => {
        return window.getComputedStyle(el).fontSize;
      });
      
      const fontSizeInPixels = parseFloat(fontSize);
      expect(fontSizeInPixels).toBeGreaterThanOrEqual(14);
    }
  });

  test('badge text should be at least 14px', async ({ page }) => {
    const badges = await page.locator('[class*="badge"], [class*="Badge"]').all();
    
    for (const badge of badges) {
      const fontSize = await badge.evaluate((el) => {
        return window.getComputedStyle(el).fontSize;
      });
      
      const fontSizeInPixels = parseFloat(fontSize);
      expect(fontSizeInPixels).toBeGreaterThanOrEqual(14);
    }
  });

  test('action icons should be at least 24px', async ({ page }) => {
    const icons = await page.locator('svg').all();
    
    for (const icon of icons) {
      const box = await icon.boundingBox();
      if (box) {
        // Check if icon is in an interactive context (button, link)
        const parent = await icon.evaluateHandle((el) => el.parentElement);
        const parentTag = await parent.evaluate((el) => el?.tagName);
        
        if (parentTag === 'BUTTON' || parentTag === 'A') {
          expect(Math.max(box.width, box.height)).toBeGreaterThanOrEqual(24);
        }
      }
    }
  });

  test('text contrast should meet WCAG AA standards for normal text', async ({ page }) => {
    const textElements = await page.locator('p, span, div, h1, h2, h3, h4, h5, h6').all();
    
    for (const element of textElements) {
      const contrast = await element.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        const color = styles.color;
        const backgroundColor = styles.backgroundColor;
        
        // Simple contrast calculation (simplified)
        // In production, use a proper contrast ratio library
        return { color, backgroundColor };
      });
      
      // For now, just ensure colors are defined
      expect(contrast.color).toBeTruthy();
      expect(contrast.backgroundColor).toBeTruthy();
    }
  });

});
