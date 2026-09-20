let stickyStore = null;

export function getStickyStore() {
  return stickyStore;
}

export function setStickyStore(store) {
  stickyStore = store;
}

export function resetStickyStore() {
  stickyStore = null;
}
