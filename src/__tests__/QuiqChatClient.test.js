// @flow
jest.mock('../apiCalls');
jest.mock('../websockets');
jest.mock('js-cookie');
import QuiqChatClient from '../QuiqChatClient';
import * as ApiCalls from '../apiCalls';
import {connectSocket, disconnectSocket} from '../websockets';
import {set} from 'js-cookie';
import {quiqChatContinuationCookie} from '../appConstants';

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

describe('QuiqChatClient', () => {
  const onNewMessages = jest.fn();
  const onAgentTyping = jest.fn();
  const onError = jest.fn();
  const onErrorResolved = jest.fn();
  const onConnectionStatusChange = jest.fn();
  const host = 'https://test.goquiq.fake';
  const contactPoint = 'test';
  const API = (ApiCalls: Object);
  let client: ?QuiqChatClient;

  beforeEach(() => {
    API.fetchConversation.mockReturnValue(Promise.resolve(initialConvo));
    API.fetchWebsocketInfo.mockReturnValue({url: 'https://websocket.test'});

    client = new QuiqChatClient(host, contactPoint)
      .onNewMessages(onNewMessages)
      .onAgentTyping(onAgentTyping)
      .onError(onError)
      .onErrorResolved(onErrorResolved)
      .onConnectionStatusChange(onConnectionStatusChange);

    client.start();
  });

  describe('start', () => {
    it('calls onNewMessages with the initial messages', () => {
      expect(onNewMessages).toBeCalledWith(initialConvo.messages);
    });

    it('sets the continuation cookie', () => {
      const {id, expiration} = quiqChatContinuationCookie;
      expect(set).toBeCalledWith(id, 'true', {expires: expiration});
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

    it('calls onErrorResolved', () => {
      expect(onErrorResolved).toBeCalled();
    });
  });

  describe('start with retryable error', () => {
    beforeEach(() => {
      global.console.error = jest.fn();

      // Return a retryable error once
      API.fetchWebsocketInfo.mockReturnValueOnce(Promise.reject({status: 405}));

      client = new QuiqChatClient(host, contactPoint)
        .onNewMessages(onNewMessages)
        .onAgentTyping(onAgentTyping)
        .onError(onError)
        .onErrorResolved(onErrorResolved)
        .onConnectionStatusChange(onConnectionStatusChange);

      client.start();
    });

    it('calls disconnectSocket', () => {
      expect(disconnectSocket).toBeCalled();
    });

    it('tries again', () => {
      expect(connectSocket).toBeCalled();
      expect(onConnectionStatusChange).toBeCalledWith(true);
      expect(onErrorResolved).toBeCalled();
    });
  });

  describe('start with non-retryable error', () => {
    beforeEach(() => {
      // Return a retryable error once
      API.fetchWebsocketInfo.mockReturnValueOnce(Promise.reject({status: 404}));

      new QuiqChatClient(host, contactPoint)
        .onNewMessages(onNewMessages)
        .onAgentTyping(onAgentTyping)
        .onError(onError)
        .onErrorResolved(onErrorResolved)
        .onConnectionStatusChange(onConnectionStatusChange)
        .start();
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
      if (!client) {
        throw new Error('Client should be defined');
      }

      client.stop();
    });

    it('disconnects the websocket', () => {
      expect(disconnectSocket).toBeCalled();
    });
  });

  describe('getting new messages', () => {
    const newMessage = {type: 'Text', id: 'msg3', timestamp: 3, text: 'blorp'};

    beforeEach(() => {
      if (!client) {
        throw new Error('Client should be defined');
      }

      client._handleWebsocketMessage({
        messageType: 'ChatMessage',
        tenantId: 'test',
        data: newMessage,
      });
    });

    it('calls onNewMessages', () => {
      expect(onNewMessages).toBeCalledWith([...initialConvo.messages, newMessage]);
    });
  });

  describe('getting typing indicator change', () => {
    beforeEach(() => {
      if (!client) {
        throw new Error('Client should be defined');
      }

      client._handleWebsocketMessage({
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
    describe('joinChat', () => {
      it('proxies call', () => {
        if (!client) {
          throw new Error('Client undefined');
        }

        client.joinChat();
        expect(API.joinChat).toBeCalled();
      });
    });

    describe('leaveChat', () => {
      it('proxies call', () => {
        if (!client) {
          throw new Error('Client undefined');
        }

        client.leaveChat();
        expect(API.leaveChat).toBeCalled();
      });
    });

    describe('sendMessage', () => {
      it('proxies call', () => {
        if (!client) {
          throw new Error('Client undefined');
        }

        client.sendMessage('text');
        expect(API.addMessage).toBeCalledWith('text');
      });
    });

    describe('updateMessagePreview', () => {
      it('proxies call', () => {
        if (!client) {
          throw new Error('Client undefined');
        }

        client.updateMessagePreview('text', true);
        expect(API.updateMessagePreview).toBeCalledWith('text', true);
      });
    });

    describe('sendRegistration', () => {
      it('proxies call', () => {
        if (!client) {
          throw new Error('Client undefined');
        }
        const data = {firstName: 'SpongeBob', lastName: 'SquarePants'};

        client.sendRegistration(data);
        expect(API.sendRegistration).toBeCalledWith(data);
      });
    });
  });
});