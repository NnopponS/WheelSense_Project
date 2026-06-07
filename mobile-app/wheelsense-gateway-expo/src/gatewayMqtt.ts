export type GatewayMqttPayload = Record<string, unknown>;

export type GatewayMqttMessage = {
  topic: string;
  payload: GatewayMqttPayload;
  receivedAt: Date;
};

type GatewayMqttClientOptions = {
  clientId: string;
  username?: string;
  password?: string;
  onMessage?: (message: GatewayMqttMessage) => void;
  onStatus?: (message: string) => void;
};

const MQTT_PROTOCOL_LEVEL = 4;
const KEEP_ALIVE_SECONDS = 30;
const PUBLIC_EMQX_WS_URL = 'ws://broker.emqx.io:8083/mqtt';

export class GatewayMqttClient {
  private socket?: WebSocket;
  private packetId = 1;
  private connected = false;
  private pingTimer?: ReturnType<typeof setInterval>;
  private readonly url: string;

  constructor(
    url: string,
    private readonly options: GatewayMqttClientOptions,
  ) {
    this.url = normalizeMqttWebSocketUrl(url);
  }

  get isConnected() {
    return this.connected && this.socket?.readyState === WebSocket.OPEN;
  }

  connect(timeoutMs = 12000): Promise<void> {
    this.disconnect();

    // Re-normalize at connection time so stale AsyncStorage values
    // (e.g. ws://broker.emqx.io:1883/mqtt) are always corrected to port 8083.
    const resolvedUrl = normalizeMqttWebSocketUrl(this.url);

    if (!/^wss?:\/\//i.test(resolvedUrl)) {
      return Promise.reject(
        new Error(
          'Mobile MQTT must use a WebSocket URL. For EMQX use ws://broker.emqx.io:8083/mqtt; server TCP 1883 is not available to this mobile client.',
        ),
      );
    }

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(resolvedUrl, 'mqtt');
      this.socket = socket;
      socket.binaryType = 'arraybuffer';

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        this.disconnect();
        reject(new Error(`MQTT connection timed out after ${timeoutMs} ms`));
      }, timeoutMs);

      socket.onopen = () => {
        this.emitStatus('WebSocket opened');
        socket.send(this.connectPacket());
      };

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(
            new Error(
              `MQTT WebSocket error for ${resolvedUrl}. Check that ${resolvedUrl} is reachable. Public EMQX endpoint: ws://broker.emqx.io:8083/mqtt (port 8083, not 1883).`,
            ),
          );
        }
      };

      socket.onclose = () => {
        this.connected = false;
        this.stopPing();
        this.emitStatus('MQTT socket closed');
      };

      socket.onmessage = async (event) => {
        const bytes = await toBytes(event.data);
        const packetType = bytes[0] >> 4;

        if (packetType === 2) {
          const accepted = bytes.length >= 4 && bytes[3] === 0;
          if (!accepted) {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              reject(new Error(`MQTT broker rejected connection code ${bytes[3]}`));
            }
            return;
          }
          this.connected = true;
          this.startPing();
          this.emitStatus('MQTT connected');
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve();
          }
          return;
        }

        if (packetType === 3) {
          const parsed = parsePublish(bytes);
          if (parsed) {
            this.options.onMessage?.({
              topic: parsed.topic,
              payload: decodeJsonPayload(parsed.payload),
              receivedAt: new Date(),
            });
          }
        }
      };
    });
  }

  subscribe(topic: string) {
    if (!this.isConnected || !this.socket) {
      throw new Error('MQTT is not connected');
    }
    const id = this.nextPacketId();
    const variableHeader = [id >> 8, id & 0xff];
    const payload = [...encodeMqttString(topic), 0];
    this.socket.send(packet(0x82, [...variableHeader, ...payload]));
  }

  publish(topic: string, payload: GatewayMqttPayload) {
    if (!this.isConnected || !this.socket) {
      throw new Error('MQTT is not connected');
    }
    const body = utf8Bytes(JSON.stringify(payload));
    this.socket.send(packet(0x30, [...encodeMqttString(topic), ...body]));
  }

  disconnect() {
    this.connected = false;
    this.stopPing();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(new Uint8Array([0xe0, 0]));
    }
    this.socket?.close();
    this.socket = undefined;
  }

  private connectPacket() {
    let flags = 0x02;
    const payload = [encodeMqttString(this.options.clientId)];
    if (this.options.username) {
      flags |= 0x80;
      payload.push(encodeMqttString(this.options.username));
    }
    if (this.options.password) {
      flags |= 0x40;
      payload.push(encodeMqttString(this.options.password));
    }

    const variableHeader = [
      ...encodeMqttString('MQTT'),
      MQTT_PROTOCOL_LEVEL,
      flags,
      KEEP_ALIVE_SECONDS >> 8,
      KEEP_ALIVE_SECONDS & 0xff,
    ];
    return packet(0x10, [...variableHeader, ...payload.flat()]);
  }

  private nextPacketId() {
    this.packetId = this.packetId >= 65535 ? 1 : this.packetId + 1;
    return this.packetId;
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.isConnected) {
        this.socket?.send(new Uint8Array([0xc0, 0]));
      }
    }, 25000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  private emitStatus(message: string) {
    this.options.onStatus?.(message);
  }
}

