import {getContactPoint} from '../globals';
import logger from '../logging';

const log = logger('Store Namespace Plugin');

// Store.js plugin to automatically namespace keys by contact point
// NOTE: Do not use arrow notation with this function, it must not be lexically bound to work with store.js
function contactPointNamespacePlugin() {
  const get = (superFunc, key) => {
    const ns = getContactPoint();
    if (!ns) return null;
    const namespacedValue = superFunc(`${key}_${ns}`);
    if (namespacedValue) return namespacedValue;

    // For backwards compatibility, if namespaced key wasn't found, try generic key.
    const genericValue = superFunc(key);
    if (genericValue) {
      // Delete this generic key and update to be namespaced
      this.remove(key, false);
      this.set(key, genericValue);
    }
    return genericValue;
  };

  const set = (superFunc, key, value) => {
    const ns = getContactPoint();
    if (!ns) {
      log.error(`Can't set key ${key} before global QuiqChatOptions have been set.`);
      return;
    }
    return superFunc(`${key}_${ns}`, value);
  };

  const remove = (superFunc, key, useContactPointNamespace = true) => {
    const ns = getContactPoint();
    if (!ns && useContactPointNamespace) {
      log.error(`Can't set key ${key} before global QuiqChatOptions have been set.`);
      return;
    }
    const postfix = useContactPointNamespace ? `_${ns}` : '';
    const modKey = `${key}${postfix}`;
    return superFunc(modKey);
  };

  return {get, set, remove};
}

export default contactPointNamespacePlugin;
