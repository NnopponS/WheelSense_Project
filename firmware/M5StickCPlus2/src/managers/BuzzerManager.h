#ifndef BUZZER_MANAGER_H
#define BUZZER_MANAGER_H

#include <M5StickCPlus2.h>

class BuzzerManager {
public:
    BuzzerManager();
    
    void beep(int freq, int durationMs);
    void beepSuccess();
    void beepError();
    void beepButton();
    void beepCalibrating();
    
private:
    static const int TONE_BUTTON_FREQ = 2000;
    static const int TONE_BUTTON_MS = 100;
    static const int TONE_SUCCESS_FREQ = 2200;
    static const int TONE_SUCCESS_MS = 150;
    static const int TONE_ERROR_FREQ = 800;
    static const int TONE_ERROR_MS = 300;
    static const int TONE_CALIBRATING_FREQ = 1500;
    static const int TONE_CALIBRATING_MS = 500;
};

extern BuzzerManager BuzzerMgr;

#endif
