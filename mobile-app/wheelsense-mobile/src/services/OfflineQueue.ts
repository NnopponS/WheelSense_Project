/**
 * OfflineQueue — persists outgoing SOS / action payloads to AsyncStorage
 * when the network is unreachable, and replays them when connectivity returns.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'wheelsense_offline_queue';

export interface QueuedAction {
  id: string;
  type: 'sos_create_alert' | 'create_alert' | 'acknowledge_alert' | 'send_message';
  payload: Record<string, unknown>;
  createdAt: number;
  retries: number;
}

class OfflineQueueService {
  private actions: QueuedAction[] = [];
  private isLoaded = false;

  async load(): Promise<void> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    this.actions = raw ? JSON.parse(raw) : [];
    this.isLoaded = true;
  }

  private async persist(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.actions));
  }

  async enqueue(
    type: QueuedAction['type'],
    payload: Record<string, unknown>,
  ): Promise<QueuedAction> {
    if (!this.isLoaded) await this.load();

    const action: QueuedAction = {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      createdAt: Date.now(),
      retries: 0,
    };
    this.actions.push(action);
    await this.persist();
    return action;
  }

  async dequeue(): Promise<QueuedAction | undefined> {
    if (!this.isLoaded) await this.load();
    if (this.actions.length === 0) return undefined;
    const action = this.actions.shift()!;
    await this.persist();
    return action;
  }

  async peek(): Promise<QueuedAction | undefined> {
    if (!this.isLoaded) await this.load();
    return this.actions[0];
  }

  async requeueFirst(): Promise<void> {
    if (!this.isLoaded) await this.load();
    if (this.actions.length === 0) return;
    const action = this.actions.shift()!;
    action.retries += 1;
    this.actions.push(action);
    await this.persist();
  }

  get pending(): QueuedAction[] {
    return [...this.actions];
  }

  get length(): number {
    return this.actions.length;
  }

  async clear(): Promise<void> {
    this.actions = [];
    await this.persist();
  }
}

export const OfflineQueue = new OfflineQueueService();
