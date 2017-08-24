// @flow
jest.mock('../apiCalls');
jest.mock('../websockets');
jest.mock('../storage');
jest.mock('store');
jest.mock('../utils');

import QuiqChatClient from '../QuiqChatClient';
import * as ApiCalls from '../apiCalls';
import * as storage from '../storage';
import {connectSocket, disconnectSocket} from '../websockets';
import {set} from 'store';
import {MINUTES_UNTIL_INACTIVE} from '../appConstants';
import * as stubbornFetch from '../stubbornFetch';
import * as Utils from '../utils';
import log from 'loglevel';

log.setLevel('debug');

const initialConvo = {
  id: 'testConvo',
  messages: [
    {
      authorType: 'Customer',
      text: 'Marco',
      id: 'msg1',
      timestamp: 1,
      type: 'Text',
    },
    {
      authorType: 'Agent',
      text: 'Polo',
      id: 'msg2',
      timestamp: 2,
      type: 'Text',
    },
  ],
};

const testTrackingId = 'dsafdsafaweufh';

describe('QuiqChatClient', () => {
  const onNewMessages = jest.fn();
  const onAgentTyping = jest.fn();
  const onError = jest.fn();
  const onErrorResolved = jest.fn();
  const onNewSession = jest.fn();
  const onConnectionStatusChange = jest.fn();
  const onBurn = jest.fn();
  const onRegistration = jest.fn();
  const onClientInactiveTimeout = jest.fn();
  const host = 'https://test.goquiq.fake';
  const contactPoint = 'test';
  const API = (ApiCalls: Object);
  const mockStore = (storage: any);
  const setClientInactive = jest.spyOn(stubbornFetch, 'setClientInactive');

  beforeEach(() => {
    API.fetchConversation.mockReturnValue(Promise.resolve(initialConvo));
    API.fetchWebsocketInfo.mockReturnValue({url: 'https://websocket.test', protocol: 'atmosphere'});
    mockStore.getQuiqChatContainerVisible.mockReturnValue(true);
    mockStore.getQuiqUserTakenMeaningfulAction.mockReturnValue(true);

    QuiqChatClient.initialize(host, contactPoint);
    QuiqChatClient.onNewMessages(onNewMessages);
    QuiqChatClient.onAgentTyping(onAgentTyping);
    QuiqChatClient.onError(onError);
    QuiqChatClient.onErrorResolved(onErrorResolved);
    QuiqChatClient.onConnectionStatusChange(onConnectionStatusChange);
    QuiqChatClient.onRegistration(onRegistration);
    QuiqChatClient.onNewSession(onNewSession);
    QuiqChatClient.onBurn(onBurn);
    QuiqChatClient.onClientInactiveTimeout(onClientInactiveTimeout);

    QuiqChatClient.start();
  });

  describe('start', () => {
    it('sets initialized flag to "true"', () => {
      expect(QuiqChatClient.initialized).toBe(true);
    });

    it('calls login', () => {
      expect(API.login).toBeCalled();
    });

    it('calls onNewMessages with the initial messages', () => {
      expect(onNewMessages).toBeCalledWith(initialConvo.messages);
    });

    it('tries to disconnect the websocket before making a new connection', () => {
      expect(disconnectSocket).toBeCalled();
    });

    it('connects the websocket', () => {
      expect(connectSocket).toBeCalled();
    });

    it('calls onConnectionStatusChange', () => {
      expect(onConnectionStatusChange).toBeCalledWith(true);
    });

    it('calls setClientInactive with false', () => {
      expect(setClientInactive).toBeCalledWith(false);
    });
  });

  describe('start with "initialized" set to true', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      QuiqChatClient.initialize(host, contactPoint);
      QuiqChatClient.onNewMessages(onNewMessages);
      QuiqChatClient.onAgentTyping(onAgentTyping);
      QuiqChatClient.onError(onError);
      QuiqChatClient.onErrorResolved(onErrorResolved);
      QuiqChatClient.onConnectionStatusChange(onConnectionStatusChange);
      QuiqChatClient.onRegistration(onRegistration);
      QuiqChatClient.onNewSession(onNewSession);
      QuiqChatClient.onBurn(onBurn);

      QuiqChatClient.initialized = true;

      QuiqChatClient.start();
    });

    it('does not call login', () => {
      expect(API.login).not.toBeCalled();
    });

    it('does not call onNewMessages', () => {
      expect(onNewMessages).not.toBeCalled();
    });

    it('does not try to disconnect the websocket before making a new connection', () => {
      expect(disconnectSocket).not.toBeCalled();
    });

    it('does not connect the websocket', () => {
      expect(connectSocket).not.toBeCalled();
    });

    it('does not call onConnectionStatusChange', () => {
      expect(onConnectionStatusChange).not.toBeCalled();
    });

    it('does not call setClientInactive', () => {
      expect(setClientInactive).not.toBeCalled();
    });
  });

  describe('start with an error', () => {
    beforeEach(() => {
      global.console.error = jest.fn();

      API.fetchWebsocketInfo.mockReturnValueOnce(Promise.reject({status: 405}));

      QuiqChatClient.initialize(host, contactPoint);
      QuiqChatClient.onNewMessages(onNewMessages);
      QuiqChatClient.onAgentTyping(onAgentTyping);
      QuiqChatClient.onError(onError);
      QuiqChatClient.onErrorResolved(onErrorResolved);
      QuiqChatClient.onConnectionStatusChange(onConnectionStatusChange);
      QuiqChatClient.onBurn(onBurn);

      QuiqChatClient.start();
    });

    it('calls disconnectSocket', () => {
      expect(disconnectSocket).toBeCalled();
      expect(onError).toBeCalledWith({status: 405});
    });
  });

  describe('start with non-retryable error', () => {
    beforeEach(() => {
      // Return a retryable error once
      API.fetchWebsocketInfo.mockReturnValueOnce(Promise.reject({status: 404}));

      QuiqChatClient.initialize(host, contactPoint);
      QuiqChatClient.onNewMessages(onNewMessages);
      QuiqChatClient.onAgentTyping(onAgentTyping);
      QuiqChatClient.onError(onError);
      QuiqChatClient.onErrorResolved(onErrorResolved);
      QuiqChatClient.onConnectionStatusChange(onConnectionStatusChange);
      QuiqChatClient.onBurn(onBurn);
      QuiqChatClient.start();
    });

    it('calls disconnectSocket', () => {
      expect(disconnectSocket).toBeCalled();
    });

    it('calls onError', () => {
      expect(onError).toBeCalledWith({status: 404});
    });
  });

  describe('stop', () => {
    beforeEach(() => {
      if (!QuiqChatClient) {
        throw new Error('Client should be defined');
      }

      QuiqChatClient.stop();
    });

    it('disconnects the websocket', () => {
      expect(disconnectSocket).toBeCalled();
    });

    it('sets initialzed flag to false', () => {
      expect(QuiqChatClient.initialized).toBe(false);
    });

    it('sets connected flag to false', () => {
      expect(QuiqChatClient.connected).toBe(false);
    });
  });

  describe('getting new messages', () => {
    const newMessage = {
      authorType: 'Customer',
      type: 'Text',
      id: 'msg3',
      timestamp: 3,
      text: 'blorp',
    };

    beforeEach(() => {
      if (!QuiqChatClient) {
        throw new Error('Client should be defined');
      }

      QuiqChatClient._handleWebsocketMessage({
        messageType: 'ChatMessage',
        tenantId: 'test',
        data: newMessage,
      });
    });

    it('calls onNewMessages', () => {
      expect(onNewMessages).lastCalledWith(initialConvo.messages.concat(newMessage));
    });
  });

  describe('handling new session', () => {
    describe('when no trackingId is defined, i.e., this is first session', () => {
      it('updates cached trackingId', () => {
        if (!QuiqChatClient) {
          throw new Error('Client should be defined');
        }

        QuiqChatClient._handleNewSession(testTrackingId);
        expect(QuiqChatClient.trackingId).toBe(testTrackingId);
      });

      it('does NOT fire new session callback', () => {
        if (!QuiqChatClient) {
          throw new Error('Client should be defined');
        }

        QuiqChatClient._handleNewSession(testTrackingId);
        expect(QuiqChatClient.callbacks.onNewSession).not.toHaveBeenCalled();
      });
    });

    describe('when trackingId has not changed, i.e. session was refreshed', () => {
      beforeEach(() => {
        if (!QuiqChatClient) {
          throw new Error('Client should be defined');
        }

        QuiqChatClient.trackingId = testTrackingId;
      });

      it('updates cached trackingId', () => {
        if (!QuiqChatClient) {
          throw new Error('Client should be defined');
        }

        QuiqChatClient._handleNewSession(testTrackingId);
        expect(QuiqChatClient.trackingId).toBe(testTrackingId);
      });

      it('does NOT fire new session callback', () => {
        if (!QuiqChatClient) {
          throw new Error('Client should be defined');
        }

        QuiqChatClient._handleNewSession(testTrackingId);
        expect(QuiqChatClient.callbacks.onNewSession).not.toHaveBeenCalled();
      });
    });

    describe('when trackingId has changed, i.e. new conversation', () => {
      beforeEach(() => {
        if (!QuiqChatClient) {
          throw new Error('Client should be defined');
        }

        QuiqChatClient.trackingId = 'oldId';
      });

      it('updates cached trackingId', async () => {
        if (!QuiqChatClient) {
          throw new Error('Client should be defined');
        }

        await QuiqChatClient._handleNewSession(testTrackingId);
        expect(QuiqChatClient.trackingId).toBe(testTrackingId);
      });

      it('does fire new session callback', () => {
        if (!QuiqChatClient) {
          throw new Error('Client should be defined');
        }

        QuiqChatClient._handleNewSession(testTrackingId);
        expect(QuiqChatClient.callbacks.onNewSession).toHaveBeenCalled();
      });
    });
  });

  describe('getting new Register event', () => {
    const newEvent = {type: 'Register', id: 'reg1', timestamp: 3};

    it('updates userIsRegistered', () => {
      if (!QuiqChatClient) {
        throw new Error('Client should be defined');
      }

      expect(QuiqChatClient.isRegistered()).toBe(false);
      QuiqChatClient._handleWebsocketMessage({
        messageType: 'ChatMessage',
        tenantId: 'test',
        data: newEvent,
      });
      expect(QuiqChatClient.isRegistered()).toBe(true);
      expect(onRegistration).toBeCalled();
    });
  });

  describe('getting typing indicator change', () => {
    beforeEach(() => {
      if (!QuiqChatClient) {
        throw new Error('Client should be defined');
      }

      QuiqChatClient._handleWebsocketMessage({
        messageType: 'ChatMessage',
        tenantId: 'test',
        data: {type: 'AgentTyping', typing: true},
      });
    });

    it('calls onAgentTyping', () => {
      expect(onAgentTyping).toBeCalledWith(true);
    });
  });

  describe('API wrappers', () => {
    afterEach(() => {
      set.mockClear();
    });

    describe('joinChat', () => {
      beforeEach(() => {
        if (!QuiqChatClient) {
          throw new Error('Client undefined');
        }

        QuiqChatClient.joinChat();
      });

      it('proxies call', () => {
        expect(API.joinChat).toBeCalled();
      });

      it('sets the quiq-chat-container-visible value to true', () => {
        expect(mockStore.setQuiqChatContainerVisible).toBeCalledWith(true);
      });
    });

    describe('isStorageEnabled', () => {
      it('returns the value of the quiq-chat-container-visible', () => {
        if (!QuiqChatClient) {
          throw new Error('Client undefined');
        }

        mockStore.isStorageEnabled.mockReturnValueOnce(false);
        expect(QuiqChatClient.isStorageEnabled()).toBe(false);
      });
    });

    describe('isChatVisible', () => {
      it('returns the value of the quiq-chat-container-visible value value', () => {
        if (!QuiqChatClient) {
          throw new Error('Client undefined');
        }

        mockStore.getQuiqChatContainerVisible.mockReturnValueOnce(false);
        expect(QuiqChatClient.isChatVisible()).toBe(false);
      });
    });

    describe('hasTakenMeaningfulAction', () => {
      beforeEach(() => {
        if (!QuiqChatClient) {
          throw new Error('Client should be defined');
        }
      });

      it('returns the value of the quiq-user-taken-meaningful-action value value', () => {
        if (!QuiqChatClient) {
          throw new Error('Client undefined');
        }

        mockStore.getQuiqUserTakenMeaningfulAction.mockReturnValueOnce(false);
        expect(QuiqChatClient.hasTakenMeaningfulAction()).toBe(false);
      });
    });

    describe('leaveChat', () => {
      beforeEach(() => {
        if (!QuiqChatClient) {
          throw new Error('Client undefined');
        }

        QuiqChatClient.leaveChat();
      });

      it('proxies call', () => {
        expect(API.leaveChat).toBeCalled();
      });

      it('sets the quiq-chat-container-visible value to false', () => {
        expect(mockStore.setQuiqChatContainerVisible).toBeCalledWith(false);
      });
    });

    describe('sendMessage', () => {
      beforeEach(() => {
        if (!QuiqChatClient) {
          throw new Error('Client undefined');
        }

        QuiqChatClient.sendMessage('text');
      });

      it('proxies call', () => {
        expect(API.addMessage).toBeCalledWith('text');
      });

      it('calls storage.setQuiqChatContainerVisible', () => {
        expect(mockStore.setQuiqChatContainerVisible).toBeCalledWith(true);
      });

      it('calls storage.setQuiqUserTakenMeaningfulAction', () => {
        expect(mockStore.setQuiqUserTakenMeaningfulAction).toBeCalledWith(true);
      });
    });

    describe('updateMessagePreview', () => {
      it('proxies call', () => {
        if (!QuiqChatClient) {
          throw new Error('Client undefined');
        }

        QuiqChatClient.updateMessagePreview('text', true);
        expect(API.updateMessagePreview).toBeCalledWith('text', true);
      });
    });

    describe('sendRegistration', () => {
      const data = {firstName: 'SpongeBob', lastName: 'SquarePants'};

      beforeEach(() => {
        if (!QuiqChatClient) {
          throw new Error('Client undefined');
        }

        QuiqChatClient.sendRegistration(data);
      });

      it('proxies call', () => {
        expect(API.sendRegistration).toBeCalledWith(data);
      });

      it('calls storage.setQuiqChatContainerVisible', () => {
        expect(mockStore.setQuiqChatContainerVisible).toBeCalledWith(true);
      });

      it('calls storage.setQuiqUserTakenMeaningfulAction', () => {
        expect(mockStore.setQuiqUserTakenMeaningfulAction).toBeCalledWith(true);
      });
    });
  });

  describe('client inactivity timeout', () => {
    beforeEach(() => {
      if (!QuiqChatClient) {
        throw new Error('Client should be defined');
      }
    });

    afterEach(() => {
      clearTimeout(QuiqChatClient.clientInactiveTimer);
    });

    it('initializes with a timer set', () => {
      expect(QuiqChatClient.clientInactiveTimer).toBeDefined();
    });

    it('sets a timer when registration sent', () => {
      QuiqChatClient.sendRegistration({firstName: 'SpongeBob', lastName: 'SquarePants'});
      expect(QuiqChatClient.clientInactiveTimer).toBeDefined();
    });

    it('sets a timer when message sent', () => {
      QuiqChatClient.sendMessage('ahoy');
      expect(QuiqChatClient.clientInactiveTimer).toBeDefined();
    });

    describe('timeout logic when timer expires', () => {
      beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        QuiqChatClient.stop = jest.fn();
        QuiqChatClient.leaveChat = jest.fn();
        QuiqChatClient._setTimeUntilInactive(MINUTES_UNTIL_INACTIVE);
      });

      it('times out after appConstants.MINUTES_UNTIL_INACTIVE minutes', () => {
        expect(setTimeout.mock.calls.length).toBe(1);
        expect(setTimeout.mock.calls[0][1]).toBe(MINUTES_UNTIL_INACTIVE * 60 * 1000 + 1000);
      });

      it('calls onClientInactiveTimeout callback', () => {
        expect(onClientInactiveTimeout).not.toBeCalled();
        jest.runAllTimers();
        expect(onClientInactiveTimeout).toBeCalled();
      });

      it('calls stop', () => {
        expect(QuiqChatClient.stop).not.toBeCalled();
        jest.runAllTimers();
        expect(QuiqChatClient.stop).toBeCalled();
      });

      it('no longer calls leaveChat', () => {
        expect(QuiqChatClient.leaveChat).not.toBeCalled();
        jest.runAllTimers();
        expect(QuiqChatClient.leaveChat).not.toBeCalled();
      });

      it('calls setClientInactive with true', () => {
        expect(setClientInactive).not.toBeCalled();
        jest.runAllTimers();
        expect(setClientInactive).toBeCalledWith(true);
      });
    });
  });

  describe('websocket message handling', () => {
    describe('BurnItDown message', () => {
      it('calls burnItDown', () => {
        const message = {
          messageType: 'BurnItDown',
          data: {before: 0, code: 466, force: true},
          tenantId: 'test',
        };
        client._handleWebsocketMessage(message);
        expect(Utils.burnItDown).toBeCalledWith(message.data);
      });

      it('fires onBurn callbasck', () => {
        expect(onBurn).toBeCalled();
      });
    });

    describe('ChatMessage', () => {
      describe('REGISTER', () => {
        beforeEach(() => {
          const message = {
            messageType: 'ChatMessage',
            tenantId: 'me!',
            data: {
              id: 'test',
              timestamp: 123,
              type: 'Register',
            },
          };
          client._handleWebsocketMessage(message);
        });

        it('sets meaningful action flag in local storage', () => {
          expect(storage.setQuiqUserTakenMeaningfulAction).toHaveBeenCalledWith(true);
        });
      });

      describe('TEXT', () => {
        beforeEach(() => {
          const message = {
            messageType: 'ChatMessage',
            tenantId: 'me!',
            data: {
              authorType: 'Agent',
              text: 'hello',
              id: 'id3',
              timestamp: 1234,
              type: 'Text',
            },
          };
          client._handleWebsocketMessage(message);
        });

        it('sets meaningful action flag in local storage', () => {
          expect(storage.setQuiqUserTakenMeaningfulAction).toHaveBeenCalledWith(true);
        });
      });
    });
  });
});
