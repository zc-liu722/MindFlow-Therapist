const storage = globalThis.localStorage;

if (storage && typeof storage.getItem !== "function") {
  const memory = new Map();

  globalThis.localStorage = {
    get length() {
      return memory.size;
    },
    clear() {
      memory.clear();
    },
    getItem(key) {
      return memory.get(String(key)) ?? null;
    },
    key(index) {
      return Array.from(memory.keys())[index] ?? null;
    },
    removeItem(key) {
      memory.delete(String(key));
    },
    setItem(key, value) {
      memory.set(String(key), String(value));
    }
  };
}
