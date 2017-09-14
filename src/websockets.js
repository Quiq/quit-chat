// @flow
import atmosphere from 'atmosphere.js';
import {ping} from './apiCalls';
import {formatQueryParams} from './Utils/utils';
import {getBurned} from './globals';
import * as storage from './storage';
import {version} from '../package.json';
import {MAX_SOCKET_CONNECTION_ATTEMPTS} from './appConstants';
import logger from './logging';
import type {
  AtmosphereRequest,
  AtmosphereResponse,
  AtmosphereConnection,
  AtmosphereConnectionBuilder,
  WebsocketCallbacks,
} from 'types';

let connection: AtmosphereConnection;
let callbacks: WebsocketCallbacks;
let connectionCount: number = 0;

const log = logger('AtmosphereWrapper');

const buildRequest = (socketUrl: string) => {
  const headers = {
    'X-Quiq-Line': '2',
    'X-Quiq-Client-Id': 'Quiq-Chat-Client',
    'X-Quiq-Client-Version': version,
  };
  if (storage.getAccessToken()) {
    // $FlowIssue - Flow doesn't like that we are adding an extra header
    headers['X-Quiq-Access-Token'] = storage.getAccessToken();
  }

  const parsedUrl = formatQueryParams(socketUrl, {
    trackingId: storage.getTrackingId() || 'noAssociatedTrackingId',
    quiqVersion: version,
  });

  return {
    url: `https://${parsedUrl}`,
    enableXDR: true,
    headers,
    contentType: 'application/json',
    logLevel: 'error',
    transport: 'websocket',
    fallbackTransport: 'long-polling',
    trackMessageLength: true,
    maxReconnectOnClose: 100,
    // Keep reconnectInterval at 10 seconds.  Otherwise if API-GW drops the atmosphere connection,
    // we will hammer them with onReconnect requests. See SER-2620
    reconnectInterval: 10000,
    onOpen,
    onClose,
    onReopen,
    onReconnect,
    onMessage,
    onTransportFailure,
    onError,
    onClientTimeout,
  };
};

export const connectSocket = (builder: AtmosphereConnectionBuilder) => {
  // Abort if we've been burned
  if (getBurned()) return;

  if (!storage.isStorageEnabled()) {
    if (callbacks.onFatalError) {
      callbacks.onFatalError();
    }

    throw new Error('Storage not enabled. Aborting execution');
  }

  // Check that maximum retries not exceeded; increment connection count
  if (connectionCount >= MAX_SOCKET_CONNECTION_ATTEMPTS) {
    if (callbacks.onFatalError) {
      callbacks.onFatalError();
    }

    throw new Error('Maximum socket connection attempts exceeded.');
  }
  connectionCount++;
  const {socketUrl, callbacks: websocketCallbacks} = builder;

  callbacks = websocketCallbacks;

  connection = {...atmosphere.subscribe(buildRequest(socketUrl))};
};

export const disconnectSocket = () => {
  atmosphere.unsubscribe();
};

// ******** Atmosphere callbacks *********
const onOpen = response => {
  // Carry the UUID. This is required if you want to call subscribe(request) again.
  connection.request.uuid = response.request.uuid;
  callbacks.onConnectionEstablish && callbacks.onConnectionEstablish();
};

const onReopen = () => {
  callbacks.onConnectionEstablish && callbacks.onConnectionEstablish();
};

const onReconnect = (req: AtmosphereRequest) => {
  // Long-polling doesn't clear up the error until it gets something back from the server
  // Force this to happen by sending a ping.
  clearTimeout(connection.pingTimeout);
  if (req.transport === 'long-polling') {
    connection.pingTimeout = setTimeout(() => {
      ping();
    }, connection.request.reconnectInterval + 5000);
  }
};

const onMessage = (res: AtmosphereResponse) => {
  let message;
  try {
    message = atmosphere.util.parseJSON(res.responseBody);
  } catch (e) {
    log.error('Error parsing Quiq websocket message'); // eslint-disable-line no-console
    return;
  }

  callbacks.onMessage && callbacks.onMessage(message);
};

const onTransportFailure = (errorMsg: string, req: AtmosphereRequest) => {
  callbacks.onTransportFailure && callbacks.onTransportFailure(errorMsg, req);
};

const onError = () => {
  callbacks.onConnectionLoss && callbacks.onConnectionLoss();
};

const onClientTimeout = () => {
  callbacks.onConnectionLoss && callbacks.onConnectionLoss();
};

const onClose = () => {
  callbacks.onClose && callbacks.onClose();
};
