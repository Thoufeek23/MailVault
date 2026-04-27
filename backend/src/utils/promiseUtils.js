const pLimit = (concurrency) => {
  let activeCount = 0;
  const queue = [];

  const next = () => {
    if (activeCount >= concurrency) {
      return;
    }

    const item = queue.shift();
    if (!item) {
      return;
    }

    activeCount += 1;
    const { fn, resolve, reject } = item;

    Promise.resolve()
      .then(fn)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        activeCount -= 1;
        next();
      });
  };

  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
};

module.exports = {
  pLimit
};
