    /* Boundary-converted int8 model, SHA256 2526FBA2A0C065677857DA9E56763007CEE5AA2D8F7303914CFF905FC100FD09. */
    .section .rodata.sitting_mnet025_model, "a", %progbits
    .balign 16
    .global sitting_mnet025_model_bin
    .type sitting_mnet025_model_bin, %object
sitting_mnet025_model_bin:
    .incbin "apps/production/models/sitting_mnet025_int8.tflite"
    .size sitting_mnet025_model_bin, . - sitting_mnet025_model_bin
