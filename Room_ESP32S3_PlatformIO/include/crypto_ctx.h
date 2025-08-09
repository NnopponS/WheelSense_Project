#pragma once

extern "C" {
  #include "aes.h"   // tiny-AES-c
}

// AES context & key accessor
extern AES_ctx aes_ctx;
void initCrypto();