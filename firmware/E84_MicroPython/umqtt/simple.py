# MicroPython umqtt.simple, MIT license.
# Source commit: 7539711e352edc1180d5bd68abe27a2b34b8f270
import socket
import struct


class MQTTException(Exception):
    pass


def _encode_len(pkt, sz):
    i = 1
    while sz > 0x7F:
        pkt[i] = (sz & 0x7F) | 0x80
        sz >>= 7
        i += 1
    pkt[i] = sz
    return i


class MQTTClient:
    def __init__(
        self,
        client_id,
        server,
        port=0,
        user=None,
        password=None,
        keepalive=0,
        ssl=None,
        ssl_params={},
    ):
        if port == 0:
            port = 8883 if ssl else 1883
        self.client_id = client_id
        self.sock = None
        self.server = server
        self.port = port
        self.ssl = ssl
        self.ssl_params = ssl_params
        self.pid = 0
        self.cb = None
        self.user = user
        self.pswd = password
        self.keepalive = keepalive
        self.lw_topic = None
        self.lw_msg = None
        self.lw_qos = 0
        self.lw_retain = False

    def _send_str(self, s):
        self.sock.write(struct.pack("!H", len(s)))
        self.sock.write(s)

    def _recv_len(self):
        n = 0
        sh = 0
        while True:
            b = self.sock.read(1)[0]
            n |= (b & 0x7F) << sh
            if not b & 0x80:
                return n
            sh += 7

    def set_callback(self, callback):
        self.cb = callback

    def set_last_will(self, topic, msg, retain=False, qos=0):
        assert 0 <= qos <= 2
        assert topic
        self.lw_topic = topic
        self.lw_msg = msg
        self.lw_qos = qos
        self.lw_retain = retain

    def connect(self, clean_session=True, timeout=None):
        if self.sock:
            self.sock.close()
        self.sock = socket.socket()
        self.sock.settimeout(timeout)
        self.sock.connect(socket.getaddrinfo(self.server, self.port)[0][-1])
        premsg = bytearray(b"\x10\0\0\0\0\0")
        msg = bytearray(b"\x04MQTT\x04\x02\0\0")
        size = 10 + 2 + len(self.client_id)
        msg[6] = clean_session << 1
        if self.user:
            size += 2 + len(self.user) + 2 + len(self.pswd)
            msg[6] |= 0xC0
        if self.keepalive:
            assert self.keepalive < 65536
            msg[7] = self.keepalive >> 8
            msg[8] = self.keepalive & 0xFF
        if self.lw_topic:
            size += 2 + len(self.lw_topic) + 2 + len(self.lw_msg)
            msg[6] |= 0x4 | (self.lw_qos & 0x1) << 3 | (self.lw_qos & 0x2) << 3
            msg[6] |= self.lw_retain << 5
        i = _encode_len(premsg, size)
        self.sock.write(premsg, i + 2)
        self.sock.write(msg)
        self._send_str(self.client_id)
        if self.lw_topic:
            self._send_str(self.lw_topic)
            self._send_str(self.lw_msg)
        if self.user:
            self._send_str(self.user)
            self._send_str(self.pswd)
        response = self.sock.read(4)
        assert response[0] == 0x20 and response[1] == 0x02
        if response[3] != 0:
            raise MQTTException(response[3])
        return response[2] & 1

    def disconnect(self):
        self.sock.write(b"\xe0\0")
        self.sock.close()

    def ping(self):
        self.sock.write(b"\xc0\0")

    def publish(self, topic, msg, retain=False, qos=0):
        pkt = bytearray(b"\x30\0\0\0")
        pkt[0] |= qos << 1 | retain
        size = 2 + len(topic) + len(msg) + (2 if qos else 0)
        assert size < 2097152
        i = _encode_len(pkt, size)
        self.sock.write(pkt, i + 1)
        self._send_str(topic)
        if qos:
            self.pid += 1
            pid = self.pid
            struct.pack_into("!H", pkt, 0, pid)
            self.sock.write(pkt, 2)
        self.sock.write(msg)
        if qos == 1:
            while True:
                if self.wait_msg() == 0x40:
                    assert self.sock.read(1) == b"\x02"
                    received = self.sock.read(2)
                    if pid == (received[0] << 8 | received[1]):
                        return
        elif qos == 2:
            raise NotImplementedError

    def subscribe(self, topic, qos=0):
        assert self.cb is not None, "Subscribe callback is not set"
        pkt = bytearray(4)
        pkt[0] = 0x82
        self.pid += 1
        pid = self.pid
        i = _encode_len(pkt, 5 + len(topic))
        self.sock.write(pkt, i + 1)
        struct.pack_into("!H", pkt, 0, pid)
        self.sock.write(pkt, 2)
        self._send_str(topic)
        self.sock.write(bytes((qos,)))
        while True:
            if self.wait_msg() == 0x90:
                response = self.sock.read(4)
                assert (response[1] << 8 | response[2]) == pid
                if response[3] == 0x80:
                    raise MQTTException(0x80)
                return

    def wait_msg(self):
        response = self.sock.read(1)
        self.sock.setblocking(True)
        if response is None:
            return None
        if response == b"":
            raise OSError(-1)
        if response == b"\xd0":
            assert self.sock.read(1)[0] == 0
            return None
        operation = response[0]
        if operation & 0xF0 != 0x30:
            return operation
        size = self._recv_len()
        topic_len = self.sock.read(2)
        topic_len = (topic_len[0] << 8) | topic_len[1]
        topic = self.sock.read(topic_len)
        size -= topic_len + 2
        if operation & 6:
            packet_id = self.sock.read(2)
            size -= 2
        message = self.sock.read(size)
        self.cb(topic, message)
        if operation & 6 == 2:
            self.sock.write(b"\x40\x02" + packet_id)
        elif operation & 6 == 4:
            raise NotImplementedError
        return operation

    def check_msg(self):
        self.sock.setblocking(False)
        return self.wait_msg()
