import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Bot, Send, X, Minimize2, Maximize2, Mic, MicOff, Volume2, VolumeX, Check, Loader } from 'lucide-react';
import * as api from '../services/api';

export function AIChatPopup() {
    const { rooms, appliances, toggleAppliance, patients, role, currentUser } = useApp();
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState([
        { id: 1, role: 'assistant', content: 'Hello! I am WheelSense AI 🤖\nType commands or questions!\nOr click the microphone button to chat 🎤' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

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

    // Start voice recognition
    const startListening = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert('Browser does not support voice input. Please use Chrome');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;

        recognition.lang = 'en-US';
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
                setVoiceText('No sound detected. Please try again');
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
            await api.speak(text, 'en-US', 0.9);
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
            const response = await api.chat(
                [{ role: 'user', content: messageText }],
                ['control_appliance', 'get_room_status', 'get_user_location', 'set_scene', 'send_emergency',
                    'get_user_routines', 'add_routine', 'analyze_behavior', 'get_doctor_notes']
            );

            let responseText = response.response || 'Sorry, unable to process';
            
            // Check if response contains error message (LLM client returns errors as strings)
            if (responseText.includes('Error:') || responseText.includes('error:')) {
                // Treat as error and use fallback
                throw new Error(responseText);
            }

            const assistantMessage = {
                id: Date.now() + 1,
                role: 'assistant',
                content: responseText,
                toolResults: response.tool_results || []
            };
            setMessages(prev => [...prev, assistantMessage]);

            // Speak the response
            if (voiceEnabled) {
                speakText(responseText);
            }
        } catch (error) {
            console.error('Chat API error:', error);
            
            // Extract error message
            const errorMessage = error.message || 'Unknown error';
            const lowerErrorMessage = errorMessage.toLowerCase();
            
            // Check for various error types
            const is404 = lowerErrorMessage.includes('404') || lowerErrorMessage.includes('not found');
            const is503 = lowerErrorMessage.includes('503') || lowerErrorMessage.includes('service unavailable');
            const isConnectionError = is404 || is503 || lowerErrorMessage.includes('network') || lowerErrorMessage.includes('fetch') || lowerErrorMessage.includes('ollama');
            
            // Fallback mock responses
            const mockResponses = {
                'hello': 'Hello! Nice to meet you 😊\nI can help you with many things such as:\n• View patient status\n• Control appliances\n• View current location\n• Request help\nFeel free to ask!',
                'hi': 'Hello! Nice to meet you 😊',
                'status': `📊 Current Status:\n• Patients: ${patients.length} people\n• Occupied Rooms: ${rooms.filter(r => r.occupied).map(r => r.name).join(', ') || 'None'}`,
                'turn on light': '💡 Light turned on',
                'turn off light': '💡 Light turned off',
                'AC': '❄️ AC set to 25°C',
                'patient': `👥 John Doe is in bedroom`,
                'help': '🆘 Notifying caregiver',
                'location': `📍 You are at ${rooms.find(r => r.id === currentUser?.room)?.name || 'Unknown'}`,
                'schedule': '📅 Today activities:\n• 08:00 Take medicine\n• 10:00 Physical therapy\n• 12:00 Lunch',
                'doctor': '👨‍⚕️ Doctor recommendations:\n• Light exercise daily\n• Take blood pressure medication on time',
                'analyze': '📊 Behavior Analysis:\n• Wake up on time every day ✅\n• Take medicine regularly ✅\n• Recommendation: Increase exercise',
            };

            let responseContent = 'Understood, I will help you';
            
            // If it's a connection error, show a helpful message first
            if (isConnectionError) {
                // Use the error message from server if it's in Thai, otherwise use default
                if (errorMessage.includes('unable') || errorMessage.includes('please')) {
                    responseContent = `⚠️ ${errorMessage}\n\nIn the meantime, I can answer basic questions`;
                } else {
                    responseContent = '⚠️ Currently unable to connect to AI server\nPlease check your connection or try again\n\nIn the meantime, I can answer basic questions';
                }
            } else {
                // Check for specific keywords in user message (case-insensitive)
                const lowerMessage = messageText.toLowerCase();
                for (const [key, value] of Object.entries(mockResponses)) {
                    if (lowerMessage.includes(key.toLowerCase())) { 
                        responseContent = value; 
                        break; 
                    }
                }
            }

            setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: responseContent }]);

            if (voiceEnabled) {
                speakText(responseContent);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = () => handleSendWithText(input);

    const quickActions = role === 'admin'
        ? ['View All Status', 'Turn Off All Lights', 'Analyze Behavior']
        : ['My Location', 'View Today Schedule', 'Request Help'];

    if (!isOpen) {
        return (
            <button
                className="ai-fab"
                onClick={() => setIsOpen(true)}
                title="AI Assistant"
            >
                <Bot size={24} />
                <span className="ai-fab-pulse"></span>
            </button>
        );
    }

    return (
        <div className={`ai-popup ${isMinimized ? 'minimized' : ''}`}>
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
                            {isListening ? '🎤 Listening...' : isSpeaking ? '🔊 Speaking...' : '● Online'}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    {/* Voice toggle */}
                    <button
                        onClick={() => { if (isSpeaking) stopSpeaking(); setVoiceEnabled(!voiceEnabled); }}
                        title={voiceEnabled ? 'Turn Off Voice' : 'Turn On Voice'}
                        style={{ color: voiceEnabled ? 'var(--primary-500)' : 'var(--text-muted)' }}
                    >
                        {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    </button>
                    <button onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? 'Expand' : 'Minimize'}>
                        {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                    </button>
                    <button onClick={() => setIsOpen(false)} title="Close">
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
                                            ✅ Executed: {msg.toolResults.length} items
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
                                🎤 Confirm spoken message:
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
                                    <Check size={14} /> Send
                                </button>
                                <button
                                    onClick={cancelVoiceInput}
                                    style={{
                                        flex: 1, padding: '0.5rem', background: 'var(--bg-tertiary)',
                                        color: 'var(--text-primary)', border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-md)', cursor: 'pointer'
                                    }}
                                >
                                    Cancel
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
                            title={isListening ? 'Stop Listening' : 'Speak'}
                        >
                            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                        </button>

                        <input
                            type="text"
                            placeholder={isListening ? voiceText || 'Listening...' : 'Type or speak...'}
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
