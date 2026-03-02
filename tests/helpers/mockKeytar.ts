const store = new Map<string, Map<string, string>>();

export function getPassword(service: string, account: string): Promise<string | null> {
  return Promise.resolve(store.get(service)?.get(account) ?? null);
}

export function setPassword(service: string, account: string, password: string): Promise<void> {
  if (!store.has(service)) {
    store.set(service, new Map());
  }
  store.get(service)!.set(account, password);
  return Promise.resolve();
}

export function deletePassword(service: string, account: string): Promise<boolean> {
  const svc = store.get(service);
  if (!svc) return Promise.resolve(false);
  const deleted = svc.delete(account);
  return Promise.resolve(deleted);
}

export function findCredentials(
  service: string,
): Promise<Array<{ account: string; password: string }>> {
  const svc = store.get(service);
  if (!svc) return Promise.resolve([]);
  const creds = Array.from(svc.entries()).map(([account, password]) => ({ account, password }));
  return Promise.resolve(creds);
}

export function resetMockKeytar(): void {
  store.clear();
}
