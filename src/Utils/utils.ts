import { UAParser } from 'ua-parser-js';
import QuiqSocket from '../services/QuiqSocketSingleton';
import qs from 'qs';
import logger from '../logging';
import StubbornFetch from 'stubborn-fetch';
import ChatState from '../State';
import UrlParser from 'url-parse';
import jstz from 'jstimezonedetect';
import { BrowserNames, BurnItDownResponse, ParsedUrl } from '../types';

const log = logger('Utils');

export const formatQueryParams = (url: string, params: Object): string => {
  if (url.includes('?')) {
    const splitUrl = url.split('?');
    return `${splitUrl[0]}?${qs.stringify(Object.assign({}, qs.parse(splitUrl[1]), params))}`;
  }

  return `${url}?${qs.stringify(params)}`;
};

const parser = new UAParser();
// @ts-ignore ua-parser does not enumerate it's browser names
export const getBrowserName = (): BrowserNames => parser.getResult().browser.name;
export const getMajor = (): number => parseFloat(parser.getResult().browser.major || '0');
export const isMobile = (): boolean => !!parser.getDevice().type;

export const isSupportedBrowser = () => {
  if (isMobile()) return true;

  const name = getBrowserName();
  const major = getMajor();

  if (name === 'Chrome' && major >= 43) return true;
  if (name === 'Firefox' && major >= 48) return true;
  if (name === 'Safari' && major >= 6.1) return true;
  if (name === 'Edge' && major >= 12) return true;
  if (name === 'IE' && major >= 10) return true;
  if (name === 'Opera' && major >= 13) return true;

  return false;
};

interface Timestamped {
  timestamp: number;
}
export const sortByTimestamp = <T extends Timestamped>(arr: Array<T>): Array<T> =>
  arr.slice().sort((a, b) => a.timestamp - b.timestamp);

let _onBurn: () => void;
export const registerOnBurnCallback = (onBurn: () => void) => {
  _onBurn = onBurn;
};

export const burnItDown = (message?: BurnItDownResponse) => {
  try {
    let timeToBurnItDown =
      message && !message.force && message.before ? message.before - new Date().getTime() : 0;
    if (timeToBurnItDown < 0) {
      timeToBurnItDown = 0;
    }

    setTimeout(() => {
      ChatState.burned = true;
      QuiqSocket.disconnect();
      StubbornFetch.disable();

      if (_onBurn) _onBurn();
      log.error('Webchat has been burned down.', {
        logOptions: { frequency: 'session', logFirstOccurrence: true },
      });
    }, timeToBurnItDown);
  } catch (e) {
    // Just in case something goes wrong while burning...
    // as a last ditch effort ensure we at least set burned status.
    ChatState.burned = true;
    log.error(`Error encountered while burning it down: ${e.message}`, {
      exception: e,
      logOptions: { frequency: 'session', logFirstOccurrence: true },
    });
  }
};

export const inLocalDevelopment = () =>
  !!window.location.hostname.match(/.*\.(centricient|quiq)\.dev/g);

export const getTenantFromHostname = (host: string): string => {
  const parts = host.split('.');
  return parts[0].replace('https://', '').replace('http://', '');
};

// This temporary code was borrowed from
// http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
export const createGuid = (): string => {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }

  return `${s4() + s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
};

/**
 * Creates a function that is restricted to allow only one invocation at a time. That is, if a function f is called while
 * a previous call to f is already running, the return value of the first invocation will be used as the return value for the second as well.
 * This is similar to throttling, except that we don't care about time between calls, only that the function never runs simultaneously.
 * @param f
 */
export const onceAtATime = <A, T>(f: (arg?: A) => Promise<T>): ((arg?: A) => Promise<T>) => {
  let currentPromise: Promise<T> | null = null;
  let promisePending = false;
  return (...args: any[]) => {
    if (promisePending && currentPromise) {
      return currentPromise;
    }
    currentPromise = f.apply(this, args);
    promisePending = true;
    currentPromise!
      .then(() => {
        promisePending = false;
      })
      .catch(() => {
        promisePending = false;
      });
    return currentPromise!;
  };
};

export const parseUrl = (url: string): ParsedUrl => {
  const parsedUrl = UrlParser(url, {});
  return {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    pathname: parsedUrl.pathname,
    protocol: parsedUrl.protocol,
    rawUrl: url,
  };
};

export const getTimezone = () => {
  try {
    // Safely tries to use Intl.DateTimeFormat().resolvedOptions().timeZone, falls back to its own lookup
    return jstz.determine().name();
  } catch (e) {} // tslint:disable-line no-empty
};
