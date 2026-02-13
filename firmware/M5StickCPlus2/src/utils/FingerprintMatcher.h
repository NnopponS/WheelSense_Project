#ifndef FINGERPRINT_MATCHER_H
#define FINGERPRINT_MATCHER_H

#include <Arduino.h>

#define MAX_ROOMS 8
#define MAX_FINGERPRINT_NODES 10

struct RSSIFingerprint {
    String roomName;
    uint8_t nodeCount;
    int8_t nodeRSSI[MAX_FINGERPRINT_NODES];  // index = node_id - 1
    unsigned long timestamp;
};

class FingerprintMatcher {
public:
    FingerprintMatcher();
    
    void setFingerprintCount(int count);
    int getFingerprintCount() const;
    RSSIFingerprint* getFingerprints();
    void addFingerprint(const RSSIFingerprint& fp);
    void clearFingerprints();
    
    String matchRoom(const int* nodeIds, const int8_t* rssis, int count);
    
private:
    RSSIFingerprint fingerprints[MAX_ROOMS];
    int fingerprintCount;
};

extern FingerprintMatcher FingerprintMgr;

#endif
