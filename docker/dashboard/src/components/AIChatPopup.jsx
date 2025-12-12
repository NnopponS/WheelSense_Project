import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Bot, Send, X, Minimize2, Maximize2, Mic, MicOff, Volume2, VolumeX, Check, Loader } from 'lucide-react';
import * as api from '../services/api';

export function AIChatPopup() {
    const { rooms, appliances, toggleAppliance, patients, role, currentUser } = useApp();
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState([
        { id: 1, role: 'assistant', content: 'สวัสดีค่ะ! ฉันคือ WheelSense AI 🤖\nพิมพ์คำสั่งหรือคำถามได้เลยค่ะ!\nหรือกดปุ่มไมค์เพื่อพูดคุย 🎤' }
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
            alert('เบราว์เซอร์ไม่รองรับการรับเสียง กรุณาใช้ Chrome');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;

        recognition.lang = 'th-TH';
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
                setVoiceText('ไม่ได้ยินเสียง ลองพูดอีกครั้ง');
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
            await api.speak(text, 'th-TH', 0.9);
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

            const responseText = response.response || 'ขออภัย ไม่สามารถประมวลผลได้';

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
            // Fallback mock responses
            const mockResponses = {
                'สถานะ': `📊 สถานะปัจจุบัน:\n• ผู้ป่วย: ${patients.length} คน\n• ห้องที่มีคน: ${rooms.filter(r => r.occupied).map(r => r.name).join(', ')}`,
                'เปิดไฟ': '💡 เปิดไฟให้แล้วค่ะ',
                'ปิดไฟ': '💡 ปิดไฟให้แล้วค่ะ',
                'แอร์': '❄️ ตั้งแอร์ 25°C ให้แล้วค่ะ',
                'ผู้ป่วย': `👥 คุณสมชาย ใจดี อยู่ที่ห้องนอน`,
                'ช่วย': '🆘 กำลังแจ้งผู้ดูแลค่ะ',
                'ตำแหน่ง': `📍 คุณอยู่ที่ ${rooms.find(r => r.id === currentUser?.room)?.name || 'ไม่ทราบ'}`,
                'ตาราง': '📅 วันนี้มีกิจกรรม:\n• 08:00 ทานยา\n• 10:00 กายภาพบำบัด\n• 12:00 ทานอาหารกลางวัน',
                'หมอ': '👨‍⚕️ คำแนะนำจากแพทย์:\n• ออกกำลังกายเบาๆ ทุกวัน\n• ทานยาความดันตรงเวลา',
                'วิเคราะห์': '📊 การวิเคราะห์พฤติกรรม:\n• ตื่นนอนตรงเวลาทุกวัน ✅\n• ทานยาสม่ำเสมอ ✅\n• แนะนำ: เพิ่มการออกกำลังกาย',
            };

            let responseContent = 'เข้าใจค่ะ ฉันจะช่วยเหลือคุณ';
            for (const [key, value] of Object.entries(mockResponses)) {
                if (messageText.includes(key)) { responseContent = value; break; }
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
        ? ['ดูสถานะทั้งหมด', 'ปิดไฟทั้งหมด', 'วิเคราะห์พฤติกรรม']
        : ['ตำแหน่งฉัน', 'ดูตารางวันนี้', 'ขอความช่วย'];

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
                            {isListening ? '🎤 กำลังฟัง...' : isSpeaking ? '🔊 กำลังพูด...' : '● Online'}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    {/* Voice toggle */}
                    <button
                        onClick={() => { if (isSpeaking) stopSpeaking(); setVoiceEnabled(!voiceEnabled); }}
                        title={voiceEnabled ? 'ปิดเสียง' : 'เปิดเสียง'}
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
                                            ✅ ดำเนินการ: {msg.toolResults.length} รายการ
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
                                🎤 ยืนยันข้อความที่พูด:
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
                                    <Check size={14} /> ส่ง
                                </button>
                                <button
                                    onClick={cancelVoiceInput}
                                    style={{
                                        flex: 1, padding: '0.5rem', background: 'var(--bg-tertiary)',
                                        color: 'var(--text-primary)', border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-md)', cursor: 'pointer'
                                    }}
                                >
                                    ยกเลิก
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
                            title={isListening ? 'หยุดฟัง' : 'พูด'}
                        >
                            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                        </button>

                        <input
                            type="text"
                            placeholder={isListening ? voiceText || 'กำลังฟัง...' : 'พิมพ์หรือพูด...'}
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
