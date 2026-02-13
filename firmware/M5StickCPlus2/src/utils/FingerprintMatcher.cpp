#include "FingerprintMatcher.h"

FingerprintMatcher FingerprintMgr;

FingerprintMatcher::FingerprintMatcher() : fingerprintCount(0) {
    for (int i = 0; i < MAX_ROOMS; i++) {
        fingerprints[i].roomName = "";
        fingerprints[i].nodeCount = 0;
        for (int j = 0; j < MAX_FINGERPRINT_NODES; j++) {
            fingerprints[i].nodeRSSI[j] = 0;
        }
        fingerprints[i].timestamp = 0;
    }
}

void FingerprintMatcher::setFingerprintCount(int count) {
    fingerprintCount = (count < 0) ? 0 : ((count > MAX_ROOMS) ? MAX_ROOMS : count);
}

int FingerprintMatcher::getFingerprintCount() const {
    return fingerprintCount;
}

RSSIFingerprint* FingerprintMatcher::getFingerprints() {
    return fingerprints;
}

void FingerprintMatcher::addFingerprint(const RSSIFingerprint& fp) {
    if (fingerprintCount >= MAX_ROOMS) return;
    
    fingerprints[fingerprintCount] = fp;
    fingerprints[fingerprintCount].timestamp = millis();
    fingerprintCount++;
}

void FingerprintMatcher::clearFingerprints() {
    fingerprintCount = 0;
}

String FingerprintMatcher::matchRoom(const int* nodeIds, const int8_t* rssis, int count) {
    if (fingerprintCount == 0 || count == 0) return "Unknown";
    
    float bestMatch = 999.0f;
    String matchedRoom = "Unknown";
    
    for (int f = 0; f < fingerprintCount; f++) {
        float distance = 0.0f;
        int matchedNodes = 0;
        
        for (int i = 0; i < count; i++) {
            int nodeId = nodeIds[i];
            if (nodeId > 0 && nodeId <= MAX_FINGERPRINT_NODES) {
                int8_t storedRSSI = fingerprints[f].nodeRSSI[nodeId - 1];
                if (storedRSSI != 0) {
                    distance += abs((int)rssis[i] - (int)storedRSSI);
                    matchedNodes++;
                }
            }
        }
        
        if (matchedNodes > 0) {
            distance /= (float)matchedNodes;
            if (distance < bestMatch) {
                bestMatch = distance;
                matchedRoom = fingerprints[f].roomName;
            }
        }
    }
    
    return matchedRoom;
}
