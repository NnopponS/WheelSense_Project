import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function Modal() {
    const { modalOpen, closeModal, modalContent } = useApp();

    // Add animation styles to document
    useEffect(() => {
        const styleId = 'modal-animation-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                @keyframes slideUp {
                    from { 
                        transform: translateY(20px); 
                        opacity: 0; 
                    }
                    to { 
                        transform: translateY(0); 
                        opacity: 1; 
                    }
                }
                .modal-content-animated {
                    animation: slideUp 0.3s ease-out;
                }
            `;
            document.head.appendChild(style);
        }
    }, []);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (modalOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [modalOpen]);

    if (!modalOpen) return null;

    console.log('[Modal] Rendering modal, content:', modalContent);

    return (
        <div 
            className="modal-overlay" 
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                backdropFilter: 'blur(4px)'
            }} 
            onClick={(e) => {
                console.log('[Modal] Overlay clicked');
                if (e.target === e.currentTarget) {
                    closeModal();
                }
            }}
        >
            <div 
                className="modal-content modal-content-animated" 
                style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '0',
                    maxWidth: '90%',
                    maxHeight: '90vh',
                    overflow: 'auto',
                    boxShadow: 'var(--shadow-xl)',
                    position: 'relative',
                    zIndex: 10001
                }} 
                onClick={e => {
                    console.log('[Modal] Content clicked, stopping propagation');
                    e.stopPropagation();
                }}
            >
                <button
                    onClick={(e) => {
                        console.log('[Modal] Close button clicked');
                        e.stopPropagation();
                        closeModal();
                    }}
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: '1rem',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        zIndex: 10,
                        padding: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <X size={20} />
                </button>
                {modalContent}
            </div>
        </div>
    );
}
