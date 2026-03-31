#ifndef BUZZER_MANAGER_H
#define BUZZER_MANAGER_H

#include <M5StickCPlus2.h>

class BuzzerManager {
public:
    BuzzerManager();
    void begin();

    void beep(int freq, int durationMs);
    void beepButton();
    void beepSuccess();
    void beepError();
    void beepStartRecord();
    void beepStopRecord();
    
private:
    static const int TONE_BUTTON_FREQ = 2000;
    static const int TONE_BUTTON_MS = 80;
    static const int TONE_SUCCESS_FREQ = 2200;
    static const int TONE_SUCCESS_MS = 150;
    static const int TONE_ERROR_FREQ = 800;
    static const int TONE_ERROR_MS = 300;
};

extern BuzzerManager BuzzerMgr;

#endif
