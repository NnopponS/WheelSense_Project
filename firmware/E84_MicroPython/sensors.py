import math
import time


def _signed(value, bits):
    sign = 1 << (bits - 1)
    return value - (1 << bits) if value & sign else value


def _crc8(data):
    crc = 0xFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class SHT4X:
    ADDRESS = 0x44

    def __init__(self, i2c):
        self.i2c = i2c

    def read(self):
        self.i2c.writeto(self.ADDRESS, b"\xfd")
        time.sleep_ms(10)
        data = self.i2c.readfrom(self.ADDRESS, 6)
        if _crc8(data[0:2]) != data[2] or _crc8(data[3:5]) != data[5]:
            raise OSError("SHT4X CRC mismatch")
        raw_t = (data[0] << 8) | data[1]
        raw_rh = (data[3] << 8) | data[4]
        humidity = max(0.0, min(100.0, -6.0 + 125.0 * raw_rh / 65535.0))
        return -45.0 + 175.0 * raw_t / 65535.0, humidity


class DPS368:
    ADDRESS = 0x77
    SCALE = 524288.0  # 1x oversampling

    def __init__(self, i2c):
        self.i2c = i2c
        if self._read(0x0D, 1)[0] != 0x10:
            raise OSError("DPS368 chip ID mismatch")
        self.coeff = self._coefficients(self._read(0x10, 18))
        temp_source = self._read(0x28, 1)[0] & 0x80
        for register, value in ((0x0E, 0xA5), (0x0F, 0x96), (0x62, 0x02), (0x0E, 0), (0x0F, 0)):
            self._write(register, value)
        self._write(0x07, temp_source)
        self._write(0x06, 0)
        self._write(0x08, 0x07)

    def _read(self, register, count):
        return self.i2c.readfrom_mem(self.ADDRESS, register, count)

    def _write(self, register, value):
        self.i2c.writeto_mem(self.ADDRESS, register, bytes((value,)))

    @staticmethod
    def _coefficients(data):
        return (
            _signed((data[0] << 4) | (data[1] >> 4), 12),
            _signed(((data[1] & 0x0F) << 8) | data[2], 12),
            _signed((data[3] << 12) | (data[4] << 4) | (data[5] >> 4), 20),
            _signed(((data[5] & 0x0F) << 16) | (data[6] << 8) | data[7], 20),
            _signed((data[8] << 8) | data[9], 16),
            _signed((data[10] << 8) | data[11], 16),
            _signed((data[12] << 8) | data[13], 16),
            _signed((data[14] << 8) | data[15], 16),
            _signed((data[16] << 8) | data[17], 16),
        )

    def read(self):
        for _ in range(120):
            if self._read(0x08, 1)[0] & 0x30 == 0x30:
                break
            time.sleep_ms(10)
        else:
            raise OSError("DPS368 data not ready")
        data = self._read(0x00, 6)
        pressure_raw = _signed((data[0] << 16) | (data[1] << 8) | data[2], 24)
        temperature_raw = _signed((data[3] << 16) | (data[4] << 8) | data[5], 24)
        c0, c1, c00, c10, c01, c11, c20, c21, c30 = self.coeff
        temperature_scaled = temperature_raw / self.SCALE
        pressure_scaled = pressure_raw / self.SCALE
        temperature = c0 / 2.0 + c1 * temperature_scaled
        pressure = (
            c00
            + pressure_scaled * (c10 + pressure_scaled * (c20 + pressure_scaled * c30))
            + temperature_scaled * c01
            + temperature_scaled * pressure_scaled * (c11 + pressure_scaled * c21)
        ) * 0.01
        return temperature, pressure


class BMI270:
    ADDRESS = 0x68
    ACCEL_RANGES = (2.0, 4.0, 8.0, 16.0)
    GYRO_RANGES = (2000.0, 1000.0, 500.0, 250.0, 125.0)

    def __init__(self, i2c):
        self.i2c = i2c
        if self._read(0x00, 1)[0] != 0x24:
            raise OSError("BMI270 chip ID mismatch")
        self.accel_range = self.ACCEL_RANGES[self._read(0x41, 1)[0] & 0x03]
        gyro_index = self._read(0x43, 1)[0] & 0x07
        if gyro_index >= len(self.GYRO_RANGES):
            raise OSError("BMI270 gyro range invalid")
        self.gyro_range = self.GYRO_RANGES[gyro_index]

    def _read(self, register, count):
        return self.i2c.readfrom_mem(self.ADDRESS, register, count)

    @staticmethod
    def _le16(data, offset):
        return _signed(data[offset] | (data[offset + 1] << 8), 16)

    def read(self):
        if self._read(0x03, 1)[0] & 0xC0 != 0xC0:
            raise OSError("BMI270 data not ready")
        data = self._read(0x0C, 12)
        accel = tuple(self._le16(data, offset) * self.accel_range / 32768.0 for offset in (0, 2, 4))
        gyro = tuple(self._le16(data, offset) * self.gyro_range / 32768.0 for offset in (6, 8, 10))
        ax, ay, az = accel
        roll = math.degrees(math.atan2(ay, az))
        pitch = math.degrees(math.atan2(-ax, math.sqrt(ay * ay + az * az)))
        return accel, gyro, (roll, pitch)


def self_check():
    assert _signed(0x7FFFFF, 24) == 8388607
    assert _signed(0xFFFFFF, 24) == -1
    assert _crc8(b"\xbe\xef") == 0x92


if __name__ == "__main__":
    self_check()
    print("sensor helpers: PASS")
