// Test script to verify transformer model is working
// Run this in browser console to test translation

import { translate } from '../services/i18n';

export async function testTranslation() {
    console.log('=== Testing Translation ===');
    
    const testTexts = [
        'Hello',
        'Track status',
        'Patients in system',
        'Live Monitoring', // Should return as-is (English)
    ];
    
    for (const text of testTexts) {
        try {
            console.log(`\nTesting: "${text}"`);
            const result = await translate(text, 'en');
            console.log(`Result: "${result}"`);
        } catch (error) {
            console.error(`Error translating "${text}":`, error);
        }
    }
    
    console.log('\n=== Translation Test Complete ===');
}

// Make it available globally for console testing
if (typeof window !== 'undefined') {
    window.testTranslation = testTranslation;
}
