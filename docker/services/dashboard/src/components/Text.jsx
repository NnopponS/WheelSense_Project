import React from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';

/**
 * Text Component - Use this for all visible UI strings
 * 
 * This component ensures all UI text goes through translation.
 * 
 * @example
 * // ✅ CORRECT - Use Text component
 * <Text>Hello World</Text>
 * 
 * // ❌ WRONG - Hardcoded string
 * <span>Hello World</span>
 * 
 * // ✅ CORRECT - For dynamic strings, use t() hook
 * const { t } = useTranslation(language);
 * <span>{t('Hello World')}</span>
 */
export function Text({ children, ...props }) {
    const { language } = useApp();
    const { t } = useTranslation(language || 'en');
    
    if (typeof children !== 'string') {
        console.warn('[Text] Component expects a string child. Use t() hook for dynamic content.');
        return <span {...props}>{children}</span>;
    }
    
    return <span {...props}>{t(children)}</span>;
}

