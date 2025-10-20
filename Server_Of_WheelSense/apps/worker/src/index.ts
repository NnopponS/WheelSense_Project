import pino from 'pino';
import { config as loadEnv } from 'dotenv';

loadEnv();

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

logger.info('Worker service placeholder running (implement Redis consumer here).');
