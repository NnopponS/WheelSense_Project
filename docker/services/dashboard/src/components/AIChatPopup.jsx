import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { Bot, Send, X, Minimize2, Maximize2, Mic, MicOff, Volume2, VolumeX, Check, Loader, MessageSquarePlus } from 'lucide-react';
import * as api from '../services/api';

// Helper to detect if text is Thai
function isThaiText(text) {
    // Thai Unicode range: \u0E00-\u0E7F
    const thaiPattern = /[\u0E00-\u0E7F]/;
    return thaiPattern.test(text);
}

// API function to translate text using deep-translator (only for AI chat)
async function translateForAI(text, fromLang, toLang) {
    try {
        const result = await api.translateText(text, fromLang, toLang);
        return result.translated || text;
    } catch (error) {
        console.error('[AIChatPopup] Translation failed:', error);
        return text;
    }
}

// Generate unique session ID
function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function AIChatPopup() {
    const { rooms, appliances, toggleAppliance, patients, role, currentUser, language, registerChatMessageCallback } = useApp();
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    
    // Draggable position state
    const [position, setPosition] = useState(() => {
        // Load position from localStorage or use default
        const stored = localStorage.getItem('wheelsense_ai_chat_position');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                return { x: parsed.x, y: parsed.y };
            } catch (e) {
                return null; // Default position
            }
        }
        return null; // Default position (bottom: 24px, right: 24px)
    });
    
    // Drag state
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const elementStartPos = useRef({ x: 0, y: 0 });
    
    // Save position to localStorage when it changes
    useEffect(() => {
        if (position) {
            localStorage.setItem('wheelsense_ai_chat_position', JSON.stringify(position));
        }
    }, [position]);

    // Session management
    const [sessionId, setSessionId] = useState(() => {
        // Load session ID from localStorage or generate new one
        const stored = localStorage.getItem('wheelsense_chat_session_id');
        return stored || generateSessionId();
    });
    
    // Save session ID to localStorage when it changes
    useEffect(() => {
        localStorage.setItem('wheelsense_chat_session_id', sessionId);
    }, [sessionId]);

    // Welcome messages in both languages
    const welcomeEN = 'Hello! I am WheelSense AI 🤖\nType commands or questions!\nOr click the microphone button to chat 🎤';
    const welcomeTH = 'สวัสดี! ฉันคือ WheelSense AI 🤖\nพิมพ์คำสั่งหรือคำถาม!\nหรือกดปุ่มไมโครโฟนเพื่อพูดคุย 🎤';

    const [messages, setMessages] = useState([
        { id: 1, role: 'assistant', content: language === 'th' ? welcomeTH : welcomeEN }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    // Update welcome message when language changes (static, no API call)
    useEffect(() => {
        setMessages(prev => {
            const updated = [...prev];
            if (updated[0] && updated[0].role === 'assistant' && updated[0].id === 1) {
                updated[0] = { ...updated[0], content: language === 'th' ? welcomeTH : welcomeEN };
            }
            return updated;
        });
    }, [language]);

    // Voice state
    const [isListening, setIsListening] = useState(false);
    const [voiceText, setVoiceText] = useState('');
    const [showVoiceConfirm, setShowVoiceConfirm] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(true);
    const recognitionRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Register callback to receive chat messages from WebSocket
    useEffect(() => {
        if (!registerChatMessageCallback) {
            console.warn('%c⚠️ [AIChatPopup] registerChatMessageCallback not available', 'color: #ffa94d; font-weight: bold;');
            return; // Guard if not available
        }
        
        console.log('%c✅ [AIChatPopup] Registering chat message callback', 'color: #51cf66; font-weight: bold;');
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/124fafc7-2206-4943-b3f5-6f57d1dae272', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({location: 'AIChatPopup.jsx:81', message: 'Registering callback', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'E'})}).catch(()=>{});
        // #endregion
        const cleanup = registerChatMessageCallback((message) => {
            // Always add messages, even when chat is closed (they'll appear when user opens it)
            console.log('%c📩 [AIChatPopup] Received message via callback', 'color: #339af0; font-size: 14px; font-weight: bold;', message);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/124fafc7-2206-4943-b3f5-6f57d1dae272', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({location: 'AIChatPopup.jsx:84', message: 'Callback invoked', data: message, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'E'})}).catch(()=>{});
            // #endregion
            setMessages(prev => {
                // Check if message already exists (avoid duplicates based on content and timing)
                const exists = prev.some(m => 
                    m.role === message.role && 
                    m.content === message.content &&
                    Math.abs((m.id || 0) - (message.id || 0)) < 5000 // Same message within 5 seconds
                );
                if (exists) {
                    console.log('%c⚠️ [AIChatPopup] Duplicate message detected, skipping', 'color: #ffa94d;');
                    return prev;
                }
                console.log('%c✅ [AIChatPopup] Adding notification message to chat', 'color: #51cf66; font-weight: bold;', message.content);
                return [...prev, message];
            });
        });
        
        console.log('%c✅ [AIChatPopup] Chat message callback registered successfully', 'color: #51cf66; font-weight: bold;');
        return cleanup; // Cleanup on unmount
    }, [registerChatMessageCallback]); // Remove isOpen, isMinimized from dependencies

    // Start voice recognition
    const startListening = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert('Browser does not support voice input. Please use Chrome');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;

        // Set language based on current UI language
        recognition.lang = language === 'th' ? 'th-TH' : 'en-US';
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = () => {
            setIsListening(true);
            setVoiceText('');
        };

        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            setVoiceText(transcript);

            // Check if final result
            if (event.results[event.results.length - 1].isFinal) {
                setShowVoiceConfirm(true);
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            setIsListening(false);
            if (event.error === 'no-speech') {
                setVoiceText(language === 'th' ? 'ไม่มีเสียง ลองใหม่อีกครั้ง' : 'No sound detected. Please try again');
            }
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.start();
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        setIsListening(false);
    };

    // Confirm voice input
    const confirmVoiceInput = () => {
        setInput(voiceText);
        setShowVoiceConfirm(false);
        setVoiceText('');
        // Auto-send after confirmation
        setTimeout(() => {
            handleSendWithText(voiceText);
        }, 100);
    };

    const cancelVoiceInput = () => {
        setShowVoiceConfirm(false);
        setVoiceText('');
    };

    // Text-to-Speech
    const speakText = async (text) => {
        if (!voiceEnabled) return;

        try {
            setIsSpeaking(true);
            // Use Thai voice if text is Thai
            const voiceLang = isThaiText(text) ? 'th-TH' : 'en-US';
            await api.speak(text, voiceLang, 0.9);
        } catch (error) {
            console.error('TTS error:', error);
        } finally {
            setIsSpeaking(false);
        }
    };

    const stopSpeaking = () => {
        api.stopSpeaking();
        setIsSpeaking(false);
    };

    const handleSendWithText = async (textToSend) => {
        const messageText = textToSend || input;
        if (!messageText.trim() || isLoading) return;

        const userMessage = { id: Date.now(), role: 'user', content: messageText };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            // Detect if user is speaking Thai
            const userSpeaksThai = isThaiText(messageText);
            console.log('[AIChatPopup] User language detected:', userSpeaksThai ? 'Thai' : 'English');

            // Prepare the message for AI
            let messageForAI = messageText;

            // If user speaks Thai, translate to English for backend processing
            if (userSpeaksThai) {
                console.log('[AIChatPopup] Translating Thai input to English...');
                messageForAI = await translateForAI(messageText, 'th', 'en');
                console.log('[AIChatPopup] Translated to:', messageForAI);
            }

            // Add language instruction to the prompt
            const languagePrompt = userSpeaksThai
                ? 'The user is speaking Thai. Please respond in Thai (ภาษาไทย). '
                : 'The user is speaking English. Please respond in English. ';

            const fullMessage = languagePrompt + messageForAI;

            const response = await api.chat(
                [{ role: 'user', content: fullMessage }],
                ['control_appliance', 'get_room_status', 'get_user_location', 'set_scene', 'send_emergency',
                    'get_user_routines', 'add_routine', 'analyze_behavior', 'get_doctor_notes']
            );

            let responseText = response.response || 'Sorry, unable to process';

            // Check if response contains error message
            if (responseText.includes('Error:') || responseText.includes('error:')) {
                throw new Error(responseText);
            }

            // If user spoke Thai but AI responded in English, translate the response
            let finalResponseText = responseText;
            if (userSpeaksThai && !isThaiText(responseText)) {
                console.log('[AIChatPopup] AI responded in English, translating to Thai...');
                finalResponseText = await translateForAI(responseText, 'en', 'th');
                console.log('[AIChatPopup] Response translated to Thai');
            }

            const assistantMessage = {
                id: Date.now() + 1,
                role: 'assistant',
                content: finalResponseText,
                toolResults: response.tool_results || []
            };
            setMessages(prev => [...prev, assistantMessage]);

            // Speak the response
            if (voiceEnabled) {
                speakText(finalResponseText);
            }
        } catch (error) {
            console.error('Chat API error:', error);

            // Extract error message
            const errorMessage = error.message || 'Unknown error';
            const lowerErrorMessage = errorMessage.toLowerCase();

            // Detect connection-related errors
            const is404 = lowerErrorMessage.includes('404') || lowerErrorMessage.includes('not found');
            const is503 = lowerErrorMessage.includes('503') || lowerErrorMessage.includes('service unavailable');
            const isConnectionError =
                is404 ||
                is503 ||
                lowerErrorMessage.includes('network') ||
                lowerErrorMessage.includes('fetch') ||
                lowerErrorMessage.includes('ollama');

            // Error messages in both languages
            let responseContent;
            const userSpeaksThai = isThaiText(messageText);

            if (isConnectionError) {
                responseContent = userSpeaksThai
                    ? `⚠️ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ AI ได้\nรายละเอียด: ${errorMessage}\nกรุณาตรวจสอบ backend service แล้วลองใหม่`
                    : `⚠️ Unable to connect to AI server.\nDetails: ${errorMessage}\nPlease check the backend service or your network and try again.`;
            } else {
                responseContent = userSpeaksThai
                    ? `⚠️ AI เกิดข้อผิดพลาด: ${errorMessage}\nกรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ`
                    : `⚠️ AI error: ${errorMessage}\nPlease try again or contact the system administrator.`;
            }

            setMessages(prev => [
                ...prev,
                { id: Date.now() + 1, role: 'assistant', content: responseContent }
            ]);

            if (voiceEnabled) {
                speakText(responseContent);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = () => handleSendWithText(input);

    // Quick actions in both languages
    const quickActionsEN = role === 'admin'
        ? ['View All Status', 'Turn Off All Lights', 'Analyze Behavior']
        : ['My Location', 'View Today Schedule', 'Request Help'];

    const quickActionsTH = role === 'admin'
        ? ['ดูสถานะทั้งหมด', 'ปิดไฟทั้งหมด', 'วิเคราะห์พฤติกรรม']
        : ['ตำแหน่งของฉัน', 'ดูตารางวันนี้', 'ขอความช่วยเหลือ'];

    const quickActions = language === 'th' ? quickActionsTH : quickActionsEN;

    // Drag handlers
    const handleMouseDown = (e) => {
        if (e.button !== 0) return; // Only left mouse button
        e.preventDefault();
        setIsDragging(true);
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        elementStartPos.current = position || { x: window.innerWidth - 84, y: window.innerHeight - 84 };
    };
    
    const handleTouchStart = (e) => {
        const touch = e.touches[0];
        setIsDragging(true);
        dragStartPos.current = { x: touch.clientX, y: touch.clientY };
        elementStartPos.current = position || { x: window.innerWidth - 84, y: window.innerHeight - 84 };
    };
    
    const handleMouseMove = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const deltaX = e.clientX - dragStartPos.current.x;
        const deltaY = e.clientY - dragStartPos.current.y;
        
        let newX = elementStartPos.current.x + deltaX;
        let newY = elementStartPos.current.y + deltaY;
        
        // Keep within viewport bounds
        const maxX = window.innerWidth - 60;
        const maxY = window.innerHeight - 60;
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));
        
        setPosition({ x: newX, y: newY });
    };
    
    const handleTouchMove = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        const deltaX = touch.clientX - dragStartPos.current.x;
        const deltaY = touch.clientY - dragStartPos.current.y;
        
        let newX = elementStartPos.current.x + deltaX;
        let newY = elementStartPos.current.y + deltaY;
        
        // Keep within viewport bounds
        const maxX = window.innerWidth - 60;
        const maxY = window.innerHeight - 60;
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));
        
        setPosition({ x: newX, y: newY });
    };
    
    const handleMouseUp = () => {
        setIsDragging(false);
    };
    
    const handleTouchEnd = () => {
        setIsDragging(false);
    };
    
    // Add global event listeners for dragging
    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('touchmove', handleTouchMove, { passive: false });
            document.addEventListener('touchend', handleTouchEnd);
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.removeEventListener('touchmove', handleTouchMove);
                document.removeEventListener('touchend', handleTouchEnd);
            };
        }
    }, [isDragging]);
    
    // Calculate popup position (same as fab or use position)
    // When position is set, popup appears at bottom-right of fab position
    const popupStyle = position
        ? {
            position: 'fixed',
            left: 'auto',
            top: 'auto',
            right: `${window.innerWidth - position.x - 60}px`,
            bottom: `${window.innerHeight - position.y - 60}px`
        }
        : {};
    
    const fabStyle = position
        ? {
            position: 'fixed',
            left: `${position.x}px`,
            top: `${position.y}px`,
            right: 'auto',
            bottom: 'auto'
        }
        : {};

    if (!isOpen) {
        return (
            <button
                className="ai-fab"
                style={fabStyle}
                onClick={() => setIsOpen(true)}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                title="AI Assistant"
            >
                <Bot size={24} />
                <span className="ai-fab-pulse"></span>
            </button>
        );
    }

    return (
        <div 
            className={`ai-popup ${isMinimized ? 'minimized' : ''}`}
            style={popupStyle}
        >
            {/* Header */}
            <div className="ai-popup-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Bot size={18} color="white" />
                    </div>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>WheelSense AI</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--success-500)' }}>
                            {isListening
                                ? (language === 'th' ? '🎤 กำลังฟัง...' : '🎤 Listening...')
                                : isSpeaking
                                    ? (language === 'th' ? '🔊 กำลังพูด...' : '🔊 Speaking...')
                                    : '● Online'}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    {/* New Chat button */}
                    <button
                        onClick={async () => {
                            if (confirm(language === 'th' ? 'เริ่มการสนทนาใหม่?' : 'Start a new chat?')) {
                                try {
                                    await api.clearChatContext(sessionId);
                                    const newSessionId = generateSessionId();
                                    setSessionId(newSessionId);
                                    setMessages([{ id: 1, role: 'assistant', content: language === 'th' ? welcomeTH : welcomeEN }]);
                                } catch (error) {
                                    console.error('Failed to clear chat context:', error);
                                    // Still clear locally even if API fails
                                    const newSessionId = generateSessionId();
                                    setSessionId(newSessionId);
                                    setMessages([{ id: 1, role: 'assistant', content: language === 'th' ? welcomeTH : welcomeEN }]);
                                }
                            }
                        }}
                        title={language === 'th' ? 'เริ่มการสนทนาใหม่' : 'New Chat'}
                        style={{ color: 'var(--text-muted)' }}
                    >
                        <MessageSquarePlus size={16} />
                    </button>
                    {/* Voice toggle */}
                    <button
                        onClick={() => { if (isSpeaking) stopSpeaking(); setVoiceEnabled(!voiceEnabled); }}
                        title={voiceEnabled ? t('Turn Off Voice') : t('Turn On Voice')}
                        style={{ color: voiceEnabled ? 'var(--primary-500)' : 'var(--text-muted)' }}
                    >
                        {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    </button>
                    <button onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? t('Expand') : t('Minimize')}>
                        {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                    </button>
                    <button onClick={() => setIsOpen(false)} title={t('Close')}>
                        <X size={16} />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    {/* Messages */}
                    <div className="ai-popup-messages">
                        {messages.map(msg => (
                            <div key={msg.id} className={`ai-popup-message ${msg.role}`}>
                                {msg.role === 'assistant' && (
                                    <div className="ai-popup-avatar"><Bot size={14} /></div>
                                )}
                                <div className="ai-popup-bubble">
                                    {msg.content.split('\n').map((line, i) => (
                                        <React.Fragment key={i}>{line}<br /></React.Fragment>
                                    ))}
                                    {/* Show tool results if any */}
                                    {msg.toolResults && msg.toolResults.length > 0 && (
                                        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' }}>
                                            ✅ {language === 'th' ? 'ดำเนินการแล้ว:' : 'Executed:'} {msg.toolResults.length} {language === 'th' ? 'รายการ' : 'items'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="ai-popup-message assistant">
                                <div className="ai-popup-avatar"><Bot size={14} /></div>
                                <div className="ai-popup-bubble">
                                    <div className="typing-dots">
                                        <span></span><span></span><span></span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Voice Confirmation Modal */}
                    {showVoiceConfirm && (
                        <div style={{
                            position: 'absolute',
                            bottom: 120,
                            left: 16,
                            right: 16,
                            background: 'var(--card-bg)',
                            border: '1px solid var(--primary-500)',
                            borderRadius: 'var(--radius-lg)',
                            padding: '1rem',
                            boxShadow: 'var(--shadow-lg)'
                        }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                🎤 {language === 'th' ? 'ยืนยันข้อความ:' : 'Confirm spoken message:'}
                            </div>
                            <div style={{ fontWeight: 500, marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                                "{voiceText}"
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={confirmVoiceInput}
                                    style={{
                                        flex: 1, padding: '0.5rem', background: 'var(--success-500)',
                                        color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem'
                                    }}
                                >
                                    <Check size={14} /> {language === 'th' ? 'ส่ง' : 'Send'}
                                </button>
                                <button
                                    onClick={cancelVoiceInput}
                                    style={{
                                        flex: 1, padding: '0.5rem', background: 'var(--bg-tertiary)',
                                        color: 'var(--text-primary)', border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-md)', cursor: 'pointer'
                                    }}
                                >
                                    {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Quick Actions */}
                    <div className="ai-popup-quick">
                        {quickActions.map((action, i) => (
                            <button key={i} onClick={() => { setInput(action); }}>
                                {action}
                            </button>
                        ))}
                    </div>

                    {/* Input with Voice */}
                    <div className="ai-popup-input">
                        {/* Mic Button */}
                        <button
                            onClick={isListening ? stopListening : startListening}
                            disabled={isLoading}
                            style={{
                                background: isListening ? 'var(--danger-500)' : 'var(--bg-tertiary)',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                padding: '0.5rem',
                                cursor: 'pointer',
                                color: isListening ? 'white' : 'var(--text-primary)',
                                animation: isListening ? 'pulse 1s infinite' : 'none'
                            }}
                            title={isListening ? (language === 'th' ? 'หยุดฟัง' : 'Stop Listening') : (language === 'th' ? 'พูด' : 'Speak')}
                        >
                            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                        </button>

                        <input
                            type="text"
                            placeholder={isListening
                                ? (voiceText || (language === 'th' ? 'กำลังฟัง...' : 'Listening...'))
                                : (language === 'th' ? 'พิมพ์หรือพูด...' : 'Type or speak...')}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                            disabled={isLoading || isListening}
                            style={{ flex: 1 }}
                        />
                        <button onClick={handleSend} disabled={isLoading || !input.trim()}>
                            {isLoading ? <Loader size={18} className="spin" /> : <Send size={18} />}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