export function normalizeMqttWebSocketUrl(value: string) {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase().replace(/\/+$/, '');

  if (
    lower === 'broker.emqx.io' ||
    lower === 'broker.emqx.io:1883' ||
    lower === 'broker.emqx.io:1883/mqtt' ||
    lower === 'mqtt://broker.emqx.io' ||
    lower === 'mqtt://broker.emqx.io:1883' ||
    lower === 'mqtt://broker.emqx.io:1883/mqtt' ||
    lower === 'tcp://broker.emqx.io' ||
    lower === 'tcp://broker.emqx.io:1883' ||
    lower === 'tcp://broker.emqx.io:1883/mqtt' ||
    lower === 'ws://broker.emqx.io' ||
    lower === 'ws://broker.emqx.io:1883' ||
    lower === 'ws://broker.emqx.io:1883/mqtt' ||
    lower === 'ws://broker.emqx.io:8083' ||
    lower === 'ws://broker.emqx.io:8083/mqtt'
  ) {
    return PUBLIC_EMQX_WS_URL;
  }

  if (
    lower === 'wss://broker.emqx.io' ||
    lower === 'wss://broker.emqx.io:8084' ||
    lower === 'wss://broker.emqx.io:8084/mqtt'
  ) {
    return 'wss://broker.emqx.io:8084/mqtt';
  }

  return trimmed;
}

function packet(type: number, body: number[]) {
  return new Uint8Array([type, ...remainingLength(body.length), ...body]);
}

function remainingLength(length: number) {
  const encoded: number[] = [];
  let value = length;
  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) {
      byte |= 128;
    }
    encoded.push(byte);
  } while (value > 0);
  return encoded;
}

function encodeMqttString(value: string) {
  const bytes = utf8Bytes(value);
  return [bytes.length >> 8, bytes.length & 0xff, ...bytes];
}

function parsePublish(bytes: Uint8Array) {
  const remaining = decodeRemainingLength(bytes, 1);
  let offset = 1 + remaining.bytesUsed;
  const topicLength = (bytes[offset] << 8) + bytes[offset + 1];
  offset += 2;
  const topic = utf8String(bytes.slice(offset, offset + topicLength));
  offset += topicLength;
  const payloadEnd = offset + remaining.value - 2 - topicLength;
  return {
    topic,
    payload: utf8String(bytes.slice(offset, payloadEnd)),
  };
}

function decodeRemainingLength(bytes: Uint8Array, start: number) {
  let multiplier = 1;
  let value = 0;
  let bytesUsed = 0;
  let encodedByte = 0;
  do {
    encodedByte = bytes[start + bytesUsed];
    value += (encodedByte & 127) * multiplier;
    multiplier *= 128;
    bytesUsed += 1;
  } while ((encodedByte & 128) !== 0);
  return { value, bytesUsed };
}

function decodeJsonPayload(raw: string): GatewayMqttPayload {
  try {
    const decoded = JSON.parse(raw);
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
      return decoded as GatewayMqttPayload;
    }
  } catch {
    return { raw };
  }
  return { raw };
}

async function toBytes(data: unknown): Promise<Uint8Array> {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer);
  }
  if (data && typeof (data as Blob).arrayBuffer === 'function') {
    return new Uint8Array(await (data as Blob).arrayBuffer());
  }
  return new Uint8Array(utf8Bytes(String(data ?? '')));
}

export function utf8Bytes(value: string) {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    const char = encoded[index];
    if (char === '%') {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(char.charCodeAt(0));
    }
  }
  return bytes;
}

export function utf8String(bytes: Uint8Array) {
  let encoded = '';
  for (const byte of bytes) {
    if (byte < 0x80) {
      encoded += String.fromCharCode(byte);
    } else {
      encoded += `%${byte.toString(16).padStart(2, '0')}`;
    }
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}
