import React from 'react';

/**
 * Subtle loading indicator for translation pending state
 * Shows a small, unobtrusive indicator when translations are being loaded
 */
export function TranslationLoadingIndicator({ isPending }) {
    if (!isPending) return null;

    return (
        <div 
            className="translation-loading-indicator"
            style={{
                position: 'fixed',
                top: '1rem',
                right: '1rem',
                zIndex: 1000,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '0.5rem 0.75rem',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                opacity: 0.9,
                pointerEvents: 'none',
                transition: 'opacity 0.2s ease',
            }}
        >
            <div 
                className="loading-spinner"
                style={{
                    width: '12px',
                    height: '12px',
                    border: '2px solid var(--border-color)',
                    borderTopColor: 'var(--primary-500)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                }}
            />
            <span>Translating...</span>
        </div>
    );
}

