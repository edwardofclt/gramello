const mutations = new Set(['addEntry','updateEntry','removeEntry','saveGoals','addWater','removeWater','saveWaterGoal','importArchive','restorePrevious']);

// Keep read + native publication ordered. Widget failures never undo a diary save.
export function withWidgetRefresh<T extends object>(repository: T, publish: () => Promise<void>): T & { refreshWidgets: () => Promise<void> } {
  let queue = Promise.resolve();
  const refreshWidgets = () => {
    queue = queue.then(publish).catch(() => {});
    return queue;
  };
  return new Proxy(Object.assign({},repository,{refreshWidgets}), {
    get(target,key,receiver) {
      const value = Reflect.get(target,key,receiver);
      if (typeof key !== 'string' || !mutations.has(key) || typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        const result = await Reflect.apply(value,repository,args);
        await refreshWidgets();
        return result;
      };
    },
  });
}
