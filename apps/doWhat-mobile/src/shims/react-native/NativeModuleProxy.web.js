const noop = () => undefined;

const proxyTarget = {
  addListener: noop,
  removeListeners: noop,
};

const proxy = new Proxy(proxyTarget, {
  get(target, prop) {
    if (prop in target) {
      return target[prop];
    }
    return noop;
  },
});

module.exports = proxy;
module.exports.default = proxy;
